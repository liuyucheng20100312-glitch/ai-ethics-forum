import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { loadEnvLocal } from "./env.mjs";

loadEnvLocal();

const DEFAULT_TENCENT_OCR_REGION = "ap-beijing";
const DEFAULT_TENCENT_OCR_TIMEOUT_MS = 120000;
const DEFAULT_TENCENT_OCR_MAX_PDF_PAGES = 30;
const DEFAULT_TENCENT_OCR_MAX_BASE64_MB = 10;
const DEFAULT_TENCENT_OCR_CACHE_ROOT = path.join(process.cwd(), "data", "ib", "derived", "ocr-cache");
const PROXY_ENV_KEYS = ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy"];
const OCR_CACHE_SCHEMA_VERSION = 5;
const CONTROL_CHAR_PATTERN = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;
const PRIVATE_USE_PATTERN = /[\ue000-\uf8ff]/g;
const REPLACEMENT_PATTERN = /\ufffd/g;
const PLACEHOLDER_SYMBOL_PATTERN = /[\u25a1\u25a0\u25a2\u25a3\u25c6\u25c7]/g;
const SUSPICIOUS_SEQUENCE_PATTERN =
  /(?:[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\ue000-\uf8ff]{2,}|[\u25a1\u25a0\u25a2\u25a3\u25c6\u25c7]{2,})/g;
const DEFAULT_MARKSCHEME_OCR_PROVIDER = "general_basic";
const DEFAULT_MARKSCHEME_FALLBACK_PROVIDER = "general_accurate";

let cachedTencentOcrClient = null;

function withTimeout(promise, timeoutMs, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(message)), timeoutMs);
    }),
  ]);
}

