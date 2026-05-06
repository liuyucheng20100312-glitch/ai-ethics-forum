import fs from "node:fs/promises";
import path from "node:path";
import { MongoClient, ObjectId } from "mongodb";
import { loadEnvLocal } from "./lib/env.mjs";
import {
  approximateTokenCount,
  extractTextFromMaterial,
  splitIntoChunks,
} from "./lib/ib-material-text.mjs";
import { resolveExistingMaterialPath } from "./lib/ib-paths.mjs";

loadEnvLocal();

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    manifest: "",
    subjects: "",
    years: "",
    types: "MARK_SCHEME",
    materialId: "",
    title: "",
    question: "",
    riskThreshold: 50,
    limitMaterials: 0,
    limitChunks: 20,
    timeoutMs: Number(process.env.IB_READABLE_REPAIR_TIMEOUT_MS || "300000"),
    retries: Number(process.env.IB_READABLE_REPAIR_RETRIES || "1"),
    maxInputChars: Number(process.env.IB_READABLE_REPAIR_MAX_INPUT_CHARS || "4200"),
    maxTokens: Number(process.env.IB_READABLE_REPAIR_MAX_TOKENS || "1400"),
    model: process.env.IB_READABLE_REPAIR_MODEL_ID || "qwen-plus",
    write: false,
    overwrite: false,
    out: "",
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--manifest" && args[index + 1]) {
      options.manifest = args[index + 1];
      index += 1;
    } else if (arg === "--subjects" && args[index + 1]) {
      options.subjects = args[index + 1];
      index += 1;
    } else if (arg === "--years" && args[index + 1]) {
      options.years = args[index + 1];
      index += 1;
    } else if (arg === "--types" && args[index + 1]) {
      options.types = args[index + 1];
      index += 1;
    } else if (arg === "--material-id" && args[index + 1]) {
      options.materialId = args[index + 1];
      index += 1;
    } else if (arg === "--title" && args[index + 1]) {
      options.title = args[index + 1];
      index += 1;
    } else if (arg === "--question" && args[index + 1]) {
      options.question = normalizeQuestionRef(args[index + 1]);
      index += 1;
    } else if (arg === "--risk-threshold" && args[index + 1]) {
      options.riskThreshold = Number(args[index + 1]) || options.riskThreshold;
      index += 1;
    } else if (arg === "--limit-materials" && args[index + 1]) {
      options.limitMaterials = Number(args[index + 1]) || 0;
      index += 1;
    } else if (arg === "--limit-chunks" && args[index + 1]) {
      options.limitChunks = Number(args[index + 1]) || options.limitChunks;
      index += 1;
    } else if (arg === "--timeout-ms" && args[index + 1]) {
      options.timeoutMs = Number(args[index + 1]) || options.timeoutMs;
      index += 1;
    } else if (arg === "--retries" && args[index + 1]) {
      options.retries = Number(args[index + 1]) || options.retries;
      index += 1;
    } else if (arg === "--max-input-chars" && args[index + 1]) {
      options.maxInputChars = Number(args[index + 1]) || options.maxInputChars;
      index += 1;
    } else if (arg === "--max-tokens" && args[index + 1]) {
      options.maxTokens = Number(args[index + 1]) || options.maxTokens;
      index += 1;
    } else if (arg === "--model" && args[index + 1]) {
      options.model = args[index + 1];
      index += 1;
    } else if (arg === "--out" && args[index + 1]) {
      options.out = args[index + 1];
      index += 1;
    } else if (arg === "--write") {
      options.write = true;
    } else if (arg === "--overwrite") {
      options.overwrite = true;
    }
  }

  return options;
}

function normalizeQuestionRef(value) {
  const match = String(value || "").match(/q?\s*([0-9]{1,2}[a-z]?)/i);
  return match ? `Q${match[1].toUpperCase()}` : "";
}

