import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { loadEnvLocal } from "./env.mjs";
import {
  extractPdfTextWithTencentEduOcr,
  extractPdfTextWithTencentOcr,
  hasTencentOcrCredentials,
} from "./tencent-ocr.mjs";

loadEnvLocal();

const CONTROL_CHAR_PATTERN = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;
const PRIVATE_USE_PATTERN = /[\ue000-\uf8ff]/g;
const REPLACEMENT_PATTERN = /\ufffd/g;
const PLACEHOLDER_SYMBOL_PATTERN = /[\u25a1\u25a0\u25a2\u25a3\u25c6\u25c7]/g;
const SUSPICIOUS_SEQUENCE_PATTERN =
  /(?:[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\ue000-\uf8ff]{2,}|[\u25a1\u25a0\u25a2\u25a3\u25c6\u25c7]{2,})/g;

function countMatches(text, pattern) {
  return text.match(pattern)?.length || 0;
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

function sanitizeRecoveredText(text) {
  return String(text || "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ")
    .replace(/[\ue000-\uf8ff]/g, " ")
    .replace(/[\u25a1\u25a0\u25a2\u25a3\u25c6\u25c7]/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function splitTextForModelRepair(text, maxChars = 5200, overlap = 280) {
  const normalized = String(text || "").replace(/\r/g, "");
  if (!normalized) {
    return [];
  }

  const chunks = [];
  let cursor = 0;

  while (cursor < normalized.length) {
    let end = Math.min(normalized.length, cursor + maxChars);
    if (end < normalized.length) {
      const nearbyBoundary = normalized.lastIndexOf("\n\n", end);
      const nearbyLineBreak = normalized.lastIndexOf("\n", end);
      const boundary = nearbyBoundary > cursor + 1600 ? nearbyBoundary : nearbyLineBreak;
      if (boundary > cursor + 1200) {
        end = boundary;
      }
    }

    chunks.push(normalized.slice(cursor, end).trim());
    if (end >= normalized.length) {
      break;
    }
    cursor = Math.max(end - overlap, cursor + 1);
  }

  return chunks.filter(Boolean);
}

function mergeRepairedSegments(segments) {
  if (segments.length === 0) {
    return "";
  }

  let merged = segments[0];
  for (let index = 1; index < segments.length; index += 1) {
    const segment = segments[index];
    const tail = merged.slice(-320);
    const overlapLength = Math.min(tail.length, segment.length, 240);
    let matched = false;

    for (let length = overlapLength; length >= 80; length -= 20) {
      if (tail.slice(-length) === segment.slice(0, length)) {
        merged += segment.slice(length);
        matched = true;
        break;
      }
    }

    if (!matched) {
      merged += `\n${segment}`;
    }
  }

  return merged.trim();
}

async function loadOptionalModule(name) {
  try {
    return await import(name);
  } catch {
    throw new Error(`Missing dependency "${name}". Install it before running this script.`);
  }
}

async function extractPdfTextWithPdfParse(filePath) {
  const pdfParseModule = await loadOptionalModule("pdf-parse");
  const fileBuffer = await fs.readFile(filePath);

  if (typeof pdfParseModule.default === "function") {
    const result = await pdfParseModule.default(fileBuffer);
    return result.text || "";
  }

  if (typeof pdfParseModule.PDFParse === "function") {
    const parser = new pdfParseModule.PDFParse({ data: fileBuffer });
    try {
      const result = await parser.getText();
      return result.text || "";
    } finally {
      await parser.destroy?.();
    }
  }

  throw new Error("pdf-parse did not expose a supported parser.");
}

function getStudyAssistantApiKey() {
  return (
    process.env.STUDY_ASSISTANT_API_KEY ||
    process.env.ALIBABA_BAILIAN_API_KEY ||
    process.env.DASHSCOPE_API_KEY ||
    ""
  );
}

function getStudyAssistantApiUrl() {
  return (
    process.env.STUDY_ASSISTANT_API_URL ||
    "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions"
  );
}

function getStudyAssistantModelId() {
  return (
    process.env.STUDY_ASSISTANT_MODEL_ID ||
    process.env.ALIBABA_BAILIAN_MODEL_ID ||
    "qwen-plus"
  );
}

async function callStudyAssistantRepair(prompt, requestLabel) {
  const apiKey = getStudyAssistantApiKey();
  if (!apiKey) {
    return "";
  }

  const controller = new AbortController();
  const timeoutMs = Number(process.env.IB_PDF_REPAIR_TIMEOUT_MS || "45000");
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(getStudyAssistantApiUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: getStudyAssistantModelId(),
        temperature: 0.1,
        max_tokens: Number(process.env.IB_PDF_REPAIR_MAX_TOKENS || "2600"),
        messages: [
          {
            role: "system",
            content:
              "You repair garbled text extracted from IB exam PDFs. Recover readable plain text conservatively, keep numbering and question order, restore mathematical notation when strongly supported by context, and do not invent missing content. Return plain text only.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.warn(`[ib-import] ${requestLabel} failed: ${response.status} ${errorText}`);
      return "";
    }

    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content;

    if (typeof content === "string") {
      return content.trim();
    }

    if (Array.isArray(content)) {
      return content
        .map((item) => (typeof item?.text === "string" ? item.text : ""))
        .join("\n")
        .trim();
    }

    return "";
  } catch (error) {
    console.warn(`[ib-import] ${requestLabel} threw while repairing PDF text:`, error);
    return "";
  } finally {
    clearTimeout(timeoutHandle);
  }
}

async function repairPdfTextWithQwen(rawText, context = {}) {
  if (!getStudyAssistantApiKey()) {
    return "";
  }

  const segments = splitTextForModelRepair(
    rawText,
    Number(process.env.IB_PDF_REPAIR_MAX_SEGMENT_CHARS || "5200"),
    Number(process.env.IB_PDF_REPAIR_SEGMENT_OVERLAP || "280")
  );

  if (segments.length === 0) {
    return "";
  }

  const repairedSegments = [];
  let consecutiveFailures = 0;

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    const prompt = [
      `Material title: ${context.title || path.basename(context.filePath || "unknown.pdf")}`,
      `Material type: ${context.materialType || "PDF"}`,
      "",
      "The following text was extracted from a PDF but some formulas or symbols are corrupted.",
      "Repair only what can be inferred from the surrounding context and keep the rest unchanged.",
      "If a specific math token is impossible to recover confidently, keep the nearby text readable and avoid hallucinating entire new expressions.",
      "",
      segment,
    ].join("\n");
    const repaired = await callStudyAssistantRepair(prompt, `ib-pdf-repair-${index + 1}`);

    if (!repaired) {
      consecutiveFailures += 1;
      repairedSegments.push(segment);
      if (consecutiveFailures >= 2) {
        repairedSegments.push(...segments.slice(index + 1));
        break;
      }
      continue;
    }

    consecutiveFailures = 0;
    repairedSegments.push(repaired);
  }

  return mergeRepairedSegments(repairedSegments);
}

function resolvePdfFallbackProvider() {
  const explicit = String(process.env.IB_PDF_FALLBACK_PROVIDER || "").trim().toLowerCase();
  if (!explicit || explicit === "none") {
    return "none";
  }

  if (explicit === "tencent_ocr") {
    if (hasTencentOcrCredentials()) {
      return "tencent_ocr";
    }

    console.warn(
      "[ib-import] IB_PDF_FALLBACK_PROVIDER=tencent_ocr is configured, but Tencent OCR credentials are missing. Falling back to pdf-parse."
    );
    return "none";
  }

  if (explicit === "tencent_edu_ocr") {
    if (hasTencentOcrCredentials()) {
      return "tencent_edu_ocr";
    }

    console.warn(
      "[ib-import] IB_PDF_FALLBACK_PROVIDER=tencent_edu_ocr is configured, but Tencent OCR credentials are missing. Falling back to pdf-parse."
    );
    return "none";
  }

  if (explicit === "qwen_repair" && getStudyAssistantApiKey()) {
    return "qwen_repair";
  }

  return "none";
}

export function evaluateExtractedTextQuality(text) {
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

export function approximateTokenCount(text) {
  return Math.ceil(String(text || "").length / 4);
}

function findQuestionSectionAnchors(text, materialType = "") {
  const normalizedType = String(materialType || "").toUpperCase();
  if (!["MARK_SCHEME", "PAST_PAPER"].includes(normalizedType)) {
    return [];
  }

  const anchors = [];
  const pattern =
    /(?:^|\n)\s*(\d{1,2})\.\s*(?=(?:\([a-z]\)|\[Maximum mark|METHOD|EITHER|OR\b|recognition|attempt|correct|substitut|using|find|show|calculate|determine|state|explain|given|consider|[A-Z]))/gi;

  for (const match of text.matchAll(pattern)) {
    const questionNumber = match[1];
    const index = typeof match.index === "number" ? match.index + (match[0].startsWith("\n") ? 1 : 0) : -1;
    if (index < 0) {
      continue;
    }

    const localContext = text.slice(index, index + 1400);
    const hasAssessmentSignal =
      normalizedType === "MARK_SCHEME"
        ? /\b(?:M|A|R|N)\d\b|\[\d+\s*marks?\]|Total\s*\[\d+\s*marks?\]/i.test(localContext)
        : /\[Maximum mark:\s*\d+\]|\[\d+\s*marks?\]/i.test(localContext);

    if (!hasAssessmentSignal) {
      continue;
    }

    const previous = anchors[anchors.length - 1];
    if (previous && previous.index === index) {
      continue;
    }

    anchors.push({
      index,
      questionRef: `Q${questionNumber}`,
      questionNumber: Number(questionNumber),
    });
  }

  return anchors;
}

function splitLongQuestionSection(section, questionRef, baseStartPos, chunkSize, overlapSize) {
  const chunks = [];
  let cursor = 0;

  while (cursor < section.length) {
    const end = Math.min(section.length, cursor + chunkSize);
    chunks.push({
      content: section.slice(cursor, end).trim(),
      startPos: baseStartPos + cursor,
      endPos: baseStartPos + end,
      questionRef,
    });
    if (end >= section.length) {
      break;
    }
    cursor = Math.max(end - overlapSize, cursor + 1);
  }

  return chunks;
}

function splitIntoQuestionChunks(text, chunkSize, overlapSize, options = {}) {
  const anchors = findQuestionSectionAnchors(text, options.materialType);
  if (anchors.length < 2) {
    return [];
  }

  const chunks = [];
  for (let index = 0; index < anchors.length; index += 1) {
    const anchor = anchors[index];
    const nextAnchor = anchors[index + 1];
    const end = nextAnchor?.index ?? text.length;
    const section = text.slice(anchor.index, end).trim();
    if (section.length < 40) {
      continue;
    }
    chunks.push(...splitLongQuestionSection(section, anchor.questionRef, anchor.index, chunkSize, overlapSize));
  }

  return chunks.filter((item) => item.content.length > 0);
}

export function splitIntoChunks(text, chunkSize, overlapSize, options = {}) {
  const normalized = String(text || "");
  const questionChunks = splitIntoQuestionChunks(normalized, chunkSize, overlapSize, options);
  if (questionChunks.length > 0) {
    return questionChunks;
  }

  const chunks = [];
  let cursor = 0;

  while (cursor < normalized.length) {
    const end = Math.min(normalized.length, cursor + chunkSize);
    chunks.push({
      content: normalized.slice(cursor, end).trim(),
      startPos: cursor,
      endPos: end,
    });
    if (end >= normalized.length) {
      break;
    }
    cursor = Math.max(end - overlapSize, cursor + 1);
  }

  return chunks.filter((item) => item.content.length > 0);
}

export function createStableChunkId(materialId, chunkIndex) {
  const digest = crypto.createHash("sha256").update(`${materialId}:${chunkIndex}`).digest("hex");
  return `ibc_${digest.slice(0, 48)}`;
}

export async function extractTextFromMaterial(filePath, context = {}) {
  const ext = path.extname(filePath).toLowerCase();
  const fallbackProvider = resolvePdfFallbackProvider();

  if (ext === ".html" || ext === ".htm") {
    const html = await fs.readFile(filePath, "utf8");
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/\s+/g, " ")
      .trim();
    return {
      text,
      extraction: {
        strategy: "html_strip",
        fallbackProvider: "none",
        fallbackTriggered: false,
        quality: evaluateExtractedTextQuality(text),
      },
    };
  }

  if (ext === ".txt" || ext === ".md") {
    const text = await fs.readFile(filePath, "utf8");
    return {
      text,
      extraction: {
        strategy: "plain_text",
        fallbackProvider: "none",
        fallbackTriggered: false,
        quality: evaluateExtractedTextQuality(text),
      },
    };
  }

  if (ext === ".docx") {
    const mammoth = await loadOptionalModule("mammoth");
    const result = await mammoth.extractRawText({ path: filePath });
    const text = result.value || "";
    return {
      text,
      extraction: {
        strategy: "docx_mammoth",
        fallbackProvider: "none",
        fallbackTriggered: false,
        quality: evaluateExtractedTextQuality(text),
      },
    };
  }

  if (ext === ".pdf") {
    const rawText = await extractPdfTextWithPdfParse(filePath);
    const cleanedRawText = sanitizeRecoveredText(rawText);
    const initialQuality = evaluateExtractedTextQuality(rawText);
    const cleanedRawQuality = evaluateExtractedTextQuality(cleanedRawText);
    const forceFallback = String(process.env.IB_PDF_FORCE_FALLBACK || "false").toLowerCase() === "true";
    const shouldFallback =
      (forceFallback || initialQuality.level === "poor") &&
      fallbackProvider !== "none" &&
      String(process.env.IB_PDF_REPAIR_ENABLED || "true").toLowerCase() !== "false";

    if (!shouldFallback) {
      return {
        text: cleanedRawText,
        extraction: {
          strategy: "pdf_parse",
          fallbackProvider,
          fallbackTriggered: false,
          forceFallback,
          initialQuality,
          quality: cleanedRawQuality,
          reviewRequired: initialQuality.level === "poor",
        },
      };
    }

    let repairedText = cleanedRawText;
    let fallbackProducedText = false;
    let fallbackMetadata = null;

    try {
      if (fallbackProvider === "qwen_repair") {
        repairedText =
          (await repairPdfTextWithQwen(rawText, {
            ...context,
            filePath,
          })) || cleanedRawText;
      } else if (fallbackProvider === "tencent_ocr") {
        const ocrResult = await extractPdfTextWithTencentOcr(filePath, context);
        const ocrText = sanitizeRecoveredText(ocrResult.text || "");
        fallbackProducedText = ocrText.length > 0;
        repairedText = fallbackProducedText ? ocrText : cleanedRawText;
        fallbackMetadata = {
          totalPages: ocrResult.totalPages,
          detectedPdfPageSize: ocrResult.detectedPdfPageSize,
          truncated: ocrResult.truncated,
          stopReason: ocrResult.stopReason,
          pages: ocrResult.pages,
          fileSizeBytes: ocrResult.fileSizeBytes,
          base64Bytes: ocrResult.base64Bytes,
        };
      } else if (fallbackProvider === "tencent_edu_ocr") {
        const ocrResult = await extractPdfTextWithTencentEduOcr(filePath, context);
        const ocrText = sanitizeRecoveredText(ocrResult.text || "");
        fallbackProducedText = ocrText.length > 0;
        repairedText = fallbackProducedText ? ocrText : cleanedRawText;
        fallbackMetadata = {
          totalPages: ocrResult.totalPages,
          detectedPdfPageSize: ocrResult.detectedPdfPageSize,
          truncated: ocrResult.truncated,
          stopReason: ocrResult.stopReason,
          pages: ocrResult.pages,
          fileSizeBytes: ocrResult.fileSizeBytes,
          base64Bytes: ocrResult.base64Bytes,
        };
      }
    } catch (error) {
      console.warn(
        `[ib-import] ${fallbackProvider} fallback failed for ${path.basename(filePath)}:`,
        error
      );
      repairedText = cleanedRawText;
    }

    const cleanedRepairedText = sanitizeRecoveredText(repairedText);
    const repairedQuality = evaluateExtractedTextQuality(cleanedRepairedText);
    const preferFallbackText =
      forceFallback &&
      fallbackProvider.startsWith("tencent") &&
      fallbackProducedText &&
      cleanedRepairedText.length > 0;
    const improved =
      preferFallbackText ||
      repairedQuality.qualityScore > cleanedRawQuality.qualityScore ||
      repairedQuality.suspiciousCharCount < cleanedRawQuality.suspiciousCharCount;
    const selectedText = improved ? cleanedRepairedText : cleanedRawText;
    const selectedQuality = improved ? repairedQuality : cleanedRawQuality;

    return {
      text: selectedText,
      extraction: {
        strategy: improved ? `pdf_parse_${fallbackProvider}` : "pdf_parse",
        fallbackProvider,
        fallbackTriggered: true,
        forceFallback,
        initialQuality,
        cleanedRawQuality,
        repairedQuality,
        quality: selectedQuality,
        improved,
        fallbackMetadata,
        fallbackProducedText,
        reviewRequired: initialQuality.level === "poor" && (!improved || !fallbackProducedText),
      },
    };
  }

  throw new Error(`Unsupported file type: ${ext}`);
}