function sanitizeTencentText(text) {
  return String(text || "")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function dedupeTextLines(lines) {
  const uniqueLines = [];
  for (const rawLine of lines) {
    const line = sanitizeTencentText(rawLine);
    if (!line) {
      continue;
    }
    if (uniqueLines[uniqueLines.length - 1] === line) {
      continue;
    }
    uniqueLines.push(line);
  }
  return uniqueLines;
}

function buildPageText(textDetections) {
  return dedupeTextLines(
    (Array.isArray(textDetections) ? textDetections : []).map((item) => item?.DetectedText || "")
  ).join("\n");
}

function normalizePathKey(filePath) {
  return path.resolve(filePath).replace(/\\/g, "/").toLowerCase();
}

function countMatches(text, pattern) {
  return String(text || "").match(pattern)?.length || 0;
}

function ratio(count, total) {
  if (!total || total <= 0) {
    return 0;
  }
  return count / total;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function resolveMarkschemeOcrMode(rawValue, fallback = DEFAULT_MARKSCHEME_OCR_PROVIDER) {
  const normalized = String(rawValue || "")
    .trim()
    .toLowerCase();
  if (["basic", "general_basic", "printed", "generalbasicocr"].includes(normalized)) {
    return "general_basic";
  }
  if (["accurate", "general_accurate", "high", "generalaccurateocr"].includes(normalized)) {
    return "general_accurate";
  }
  if (["none", "off", "disabled"].includes(normalized)) {
    return "none";
  }
  return fallback;
}

function getMarkschemeOcrStrategy() {
  const primaryMode = resolveMarkschemeOcrMode(
    process.env.TENCENT_MARKSCHEME_OCR_PROVIDER,
    DEFAULT_MARKSCHEME_OCR_PROVIDER
  );
  const safePrimaryMode = primaryMode === "none" ? DEFAULT_MARKSCHEME_OCR_PROVIDER : primaryMode;
  return {
    primaryMode: safePrimaryMode,
    fallbackMode: resolveMarkschemeOcrMode(
      process.env.TENCENT_MARKSCHEME_FALLBACK_PROVIDER,
      DEFAULT_MARKSCHEME_FALLBACK_PROVIDER
    ),
  };
}

function getMarkschemeProviderLabel(mode) {
  if (mode === "general_basic") {
    return "tencent_edu_ocr_markscheme_basic";
  }
  if (mode === "general_accurate") {
    return "tencent_edu_ocr_markscheme_accurate";
  }
  return "tencent_edu_ocr_markscheme";
}

function evaluateTencentTextQuality(text) {
  const normalized = String(text || "");
  const totalChars = normalized.length;
  const controlCharCount = countMatches(normalized, CONTROL_CHAR_PATTERN);
  const privateUseCount = countMatches(normalized, PRIVATE_USE_PATTERN);
  const replacementCount = countMatches(normalized, REPLACEMENT_PATTERN);
  const placeholderSymbolCount = countMatches(normalized, PLACEHOLDER_SYMBOL_PATTERN);
  const suspiciousSequenceCount = countMatches(normalized, SUSPICIOUS_SEQUENCE_PATTERN);
  const suspiciousCharCount =
    controlCharCount + privateUseCount + replacementCount + placeholderSymbolCount;
  const suspiciousRatio = ratio(suspiciousCharCount, totalChars);
  const suspiciousSequenceRatio = ratio(suspiciousSequenceCount, Math.max(1, totalChars / 120));
  const qualityScore = clamp01(
    1 -
      suspiciousRatio * 12 -
      suspiciousSequenceRatio * 0.35 -
      (totalChars < 200 ? 0.08 : 0)
  );

  let level = "good";
  if (
    totalChars === 0 ||
    suspiciousRatio >= 0.01 ||
    controlCharCount >= 8 ||
    privateUseCount >= 10 ||
    suspiciousSequenceCount >= 3
  ) {
    level = "poor";
  } else if (
    suspiciousRatio >= 0.004 ||
    controlCharCount >= 3 ||
    privateUseCount >= 3 ||
    placeholderSymbolCount >= 6 ||
    suspiciousSequenceCount >= 1
  ) {
    level = "warn";
  }

  return {
    totalChars,
    controlCharCount,
    privateUseCount,
    replacementCount,
    placeholderSymbolCount,
    suspiciousSequenceCount,
    suspiciousCharCount,
    suspiciousRatio,
    suspiciousSequenceRatio,
    qualityScore,
    level,
  };
}

function shouldFallbackMarkschemePayload(payload) {
  if (!payload) {
    return true;
  }
  if ((payload.totalBlocks || 0) === 0) {
    return true;
  }
  return payload.quality?.level === "poor";
}

function isBetterMarkschemePayload(candidate, baseline) {
  if (!candidate) {
    return false;
  }
  if (!baseline) {
    return true;
  }
  if ((candidate.totalBlocks || 0) > (baseline.totalBlocks || 0)) {
    return true;
  }
  if ((candidate.quality?.qualityScore || 0) > (baseline.quality?.qualityScore || 0)) {
    return true;
  }
  if ((candidate.quality?.suspiciousCharCount || 0) < (baseline.quality?.suspiciousCharCount || 0)) {
    return true;
  }
  return false;
}

function isTencentPdfPageOutOfRangeError(error) {
  const code = String(error?.code || "");
  const message = String(error?.message || "");
  return (
    code === "InvalidParameterValue.InvalidParameterValueLimit" ||
    /PdfPageNumber\s*越界/i.test(message) ||
    /PdfPageNumber\s*out of range/i.test(message)
  );
}

function getTencentOcrConfig() {
  const secretId = String(process.env.TENCENT_SECRET_ID || "").trim();
  const secretKey = String(process.env.TENCENT_SECRET_KEY || "").trim();
  const region = String(process.env.TENCENT_OCR_REGION || DEFAULT_TENCENT_OCR_REGION).trim();
  const timeoutMs = Number(process.env.TENCENT_OCR_TIMEOUT_MS || DEFAULT_TENCENT_OCR_TIMEOUT_MS);
  const maxPdfPages = Number(
    process.env.TENCENT_OCR_MAX_PDF_PAGES || DEFAULT_TENCENT_OCR_MAX_PDF_PAGES
  );
  const maxBase64Mb = Number(
    process.env.TENCENT_OCR_MAX_BASE64_MB || DEFAULT_TENCENT_OCR_MAX_BASE64_MB
  );
  const bypassProxy = String(process.env.TENCENT_OCR_BYPASS_PROXY || "true").toLowerCase() !== "false";
  const cacheEnabled = String(process.env.TENCENT_OCR_CACHE_ENABLED || "true").toLowerCase() !== "false";
  const cacheRoot = String(process.env.IB_OCR_CACHE_ROOT || DEFAULT_TENCENT_OCR_CACHE_ROOT).trim();

  return {
    secretId,
    secretKey,
    region,
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_TENCENT_OCR_TIMEOUT_MS,
    maxPdfPages:
      Number.isFinite(maxPdfPages) && maxPdfPages > 0
        ? Math.min(Math.floor(maxPdfPages), DEFAULT_TENCENT_OCR_MAX_PDF_PAGES)
        : DEFAULT_TENCENT_OCR_MAX_PDF_PAGES,
    maxBase64Bytes:
      Number.isFinite(maxBase64Mb) && maxBase64Mb > 0
        ? Math.floor(maxBase64Mb * 1024 * 1024)
        : DEFAULT_TENCENT_OCR_MAX_BASE64_MB * 1024 * 1024,
    bypassProxy,
    cacheEnabled,
    cacheRoot,
  };
}

async function buildOcrCachePath(filePath, provider, options = {}) {
  const config = getTencentOcrConfig();
  const absolutePath = path.resolve(filePath);
  const stat = await fs.stat(absolutePath);
  const fileBuffer =
    options.fileBuffer instanceof Uint8Array ? Buffer.from(options.fileBuffer) : await fs.readFile(absolutePath);
  const contentHash = crypto.createHash("sha256").update(fileBuffer).digest("hex");
  const fingerprint = crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        provider,
        cacheSchemaVersion: OCR_CACHE_SCHEMA_VERSION,
        filePath: normalizePathKey(absolutePath),
        contentHash,
        size: stat.size,
        mtimeMs: stat.mtimeMs,
        materialType: String(options.materialType || "").toUpperCase(),
        maxPages: Number(options.maxPages || config.maxPdfPages),
        useNewModel: String(process.env.TENCENT_EDU_USE_NEW_MODEL || "false").toLowerCase(),
        markschemeOcrProvider: resolveMarkschemeOcrMode(process.env.TENCENT_MARKSCHEME_OCR_PROVIDER, ""),
        markschemeFallbackProvider: resolveMarkschemeOcrMode(
          process.env.TENCENT_MARKSCHEME_FALLBACK_PROVIDER,
          ""
        ),
      })
    )
    .digest("hex");
  return path.join(config.cacheRoot, `${fingerprint}.json`);
}