function csvToSet(value, transform = (item) => item) {
  return new Set(
    String(value || "")
      .split(",")
      .map((item) => transform(item.trim()))
      .filter(Boolean)
  );
}

function parseYearFilters(value) {
  const years = [];
  for (const rawItem of String(value || "").split(",")) {
    const item = rawItem.trim();
    if (!item) {
      continue;
    }

    const rangeMatch = item.match(/^(\d{4})\s*-\s*(\d{4})$/);
    if (rangeMatch) {
      const start = Number(rangeMatch[1]);
      const end = Number(rangeMatch[2]);
      const min = Math.min(start, end);
      const max = Math.max(start, end);
      for (let year = min; year <= max; year += 1) {
        years.push(year);
      }
      continue;
    }

    const year = Number(item);
    if (Number.isFinite(year)) {
      years.push(year);
    }
  }

  return [...new Set(years)];
}

function normalizeSubjectCode(value) {
  const upper = String(value || "").trim().toUpperCase();
  if (["MATHEMATICS", "MATH", "MATHS", "MAA", "AA"].includes(upper)) {
    return "MAA";
  }
  if (["PHYSICS", "PHY"].includes(upper)) {
    return "PHYSICS";
  }
  if (["CHEMISTRY", "CHEM"].includes(upper)) {
    return "CHEMISTRY";
  }
  return upper;
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function tryObjectId(value) {
  try {
    return new ObjectId(value);
  } catch {
    return null;
  }
}

function normalizeMaterial(item) {
  return {
    materialId: item.materialId || item.id || "",
    title: item.title || item.titleCn || item.titleEn || "",
    type: item.type || item.materialType || "MARK_SCHEME",
    subjectId: Number(item.subjectId || item.subject_id || 0),
    subjectCode: item.subjectCode || item.subject_code || "",
    hlSl: item.hlSl || item.hl_sl || "BOTH",
    difficulty: Number(item.difficulty || 3),
    year: Number(item.year || 0) || null,
    paper: item.paper || "",
    timezone: item.timezone || "",
    tags: Array.isArray(item.tags) ? item.tags : [],
    topics: Array.isArray(item.topics) ? item.topics : [],
    fileUrl: item.fileUrl || item.file_url || item.sourcePath || item.path || "",
    textExtraction: item.textExtraction || null,
  };
}

function materialMatches(material, options) {
  const subjects = csvToSet(options.subjects, normalizeSubjectCode);
  const years = new Set(parseYearFilters(options.years).map((year) => String(year)));
  const types = csvToSet(options.types, (item) => item.toUpperCase());

  if (options.materialId && material.materialId !== options.materialId) {
    return false;
  }
  if (options.title && !material.title.toLowerCase().includes(options.title.toLowerCase())) {
    return false;
  }
  if (subjects.size > 0 && !subjects.has(normalizeSubjectCode(material.subjectCode))) {
    return false;
  }
  if (years.size > 0 && !years.has(String(material.year || ""))) {
    return false;
  }
  if (types.size > 0 && !types.has(String(material.type || "").toUpperCase())) {
    return false;
  }
  return true;
}

function getMongoConfig() {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is not configured.");
  }
  return {
    uri: process.env.MONGODB_URI,
    dbName: process.env.MONGODB_DB || "ai-ethics-forum",
  };
}

async function loadMaterialsFromManifest(options) {
  const manifestPath = path.isAbsolute(options.manifest)
    ? options.manifest
    : path.join(process.cwd(), options.manifest);
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  return (manifest.materials || [])
    .map(normalizeMaterial)
    .filter((material) => materialMatches(material, options));
}