async function readOcrCache(filePath, provider, options = {}) {
  const config = getTencentOcrConfig();
  if (!config.cacheEnabled) {
    return null;
  }

  const cachePath = await buildOcrCachePath(filePath, provider, options);
  try {
    const content = await fs.readFile(cachePath, "utf8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}

async function writeOcrCache(filePath, provider, payload, options = {}) {
  const config = getTencentOcrConfig();
  if (!config.cacheEnabled) {
    return;
  }

  const cachePath = await buildOcrCachePath(filePath, provider, options);
  await fs.mkdir(path.dirname(cachePath), { recursive: true });
  await fs.writeFile(
    cachePath,
    JSON.stringify(
      {
        cachedAt: new Date().toISOString(),
        provider,
        payload,
      },
      null,
      2
    ),
    "utf8"
  );
}

export function hasTencentOcrCredentials() {
  const config = getTencentOcrConfig();
  return Boolean(config.secretId && config.secretKey);
}

async function getTencentOcrClient() {
  if (cachedTencentOcrClient) {
    return cachedTencentOcrClient;
  }

  const config = getTencentOcrConfig();
  if (!config.secretId || !config.secretKey) {
    throw new Error("Tencent OCR credentials are missing.");
  }

  const sdkModule = await import("tencentcloud-sdk-nodejs");
  const tencentcloud = sdkModule.default || sdkModule;
  const OcrClient = tencentcloud?.ocr?.v20181119?.Client;

  if (!OcrClient) {
    throw new Error("Tencent OCR client could not be resolved from tencentcloud-sdk-nodejs.");
  }

  cachedTencentOcrClient = new OcrClient({
    credential: {
      secretId: config.secretId,
      secretKey: config.secretKey,
    },
    region: config.region,
    profile: {
      httpProfile: {
        endpoint: "ocr.tencentcloudapi.com",
        reqTimeout: Math.ceil(config.timeoutMs / 1000),
      },
    },
  });

  return cachedTencentOcrClient;
}

async function requestPageOcr(client, imageBase64, pageNumber, timeoutMs, mode = "general_accurate") {
  const request =
    mode === "general_basic"
      ? client.GeneralBasicOCR({
          ImageBase64: imageBase64,
          IsPdf: true,
          PdfPageNumber: pageNumber,
        })
      : client.GeneralAccurateOCR({
          ImageBase64: imageBase64,
          IsPdf: true,
          PdfPageNumber: pageNumber,
          EnableDetectText: true,
        });
  const response = await withTimeout(
    request,
    timeoutMs,
    `Tencent ${mode} OCR timed out while processing page ${pageNumber}.`
  );

  const textDetections = Array.isArray(response?.TextDetections) ? response.TextDetections : [];
  return {
    pageNumber,
    mode,
    requestId: String(response?.RequestId || ""),
    pdfPageSize: Number(response?.PdfPageSize || 0),
    detectionCount: textDetections.length,
    text: buildPageText(textDetections),
    textDetections: textDetections.map((item) => ({
      text: sanitizeTencentText(item?.DetectedText || ""),
      x: Number(item?.Polygon?.[0]?.X || 0),
      y: Number(item?.Polygon?.[0]?.Y || 0),
      width: Number(item?.ItemPolygon?.Width || 0),
      height: Number(item?.ItemPolygon?.Height || 0),
    })),
  };
}

function collectQuestionObjects(node, bucket = []) {
  if (!node) {
    return bucket;
  }

  if (Array.isArray(node)) {
    for (const item of node) {
      collectQuestionObjects(item, bucket);
    }
    return bucket;
  }

  if (typeof node !== "object") {
    return bucket;
  }

  if (
    typeof node.QuestionText === "string" ||
    typeof node.QuestionTextNo === "string" ||
    typeof node.QuestionOptions === "string" ||
    typeof node.QuestionSubquestion === "string"
  ) {
    bucket.push(node);
  }

  for (const value of Object.values(node)) {
    collectQuestionObjects(value, bucket);
  }

  return bucket;
}

function collectQuestionElements(questionInfo) {
  const bucket = [];
  const resultLists = Array.isArray(questionInfo?.ResultList) ? questionInfo.ResultList : [];

  for (const result of resultLists) {
    const questions = Array.isArray(result?.Question) ? result.Question : [];
    for (const question of questions) {
      bucket.push({
        text: sanitizeTencentText(question?.Text || ""),
        groupType: sanitizeTencentText(question?.GroupType || ""),
        coord: question?.Coord || null,
        index: Number(question?.Index || 0),
      });
    }
  }

  return bucket;
}

function buildQuestionText(question, index) {
  const questionNo = sanitizeTencentText(question?.QuestionTextNo || `Q${index + 1}`);
  const questionText = sanitizeTencentText(question?.QuestionText || "");
  const options = sanitizeTencentText(question?.QuestionOptions || "");
  const subquestion = sanitizeTencentText(question?.QuestionSubquestion || "");
  const segments = [
    questionNo ? `${questionNo}.` : "",
    questionText,
    options ? `Options: ${options}` : "",
    subquestion ? `Subquestions: ${subquestion}` : "",
  ].filter(Boolean);
  return segments.join("\n").trim();
}

function looksLikeQuestionBlock(text) {
  const normalized = sanitizeTencentText(text);
  if (!normalized) {
    return false;
  }

  return (
    /(?:^|\n)\s*\d+\s*[\.\)]/i.test(normalized) ||
    /\[\s*maximum mark\s*:/i.test(normalized) ||
    /(?:^|\n)\s*\([a-zivx]+\)/i.test(normalized)
  );
}

function looksLikeMarkschemeBlock(text) {
  const normalized = sanitizeTencentText(text);
  if (!normalized) {
    return false;
  }

  return (
    /^Q\d+(?:\([a-zivx]+\))*\s*\nAnswer:\s*[A-D]$/im.test(normalized) ||
    /(?:^|\n)\s*\d+\.\s+[A-D](?:\s+\d+\.\s+[A-D])+/m.test(normalized) ||
    /(?:^|\n)\s*\d+\s*[\.\)](?=[^\n]*(?:\[\s*\d+\s*\]|\b(?:M|A|R|N|E)\d+\b))/m.test(normalized) ||
    /(?:^|\n)\s*\([a-zivx]+\)(?=[^\n]*(?:\[\s*\d+\s*\]|\b(?:M|A|R|N|E)\d+\b))/im.test(normalized) ||
    /\b(?:M|A|R|N|E)\d+\b/.test(normalized) ||
    /\[\s*\d+\s*\]/.test(normalized) ||
    /(?:accept|allow|ignore|do not accept|award)/i.test(normalized)
  );
}

function stripLeadingPageNoise(line) {
  return sanitizeTencentText(line)
    .replace(/^[-–—]?\s*\d+\s*[-–—]?\s*$/g, "")
    .replace(/^M\d{2}\/4\/[A-Z]+\/[A-Z0-9/]+$/i, "")
    .replace(/^SECTION\s+[A-Z]$/i, "")
    .trim();
}

function isRomanSegment(segment) {
  return /^(?:i|ii|iii|iv|v|vi|vii|viii|ix|x)$/i.test(segment);
}

function isAlphabeticSegment(segment) {
  return /^[a-z]$/i.test(segment) && !isRomanSegment(segment);
}

function formatMarkschemeLabel(questionNumber, segments = []) {
  const suffix = segments.map((segment) => `(${segment})`).join("");
  return `Q${questionNumber}${suffix}`;
}

function parseBracketSegments(text) {
  return [...String(text || "").matchAll(/\(([a-zivx]+)\)/gi)].map((match) => match[1].toLowerCase());
}

function parseLeadingBracketSegments(text) {
  const match = String(text || "").match(/^((?:\([a-zivx]+\)\s*)+)/i);
  return match ? parseBracketSegments(match[1]) : [];
}

function isMultipleChoiceAnswerLine(line) {
  return /(?:^|\s)\d+\.\s*[A-D](?=\s|$)/i.test(line) && line.match(/\d+\.\s*[A-D]/gi)?.length >= 3;
}

function buildMultipleChoiceBlocks(line) {
  return [...String(line || "").matchAll(/(\d+)\.\s*([A-D])/gi)].map((match) => ({
    label: `Q${match[1]}`,
    lines: [`Answer: ${match[2].toUpperCase()}`],
  }));
}

function normalizeMultipleChoiceAnswerToken(token) {
  const normalized = sanitizeTencentText(token).toUpperCase();
  if (/^[A-D]$/.test(normalized)) {
    return normalized;
  }
  if (["_", "-", "—", "二"].includes(normalized)) {
    return "";
  }
  return "";
}

function buildMultipleChoiceBlocksFromDetectionLayout(textDetections) {
  const tokens = (Array.isArray(textDetections) ? textDetections : [])
    .filter((item) => item?.text && item.x > 0 && item.y > 0)
    .filter(
      (item) =>
        /^\d+\.$/.test(item.text) ||
        ["A", "B", "C", "D", "_", "-", "—", "二"].includes(item.text.toUpperCase())
    )
    .sort((left, right) => (left.y === right.y ? left.x - right.x : left.y - right.y));

  if (tokens.length === 0) {
    return [];
  }

  const rows = [];
  for (const token of tokens) {
    const currentRow = rows[rows.length - 1];
    if (!currentRow || Math.abs(currentRow.y - token.y) > 18) {
      rows.push({ y: token.y, items: [token] });
      continue;
    }
    currentRow.items.push(token);
  }

  const blocks = [];
  for (const row of rows) {
    const items = row.items.sort((left, right) => left.x - right.x);
    for (let index = 0; index < items.length - 1; index += 1) {
      const numberToken = items[index];
      const answerToken = items[index + 1];
      if (!/^\d+\.$/.test(numberToken.text)) {
        continue;
      }
      const answer = normalizeMultipleChoiceAnswerToken(answerToken.text);
      if (!answer) {
        continue;
      }
      blocks.push({
        label: `Q${numberToken.text.replace(".", "")}`,
        lines: [`Answer: ${answer}`],
      });
      index += 1;
    }
  }

  return blocks;
}

function looksLikeMarkschemeInstructionLine(line) {
  return /(?:markscheme often|alternative answer|candidate'?s answer|question specifically asks|property of the international baccalaureate|mark allocation|subject details|ignore missing|if a question|if the candidate|award \[\d+\] if structure is drawn without brackets)/i.test(
    line
  );
}

function isActualMarkschemeAnchor(line) {
  const normalized = sanitizeTencentText(line);
  if (!normalized) {
    return false;
  }

  if (isMultipleChoiceAnswerLine(normalized)) {
    return true;
  }

  if (looksLikeMarkschemeInstructionLine(normalized)) {
    return false;
  }

  if (/^\d+\s*\.\s*(?:\([a-zivx]+\))+/i.test(normalized)) {
    return true;
  }

  if (/^\d+\s*\.\s*.+\[\s*\d+(?:\s*max)?\s*\]/i.test(normalized)) {
    return true;
  }

  if (/^\d+\s*\.\s*.+\b(?:M|A|R|N|E)\d+\b/i.test(normalized)) {
    return true;
  }

  return false;
}

function normalizeSubquestionSegments(currentSegments, parsedSegments) {
  if (parsedSegments.length === 0) {
    return currentSegments;
  }

  const first = parsedSegments[0];
  if (isAlphabeticSegment(first)) {
    return parsedSegments;
  }

  if (isRomanSegment(first)) {
    const parentAlpha = currentSegments.find((segment) => isAlphabeticSegment(segment));
    if (parentAlpha) {
      return [parentAlpha, ...parsedSegments];
    }
  }

  return parsedSegments;
}

function parseMarkschemeAnchor(line, currentQuestionNumber, currentSegments) {
  const normalized = stripLeadingPageNoise(line);
  if (!normalized) {
    return null;
  }

  if (isMultipleChoiceAnswerLine(normalized)) {
    return {
      type: "multiple_choice",
      blocks: buildMultipleChoiceBlocks(normalized),
    };
  }

  const questionMatch = normalized.match(/^(\d+)\s*\.\s*(.*)$/);
  if (questionMatch) {
    const questionNumber = Number(questionMatch[1]);
    const rest = sanitizeTencentText(questionMatch[2] || "");
    const segments = parseLeadingBracketSegments(rest);

    if (!isActualMarkschemeAnchor(normalized)) {
      return null;
    }

    const strippedText = sanitizeTencentText(rest.replace(/^(?:\([a-zivx]+\)\s*)+/i, ""));
    return {
      type: "question",
      questionNumber,
      segments,
      label: formatMarkschemeLabel(questionNumber, segments),
      text: strippedText,
    };
  }

  const subquestionMatch = normalized.match(/^((?:\([a-zivx]+\)\s*)+)(.*)$/i);
  if (subquestionMatch && currentQuestionNumber) {
    const parsedSegments = parseBracketSegments(subquestionMatch[1]);
    const segments = normalizeSubquestionSegments(currentSegments, parsedSegments);
    return {
      type: "subquestion",
      questionNumber: currentQuestionNumber,
      segments,
      label: formatMarkschemeLabel(currentQuestionNumber, segments),
      text: sanitizeTencentText(subquestionMatch[2] || ""),
    };
  }

  return null;
}

function finalizeMarkschemeBlock(block) {
  if (!block || !block.label) {
    return "";
  }

  const text = sanitizeTencentText([block.label, ...block.lines].filter(Boolean).join("\n"));
  return looksLikeMarkschemeBlock(text) ? text : "";
}

function buildMarkschemeBlocksFromPageText(text, state = {}, textDetections = []) {
  const normalized = sanitizeTencentText(text);
  if (!normalized) {
    return {
      blocks: [],
      state: {
        questionNumber: state.questionNumber || null,
        segments: Array.isArray(state.segments) ? state.segments : [],
      },
    };
  }

  const lines = normalized
    .split("\n")
    .map((line) => stripLeadingPageNoise(line))
    .filter(Boolean);

  const blocks = [];
  let currentBlock = null;
  let currentQuestionNumber = state.questionNumber || null;
  let currentSegments = Array.isArray(state.segments) ? [...state.segments] : [];

  for (const line of lines) {
    const anchor = parseMarkschemeAnchor(line, currentQuestionNumber, currentSegments);

    if (anchor?.type === "multiple_choice") {
      const finalized = finalizeMarkschemeBlock(currentBlock);
      if (finalized) {
        blocks.push(finalized);
      }
      currentBlock = null;
      currentQuestionNumber = null;
      currentSegments = [];
      blocks.push(
        ...anchor.blocks
          .map((block) => finalizeMarkschemeBlock(block))
          .filter(Boolean)
      );
      continue;
    }

    if (anchor?.type === "question" || anchor?.type === "subquestion") {
      const finalized = finalizeMarkschemeBlock(currentBlock);
      if (finalized) {
        blocks.push(finalized);
      }

      currentQuestionNumber = anchor.questionNumber;
      currentSegments = anchor.segments;
      currentBlock = {
        label: anchor.label,
        lines: anchor.text ? [anchor.text] : [],
      };
      continue;
    }

    if (!currentBlock) {
      continue;
    }

    currentBlock.lines.push(line);
  }

  const finalized = finalizeMarkschemeBlock(currentBlock);
  if (finalized) {
    blocks.push(finalized);
  }

  if (blocks.length === 0) {
    blocks.push(
      ...buildMultipleChoiceBlocksFromDetectionLayout(textDetections)
        .map((block) => finalizeMarkschemeBlock(block))
        .filter(Boolean)
    );
  }

  return {
    blocks: dedupeTextLines(blocks),
    state: {
      questionNumber: currentQuestionNumber,
      segments: currentSegments,
    },
  };
}

function buildQuestionSplitPageText(response) {
  const questionInfoList = Array.isArray(response?.QuestionInfo) ? response.QuestionInfo : [];
  const questionElements = questionInfoList.flatMap((questionInfo) => collectQuestionElements(questionInfo));
  const questionObjects = collectQuestionObjects(response?.QuestionInfo || []);
  const rawBlocks = dedupeTextLines([
    ...questionElements.map((item) => item.text).filter(Boolean),
    ...questionObjects.map((question, index) => buildQuestionText(question, index)).filter(Boolean),
  ]);
  const blocks = rawBlocks.filter((block) => looksLikeQuestionBlock(block));

  return {
    questionCount: blocks.length,
    blocks,
    text: blocks.join("\n\n").trim(),
  };
}

async function requestQuestionSplitPage(client, imageBase64, pageNumber, timeoutMs, useNewModel) {
  const response = await withTimeout(
    client.QuestionSplitOCR({
      ImageBase64: imageBase64,
      IsPdf: true,
      PdfPageNumber: pageNumber,
      EnableImageCrop: true,
      EnableOnlyDetectBorder: false,
      UseNewModel: useNewModel,
    }),
    timeoutMs,
    `Tencent QuestionSplitOCR timed out while processing page ${pageNumber}.`
  );

  const page = buildQuestionSplitPageText(response);
  return {
    pageNumber,
    requestId: String(response?.RequestId || ""),
    mode: "question_split",
    questionCount: page.questionCount,
    blockCount: page.blocks.length,
    text: page.text,
  };
}

async function withTencentProxyBypass(enabled, task) {
  if (!enabled) {
    return task();
  }

  const snapshot = new Map(PROXY_ENV_KEYS.map((key) => [key, process.env[key]]));

  try {
    for (const key of PROXY_ENV_KEYS) {
      delete process.env[key];
    }
    return await task();
  } finally {
    for (const [key, value] of snapshot.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

export async function extractPdfTextWithTencentOcr(filePath, options = {}) {
  const absolutePath = path.resolve(filePath);
  const fileBuffer = await fs.readFile(absolutePath);
  const cached = await readOcrCache(filePath, "tencent_ocr", {
    ...options,
    fileBuffer,
  });
  if (cached?.payload) {
    return cached.payload;
  }

  const config = getTencentOcrConfig();
  if (!config.secretId || !config.secretKey) {
    throw new Error("Tencent OCR credentials are not configured.");
  }

  const imageBase64 = fileBuffer.toString("base64");
  const base64Bytes = Buffer.byteLength(imageBase64, "utf8");

  if (base64Bytes > config.maxBase64Bytes) {
    throw new Error(
      `File ${path.basename(
        absolutePath
      )} exceeds Tencent OCR base64 size limit (${base64Bytes} bytes > ${config.maxBase64Bytes} bytes).`
    );
  }

  const client = await getTencentOcrClient();
  const timeoutMs = Number(options.timeoutMs || config.timeoutMs);
  const maxPages = Number(options.maxPages || config.maxPdfPages);
  const firstPage = await withTencentProxyBypass(config.bypassProxy, () =>
    requestPageOcr(client, imageBase64, 1, timeoutMs)
  );
  const detectedPdfPageSize = firstPage.pdfPageSize > 0 ? firstPage.pdfPageSize : 1;
  const pages = [firstPage];
  const stopOnOcrFailed = detectedPdfPageSize <= 1;
  const pageUpperBound = detectedPdfPageSize > 1 ? Math.min(detectedPdfPageSize, maxPages) : maxPages;
  let stopReason = detectedPdfPageSize > 1 ? "reported_page_count" : "ocr_failure_or_max_pages";

  for (let pageNumber = 2; pageNumber <= pageUpperBound; pageNumber += 1) {
    try {
      const page = await withTencentProxyBypass(config.bypassProxy, () =>
        requestPageOcr(client, imageBase64, pageNumber, timeoutMs)
      );
      pages.push(page);
    } catch (error) {
      const errorCode = String(error?.code || "");
      if (stopOnOcrFailed && errorCode === "FailedOperation.OcrFailed") {
        stopReason = "ocr_failed_after_last_page";
        break;
      }
      throw error;
    }
  }

  const text = pages
    .map((page) => {
      const pageText = sanitizeTencentText(page.text);
      return pageText ? `[Page ${page.pageNumber}]\n${pageText}` : `[Page ${page.pageNumber}]`;
    })
    .join("\n\n")
    .trim();

  const payload = {
    text,
    provider: "tencent_ocr",
    totalPages: pages.length,
    detectedPdfPageSize,
    truncated:
      (detectedPdfPageSize > 1 && pages.length < detectedPdfPageSize) ||
      (detectedPdfPageSize <= 1 && pages.length >= maxPages),
    stopReason,
    base64Bytes,
    fileSizeBytes: fileBuffer.byteLength,
    pages: pages.map((page) => ({
      pageNumber: page.pageNumber,
      detectionCount: page.detectionCount,
      requestId: page.requestId,
      textLength: page.text.length,
    })),
  };
  await writeOcrCache(filePath, "tencent_ocr", payload, {
    ...options,
    fileBuffer,
  });
  return payload;
}

async function extractMarkschemeTextWithTencentPageOcr(
  client,
  imageBase64,
  timeoutMs,
  maxPages,
  config,
  mode
) {
  const pages = [];
  const maxLeadingEmptyPages = Number(process.env.TENCENT_EDU_MAX_LEADING_EMPTY_PAGES || "4");
  const maxTrailingEmptyPages = Number(process.env.TENCENT_EDU_MAX_TRAILING_EMPTY_PAGES || "2");
  let stopReason = "ocr_failure_or_max_pages";
  let foundContent = false;
  let leadingEmptyPages = 0;
  let trailingEmptyPages = 0;
  let markschemeState = {
    questionNumber: null,
    segments: [],
  };

  for (let pageNumber = 1; pageNumber <= maxPages; pageNumber += 1) {
    try {
      const page = await withTencentProxyBypass(config.bypassProxy, async () => {
        const rawPage = await requestPageOcr(client, imageBase64, pageNumber, timeoutMs, mode);
        const parsedPage = buildMarkschemeBlocksFromPageText(
          rawPage.text,
          markschemeState,
          rawPage.textDetections
        );
        markschemeState = parsedPage.state;
        const blocks = parsedPage.blocks;
        return {
          pageNumber,
          requestId: rawPage.requestId,
          ocrMode: rawPage.mode,
          detectionCount: rawPage.detectionCount,
          questionCount: blocks.length,
          blockCount: blocks.length,
          text: blocks.join("\n\n").trim(),
          rawTextLength: rawPage.text.length,
        };
      });

      if (!page.text) {
        if (!foundContent) {
          leadingEmptyPages += 1;
          if (leadingEmptyPages >= maxLeadingEmptyPages) {
            stopReason = "leading_empty_pages_limit";
            break;
          }
          continue;
        }

        trailingEmptyPages += 1;
        if (trailingEmptyPages >= maxTrailingEmptyPages) {
          stopReason = "empty_page_after_content";
          break;
        }
        continue;
      }

      foundContent = true;
      trailingEmptyPages = 0;
      pages.push(page);
    } catch (error) {
      const errorCode = String(error?.code || "");
      if (isTencentPdfPageOutOfRangeError(error)) {
        stopReason = pages.length > 0 ? "page_out_of_range_after_last_page" : "page_out_of_range_before_content";
        break;
      }
      if (errorCode === "FailedOperation.OcrFailed" && pages.length > 0) {
        stopReason = "ocr_failed_after_last_page";
        break;
      }
      if (errorCode === "FailedOperation.OcrFailed" && !foundContent) {
        stopReason = "ocr_failed_before_content";
        break;
      }
      throw error;
    }
  }

  const text = pages
    .map((page) => {
      const pageText = sanitizeTencentText(page.text);
      return pageText ? `[Page ${page.pageNumber}]\n${pageText}` : `[Page ${page.pageNumber}]`;
    })
    .join("\n\n")
    .trim();

  return {
    text,
    provider: getMarkschemeProviderLabel(mode),
    totalPages: pages.length,
    totalBlocks: pages.reduce((sum, page) => sum + Number(page.blockCount || 0), 0),
    detectedPdfPageSize: 0,
    truncated: pages.length >= maxPages,
    stopReason,
    quality: evaluateTencentTextQuality(text),
    pages: pages.map((page) => ({
      pageNumber: page.pageNumber,
      ocrMode: page.ocrMode,
      detectionCount: page.detectionCount,
      questionCount: page.questionCount,
      blockCount: page.blockCount,
      requestId: page.requestId,
      textLength: page.text.length,
      rawTextLength: page.rawTextLength,
    })),
  };
}

export async function extractPdfTextWithTencentEduOcr(filePath, options = {}) {
  const isMarkscheme = String(options.materialType || "").toUpperCase() === "MARK_SCHEME";
  const markschemeStrategy = getMarkschemeOcrStrategy();
  const provider = isMarkscheme
    ? getMarkschemeProviderLabel(markschemeStrategy.primaryMode)
    : "tencent_edu_ocr";
  const absolutePath = path.resolve(filePath);
  const fileBuffer = await fs.readFile(absolutePath);
  const cached = await readOcrCache(filePath, provider, {
    ...options,
    fileBuffer,
  });
  if (cached?.payload) {
    return cached.payload;
  }
  if (isMarkscheme) {
    const legacyCached = await readOcrCache(filePath, "tencent_edu_ocr_markscheme", {
      ...options,
      fileBuffer,
    });
    if (legacyCached?.payload) {
      return legacyCached.payload;
    }
  }

  const config = getTencentOcrConfig();
  if (!config.secretId || !config.secretKey) {
    throw new Error("Tencent OCR credentials are not configured.");
  }
  const imageBase64 = fileBuffer.toString("base64");
  const base64Bytes = Buffer.byteLength(imageBase64, "utf8");

  if (base64Bytes > config.maxBase64Bytes) {
    throw new Error(
      `File ${path.basename(
        absolutePath
      )} exceeds Tencent OCR base64 size limit (${base64Bytes} bytes > ${config.maxBase64Bytes} bytes).`
    );
  }

  const client = await getTencentOcrClient();
  const timeoutMs = Number(options.timeoutMs || config.timeoutMs);
  const maxPages = Number(options.maxPages || config.maxPdfPages);
  const useNewModel = String(process.env.TENCENT_EDU_USE_NEW_MODEL || "false").toLowerCase() === "true";

  if (isMarkscheme) {
    const primaryPayload = await extractMarkschemeTextWithTencentPageOcr(
      client,
      imageBase64,
      timeoutMs,
      maxPages,
      config,
      markschemeStrategy.primaryMode
    );
    let selectedPayload = primaryPayload;
    let fallbackPayload = null;

    if (
      markschemeStrategy.fallbackMode !== "none" &&
      markschemeStrategy.fallbackMode !== markschemeStrategy.primaryMode &&
      shouldFallbackMarkschemePayload(selectedPayload)
    ) {
      fallbackPayload = await extractMarkschemeTextWithTencentPageOcr(
        client,
        imageBase64,
        timeoutMs,
        maxPages,
        config,
        markschemeStrategy.fallbackMode
      );
      if (isBetterMarkschemePayload(fallbackPayload, selectedPayload)) {
        selectedPayload = fallbackPayload;
      }
    }

    const payload = {
      ...selectedPayload,
      base64Bytes,
      fileSizeBytes: fileBuffer.byteLength,
      markschemePrimaryProvider: getMarkschemeProviderLabel(markschemeStrategy.primaryMode),
      markschemeFallbackProvider:
        fallbackPayload?.provider ||
        (markschemeStrategy.fallbackMode === "none"
          ? "none"
          : getMarkschemeProviderLabel(markschemeStrategy.fallbackMode)),
      markschemeFallbackTriggered: Boolean(fallbackPayload),
      markschemePrimaryQuality: primaryPayload.quality,
      markschemeSelectedProvider: selectedPayload.provider,
    };
    await writeOcrCache(filePath, provider, payload, {
      ...options,
      fileBuffer,
    });
    return payload;
  }

  const pages = [];
  const maxLeadingEmptyPages = Number(process.env.TENCENT_EDU_MAX_LEADING_EMPTY_PAGES || "4");
  const maxTrailingEmptyPages = Number(process.env.TENCENT_EDU_MAX_TRAILING_EMPTY_PAGES || "2");
  let stopReason = "ocr_failure_or_max_pages";
  let foundContent = false;
  let leadingEmptyPages = 0;
  let trailingEmptyPages = 0;

  for (let pageNumber = 1; pageNumber <= maxPages; pageNumber += 1) {
    try {
      const page = await withTencentProxyBypass(config.bypassProxy, () =>
        requestQuestionSplitPage(client, imageBase64, pageNumber, timeoutMs, useNewModel)
      );
      if (!page.text) {
        if (!foundContent) {
          leadingEmptyPages += 1;
          if (leadingEmptyPages >= maxLeadingEmptyPages) {
            stopReason = "leading_empty_pages_limit";
            break;
          }
          continue;
        }

        trailingEmptyPages += 1;
        if (trailingEmptyPages >= maxTrailingEmptyPages) {
          stopReason = "empty_page_after_content";
          break;
        }
        continue;
      }

      foundContent = true;
      trailingEmptyPages = 0;
      pages.push(page);
    } catch (error) {
      const errorCode = String(error?.code || "");
      if (isTencentPdfPageOutOfRangeError(error)) {
        stopReason = pages.length > 0 ? "page_out_of_range_after_last_page" : "page_out_of_range_before_content";
        break;
      }
      if (errorCode === "FailedOperation.OcrFailed" && pages.length > 0) {
        stopReason = "ocr_failed_after_last_page";
        break;
      }
      if (errorCode === "FailedOperation.OcrFailed" && !foundContent) {
        stopReason = "ocr_failed_before_content";
        break;
      }
      throw error;
    }
  }

  const text = pages
    .map((page) => {
      const pageText = sanitizeTencentText(page.text);
      return pageText ? `[Page ${page.pageNumber}]\n${pageText}` : `[Page ${page.pageNumber}]`;
    })
    .join("\n\n")
    .trim();

  const payload = {
    text,
    provider,
    totalPages: pages.length,
    detectedPdfPageSize: 0,
    truncated: pages.length >= maxPages,
    stopReason,
    base64Bytes,
    fileSizeBytes: fileBuffer.byteLength,
    pages: pages.map((page) => ({
      pageNumber: page.pageNumber,
      questionCount: page.questionCount,
      blockCount: page.blockCount,
      requestId: page.requestId,
      textLength: page.text.length,
    })),
  };
  await writeOcrCache(filePath, provider, payload, {
    ...options,
    fileBuffer,
  });
  return payload;
}