async function loadMaterialsFromMongo(db, options) {
  const query = {};
  if (options.materialId) {
    const objectId = tryObjectId(options.materialId);
    query.$or = [
      { materialId: options.materialId },
      { _id: objectId || options.materialId },
    ];
  }
  if (options.title) {
    query.title = new RegExp(escapeRegExp(options.title), "i");
  }

  const subjects = csvToSet(options.subjects, normalizeSubjectCode);
  if (subjects.size > 0) {
    query.subjectCode = { $in: [...subjects] };
  }

  const years = parseYearFilters(options.years);
  if (years.length > 0) {
    query.year = { $in: years };
  }

  const types = csvToSet(options.types, (item) => item.toUpperCase());
  if (types.size > 0) {
    query.type = { $in: [...types] };
  }

  const cursor = db.collection("ib_materials").find(query).sort({ year: -1, updatedAt: -1 });
  if (options.limitMaterials > 0) {
    cursor.limit(options.limitMaterials);
  }

  return (await cursor.toArray()).map(normalizeMaterial).filter((material) => materialMatches(material, options));
}

function configureNoOcrExtraction() {
  process.env.IB_PDF_FALLBACK_PROVIDER = "none";
  process.env.IB_PDF_REPAIR_ENABLED = "false";
  process.env.IB_PDF_FORCE_FALLBACK = "false";
}

function scoreMathReadability(content) {
  const text = String(content || "");
  const lines = text.split(/\r?\n/);
  const mathLines = lines.filter((line) =>
    /[=+\-*/^()[\]{}<>]|(?:\b[A-ZMR]\d\b)|(?:\b[munpqd]\s*=)/i.test(line)
  );
  const tabbedMathLines = mathLines.filter((line) => /\t/.test(line));
  const isolatedTokenLines = mathLines.filter((line) => {
    const tokens = line.trim().split(/\s+/).filter(Boolean);
    const isolated = tokens.filter((token) => /^[a-zA-Z0-9]$/.test(token)).length;
    return tokens.length >= 5 && isolated / tokens.length >= 0.45;
  });
  const replacementCharCount = (text.match(/\uFFFD|\u25A1/g) || []).length;
  const riskScore = Math.min(
    100,
    Math.round(
      (tabbedMathLines.length / Math.max(1, mathLines.length)) * 45 +
        (isolatedTokenLines.length / Math.max(1, mathLines.length)) * 45 +
        Math.min(20, replacementCharCount * 2) +
        (/\(\s*\)\s*\d/.test(text) ? 10 : 0)
    )
  );

  return {
    mathLineCount: mathLines.length,
    tabbedMathLineCount: tabbedMathLines.length,
    isolatedTokenLineCount: isolatedTokenLines.length,
    replacementCharCount,
    riskScore,
    riskLevel: riskScore >= 55 ? "high" : riskScore >= 25 ? "medium" : "low",
  };
}

function normalizeDedupText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
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
    process.env.IB_READABLE_REPAIR_MODEL_ID ||
    process.env.STUDY_ASSISTANT_MODEL_ID ||
    process.env.ALIBABA_BAILIAN_MODEL_ID ||
    "qwen-plus"
  );
}

function trimModelInput(content, maxInputChars) {
  const text = String(content || "");
  if (!maxInputChars || text.length <= maxInputChars) {
    return text;
  }

  const headLength = Math.max(1000, Math.floor(maxInputChars * 0.72));
  const tailLength = Math.max(400, maxInputChars - headLength);
  return [
    text.slice(0, headLength).trim(),
    "",
    "[... middle omitted to keep this batch repair request responsive ...]",
    "",
    text.slice(Math.max(0, text.length - tailLength)).trim(),
  ].join("\n");
}

function summarizeError(error) {
  if (error?.name === "AbortError") {
    return "request timed out";
  }
  return error?.message || String(error);
}

function normalizeReadableContent(content) {
  return String(content || "")
    .trim()
    .replace(/^```(?:markdown|md)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
}

async function buildReadablePreview(candidate, options) {
  const apiKey = getStudyAssistantApiKey();
  if (!apiKey) {
    throw new Error("Study assistant model API key is missing.");
  }

  const inputContent = trimModelInput(candidate.content, options.maxInputChars);
  const modelId = options.model || getStudyAssistantModelId();
  const prompt = [
    "Rewrite the following IB markscheme OCR snippet into a student-readable Markdown scoring guide.",
    "",
    "Hard rules:",
    "1. Do not add information that is not present in the OCR text.",
    "2. Restore obvious math notation when the OCR pattern is clear, for example u_1, u_n, u_6, u_12, d, M1, A1.",
    "3. Preserve METHOD labels, M1/A1/N marks, and [marks] totals.",
    "4. If a formula is uncertain, mark it as [uncertain] instead of inventing it.",
    "5. Output Markdown only, with no preface or explanation.",
    "",
    `Material: ${candidate.title}`,
    `Question: ${candidate.questionRef}`,
    "",
    "Original OCR text:",
    "```text",
    inputContent,
    "```",
  ].join("\n");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
  const startedAt = Date.now();

  try {
    const response = await fetch(getStudyAssistantApiUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: modelId,
        temperature: 0,
        max_tokens: options.maxTokens,
        messages: [
          {
            role: "system",
            content:
              "You conservatively rewrite OCR-extracted IB markscheme snippets into readable Markdown. Do not invent missing math.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`Readable repair failed: ${response.status} ${await response.text()}`);
    }

    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content;
    if (typeof content === "string") {
      return normalizeReadableContent(content);
    }
    if (Array.isArray(content)) {
      return normalizeReadableContent(content.map((item) => item?.text || "").join("\n"));
    }
    return "";
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    throw new Error(`${summarizeError(error)} after ${durationMs}ms`);
  } finally {
    clearTimeout(timeout);
  }
}

function sourcePathFromMaterial(material) {
  return (
    material?.fileUrl ||
    material?.sourcePath ||
    material?.filePath ||
    material?.path ||
    ""
  );
}

function normalizeSourcePath(value) {
  return String(value || "")
    .replace(/\\/g, "/")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

async function hasExistingReadableChunk(db, material, questionRef) {
  const materialId = material.materialId;
  const labId = `lab:${materialId}:${questionRef}`;
  const existing = await db.collection("ib_material_chunks").findOne({
    $or: [
      { milvusVectorId: labId, readableContent: { $type: "string", $ne: "" } },
      { materialId, questionRef, readableContent: { $type: "string", $ne: "" } },
    ],
  });
  if (existing) {
    return true;
  }

  const sourcePath = normalizeSourcePath(sourcePathFromMaterial(material));
  if (!sourcePath) {
    return false;
  }

  const sameFileMaterials = await db
    .collection("ib_materials")
    .find({
      materialId: { $ne: materialId },
      fileUrl: sourcePathFromMaterial(material),
    })
    .project({ materialId: 1 })
    .toArray();
  const sameFileMaterialIds = sameFileMaterials
    .map((item) => String(item.materialId || ""))
    .filter(Boolean);

  if (sameFileMaterialIds.length === 0) {
    return false;
  }

  const sameFileExisting = await db.collection("ib_material_chunks").findOne({
    materialId: { $in: sameFileMaterialIds },
    questionRef,
    readableContent: { $type: "string", $ne: "" },
  });

  return Boolean(sameFileExisting);
}

async function collectCandidates(db, materials, options) {
  configureNoOcrExtraction();
  const candidates = [];
  const materialReports = [];
  const seenCandidateKeys = new Set();

  for (const material of materials) {
    const sourcePath = sourcePathFromMaterial(material);
    const filePath = resolveExistingMaterialPath(sourcePath);
    if (!filePath) {
      materialReports.push({
        materialId: material.materialId,
        title: material.title,
        skipped: true,
        reason: "source file not found",
        sourcePath,
      });
      continue;
    }

    const extracted = await extractTextFromMaterial(filePath, {
      title: material.title,
      materialType: material.type,
    });
    const chunks = splitIntoChunks(extracted.text, 3600, 300, {
      materialType: material.type,
    });
    const chunkReports = [];

    for (const chunk of chunks) {
      if (!chunk.questionRef) {
        continue;
      }
      if (options.question && chunk.questionRef !== options.question) {
        continue;
      }

      const risk = scoreMathReadability(chunk.content);
      const hasReadable = await hasExistingReadableChunk(db, material, chunk.questionRef);
      const selected = risk.riskScore >= options.riskThreshold && (options.overwrite || !hasReadable);

      chunkReports.push({
        questionRef: chunk.questionRef,
        risk,
        hasReadable,
        selected,
      });

      if (selected) {
        const exactKey = `${material.materialId}:${chunk.questionRef}`;
        const fuzzyKey = `${normalizeDedupText(material.title)}:${chunk.questionRef}`;
        const duplicate = seenCandidateKeys.has(exactKey) || seenCandidateKeys.has(fuzzyKey);

        if (duplicate) {
          chunkReports[chunkReports.length - 1].selected = false;
          chunkReports[chunkReports.length - 1].duplicateSkipped = true;
          continue;
        }

        seenCandidateKeys.add(exactKey);
        seenCandidateKeys.add(fuzzyKey);
        candidates.push({
          ...material,
          filePath,
          questionRef: chunk.questionRef,
          content: chunk.content,
          risk,
        });
      }
    }

    materialReports.push({
      materialId: material.materialId,
      title: material.title,
      filePath,
      extractionStrategy: extracted.extraction?.strategy || "unknown",
      extractionQuality: extracted.extraction?.quality?.level || "unknown",
      totalQuestionChunks: chunks.filter((chunk) => chunk.questionRef).length,
      selectedQuestionChunks: chunkReports.filter((item) => item.selected).length,
      chunks: chunkReports,
    });
  }

  return { candidates, materialReports };
}

async function writeReadableChunk(db, candidate, readableContent) {
  const labChunkId = `lab:${candidate.materialId}:${candidate.questionRef}`;
  await db.collection("ib_material_chunks").updateOne(
    { milvusVectorId: labChunkId },
    {
      $set: {
        materialId: candidate.materialId,
        subjectId: candidate.subjectId || 0,
        subjectCode: candidate.subjectCode || "",
        title: candidate.title || "",
        materialType: candidate.type || "",
        hlSl: candidate.hlSl || "BOTH",
        difficulty: candidate.difficulty || 3,
        year: candidate.year || null,
        paper: candidate.paper || "",
        timezone: candidate.timezone || "",
        tags: [...new Set([...(Array.isArray(candidate.tags) ? candidate.tags : []), "readable-repair"])],
        topics: candidate.topics || [],
        questionRef: candidate.questionRef,
        chunkIndex: -1,
        content: candidate.content,
        readableContent,
        readableContentSource: "batch-qwen-readable-repair",
        readableContentUpdatedAt: new Date().toISOString(),
        tokenCount: approximateTokenCount(readableContent),
        milvusVectorId: labChunkId,
        textExtractionStrategy: "pdf_parse_readable_repair",
        textExtractionQualityLevel: "readable",
        sourceKind: "readable_repair_preview",
        reviewStatus: "readable_ready",
        updatedAt: new Date().toISOString(),
      },
      $setOnInsert: {
        createdAt: new Date().toISOString(),
      },
    },
    { upsert: true }
  );

  return labChunkId;
}

async function writeReport(report, options) {
  const outputPath = options.out
    ? path.resolve(options.out)
    : path.join(
        process.cwd(),
        "data",
        "ib",
        "reports",
        `readable-repair-${Date.now()}.json`
      );

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(report, null, 2), "utf8");
  return outputPath;
}

async function main() {
  const options = parseArgs();
  const mongoConfig = getMongoConfig();
  const mongo = new MongoClient(mongoConfig.uri);
  await mongo.connect();
  const db = mongo.db(mongoConfig.dbName);

  try {
    const materials = options.manifest
      ? await loadMaterialsFromManifest(options)
      : await loadMaterialsFromMongo(db, options);
    const limitedMaterials =
      options.limitMaterials > 0 ? materials.slice(0, options.limitMaterials) : materials;
    const { candidates, materialReports } = await collectCandidates(db, limitedMaterials, options);
    const selectedCandidates = options.write
      ? candidates.slice(0, Math.max(0, options.limitChunks))
      : candidates;
    const writes = [];
    const failures = [];
    let attemptedModelCalls = 0;

    if (options.write) {
      if (selectedCandidates.length === 0) {
        console.log("No readable repair candidates selected.");
      }
      for (let index = 0; index < selectedCandidates.length; index += 1) {
        const candidate = selectedCandidates[index];
        console.log(
          `[${index + 1}/${selectedCandidates.length}] ${candidate.title} ${candidate.questionRef} risk=${candidate.risk.riskScore}`
        );

        let readableContent = "";
        let lastError = null;
        const attempts = Math.max(1, options.retries + 1);

        for (let attempt = 1; attempt <= attempts; attempt += 1) {
          attemptedModelCalls += 1;
          const startedAt = Date.now();
          console.log(
            `  -> Qwen attempt ${attempt}/${attempts}, model=${options.model}, timeout=${Math.round(
              options.timeoutMs / 1000
            )}s, inputChars=${Math.min(candidate.content.length, options.maxInputChars)}`
          );

          try {
            readableContent = await buildReadablePreview(candidate, options);
            console.log(`  <- completed in ${Math.round((Date.now() - startedAt) / 1000)}s, outputChars=${readableContent.length}`);
            lastError = null;
            break;
          } catch (error) {
            lastError = error;
            console.error(`  !! attempt ${attempt}/${attempts} failed: ${summarizeError(error)}`);
          }
        }

        if (!readableContent) {
          failures.push({
            materialId: candidate.materialId,
            title: candidate.title,
            questionRef: candidate.questionRef,
            risk: candidate.risk,
            error: summarizeError(lastError),
          });
          continue;
        }

        const labChunkId = await writeReadableChunk(db, candidate, readableContent);
        writes.push({
          labChunkId,
          materialId: candidate.materialId,
          title: candidate.title,
          questionRef: candidate.questionRef,
          risk: candidate.risk,
          readableLength: readableContent.length,
        });
      }
    }

    const report = {
      mode: options.write ? "write" : "dry-run",
      safety: {
        ocrCalls: 0,
        embeddingCalls: 0,
        zillizWrites: 0,
        qwenCalls: attemptedModelCalls,
      },
      filters: {
        manifest: options.manifest || "",
        subjects: options.subjects || "",
        years: options.years || "",
        types: options.types || "",
        materialId: options.materialId || "",
        title: options.title || "",
        question: options.question || "",
        riskThreshold: options.riskThreshold,
        overwrite: options.overwrite,
        model: options.model,
        timeoutMs: options.timeoutMs,
        retries: options.retries,
        maxInputChars: options.maxInputChars,
        maxTokens: options.maxTokens,
      },
      materialCount: limitedMaterials.length,
      candidateCount: candidates.length,
      selectedWriteCount: writes.length,
      failedWriteCount: failures.length,
      estimatedPaidModelCallsIfWriteAll: candidates.length,
      estimatedPaidModelCallsThisRun: attemptedModelCalls,
      writes,
      failures,
      materials: materialReports,
    };
    const outputPath = await writeReport(report, options);

    console.log(
      JSON.stringify(
        {
          outputPath,
          mode: report.mode,
          materialCount: report.materialCount,
          candidateCount: report.candidateCount,
          estimatedPaidModelCallsIfWriteAll: report.estimatedPaidModelCallsIfWriteAll,
          estimatedPaidModelCallsThisRun: report.estimatedPaidModelCallsThisRun,
          safety: report.safety,
        },
        null,
        2
      )
    );
  } finally {
    await mongo.close();
  }
}

main().catch((error) => {
  console.error("Readable chunk repair failed:", error);
  process.exit(1);
});
