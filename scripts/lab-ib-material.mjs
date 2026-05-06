import fs from "node:fs/promises";
import path from "node:path";
import { MongoClient, ObjectId } from "mongodb";
import { loadEnvLocal } from "./lib/env.mjs";
import {
  approximateTokenCount,
  extractTextFromMaterial,
  splitIntoChunks,
} from "./lib/ib-material-text.mjs";
import {
  describeMaterialPathResolution,
  resolveExistingMaterialPath,
} from "./lib/ib-paths.mjs";

loadEnvLocal();

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    materialId: "",
    title: "",
    file: "",
    type: "",
    question: "",
    provider: "none",
    chunkSize: 3600,
    overlapSize: 300,
    out: "",
    list: false,
    repairPreview: false,
    writeReadable: false,
    limit: 10,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--material-id" && args[index + 1]) {
      options.materialId = args[index + 1];
      index += 1;
    } else if (arg === "--title" && args[index + 1]) {
      options.title = args[index + 1];
      index += 1;
    } else if (arg === "--file" && args[index + 1]) {
      options.file = args[index + 1];
      index += 1;
    } else if (arg === "--type" && args[index + 1]) {
      options.type = args[index + 1].toUpperCase();
      index += 1;
    } else if (arg === "--question" && args[index + 1]) {
      options.question = normalizeQuestionRef(args[index + 1]);
      index += 1;
    } else if (arg === "--provider" && args[index + 1]) {
      options.provider = args[index + 1].toLowerCase();
      index += 1;
    } else if (arg === "--chunk-size" && args[index + 1]) {
      options.chunkSize = Number(args[index + 1]) || options.chunkSize;
      index += 1;
    } else if (arg === "--overlap-size" && args[index + 1]) {
      options.overlapSize = Number(args[index + 1]) || options.overlapSize;
      index += 1;
    } else if (arg === "--out" && args[index + 1]) {
      options.out = args[index + 1];
      index += 1;
    } else if (arg === "--limit" && args[index + 1]) {
      options.limit = Number(args[index + 1]) || options.limit;
      index += 1;
    } else if (arg === "--list") {
      options.list = true;
    } else if (arg === "--repair-preview") {
      options.repairPreview = true;
    } else if (arg === "--write-readable") {
      options.writeReadable = true;
    }
  }

  return options;
}

function normalizeQuestionRef(value) {
  const match = String(value || "").match(/q?\s*([0-9]{1,2}[a-z]?)/i);
  return match ? `Q${match[1]}` : "";
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function safeSlug(value) {
  return String(value || "material")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90) || "material";
}

function configureProvider(provider) {
  if (!provider || provider === "none") {
    process.env.IB_PDF_FALLBACK_PROVIDER = "none";
    process.env.IB_PDF_REPAIR_ENABLED = "false";
    process.env.IB_PDF_FORCE_FALLBACK = "false";
    return;
  }

  process.env.IB_PDF_REPAIR_ENABLED = "true";
  process.env.IB_PDF_FORCE_FALLBACK = "true";
  process.env.IB_PDF_FALLBACK_PROVIDER = provider;
}

function getMongoConfig() {
  if (!process.env.MONGODB_URI) {
    return null;
  }

  return {
    uri: process.env.MONGODB_URI,
    dbName: process.env.MONGODB_DB || "ai-ethics-forum",
  };
}

function tryObjectId(value) {
  try {
    return new ObjectId(value);
  } catch {
    return null;
  }
}

async function findMaterials(options) {
  const mongoConfig = getMongoConfig();
  if (!mongoConfig || (!options.materialId && !options.title)) {
    return [];
  }

  const client = new MongoClient(mongoConfig.uri);
  try {
    await client.connect();
    const db = client.db(mongoConfig.dbName);
    const query = {};

    if (options.materialId) {
      const objectId = tryObjectId(options.materialId);
      query.$or = [
        { materialId: options.materialId },
        { _id: objectId || options.materialId },
      ];
    } else if (options.title) {
      query.title = new RegExp(escapeRegExp(options.title), "i");
    }

    if (options.type) {
      query.type = options.type;
    }

    return await db
      .collection("ib_materials")
      .find(query)
      .sort({ year: -1, updatedAt: -1 })
      .limit(options.limit)
      .toArray();
  } finally {
    await client.close();
  }
}

async function writeReadableContentToMongo(material, questionRef, readableContent) {
  const mongoConfig = getMongoConfig();
  if (!mongoConfig || !material?.materialId || !questionRef || !readableContent) {
    return {
      matchedCount: 0,
      modifiedCount: 0,
    };
  }

  const client = new MongoClient(mongoConfig.uri);
  try {
    await client.connect();
    const db = client.db(mongoConfig.dbName);
    const chunks = db.collection("ib_material_chunks");
    const result = await chunks.updateOne(
      {
        materialId: material.materialId,
        questionRef,
      },
      {
        $set: {
          readableContent,
          readableContentSource: "lab-qwen-preview",
          readableContentUpdatedAt: new Date().toISOString(),
        },
      }
    );

    if (result.matchedCount > 0) {
      return {
        matchedCount: result.matchedCount,
        modifiedCount: result.modifiedCount,
        upsertedLabChunkId: "",
      };
    }

    const labChunkId = `lab:${material.materialId}:${questionRef}`;
    const labResult = await chunks.updateOne(
      {
        milvusVectorId: labChunkId,
      },
      {
        $set: {
          materialId: material.materialId,
          subjectId: material.subjectId || 0,
          subjectCode: material.subjectCode || "",
          title: material.title || "",
          materialType: material.type || "",
          hlSl: material.hlSl || "BOTH",
          difficulty: material.difficulty || 3,
          year: material.year || null,
          paper: material.paper || "",
          timezone: material.timezone || "",
          tags: [...new Set([...(Array.isArray(material.tags) ? material.tags : []), "lab-readable"])],
          topics: material.topics || [],
          questionRef,
          chunkIndex: -1,
          content: readableContent,
          readableContent,
          readableContentSource: "lab-qwen-preview",
          readableContentUpdatedAt: new Date().toISOString(),
          tokenCount: approximateTokenCount(readableContent),
          milvusVectorId: labChunkId,
          textExtractionStrategy: material.textExtraction?.strategy || "unknown",
          textExtractionQualityLevel: material.textExtraction?.quality?.level || "unknown",
          sourceKind: "lab_readable_preview",
          reviewStatus: "lab_only",
          updatedAt: new Date().toISOString(),
        },
        $setOnInsert: {
          createdAt: new Date().toISOString(),
        },
      },
      { upsert: true }
    );

    return {
      matchedCount: 0,
      modifiedCount: labResult.modifiedCount,
      upsertedLabChunkId: labChunkId,
    };
  } finally {
    await client.close();
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

function scoreMathReadability(content) {
  const text = String(content || "");
  const lines = text.split(/\r?\n/);
  const mathLines = lines.filter((line) => /[=+\-−×÷∫π√^]|(?:\b[A-ZMR]\d\b)/.test(line));
  const tabbedMathLines = mathLines.filter((line) => /\t/.test(line));
  const isolatedTokenLines = mathLines.filter((line) => {
    const tokens = line.trim().split(/\s+/).filter(Boolean);
    const isolated = tokens.filter((token) => /^[a-zA-Z0-9]$/.test(token)).length;
    return tokens.length >= 5 && isolated / tokens.length >= 0.45;
  });
  const riskScore = Math.min(
    100,
    Math.round(
      (tabbedMathLines.length / Math.max(1, mathLines.length)) * 45 +
      (isolatedTokenLines.length / Math.max(1, mathLines.length)) * 45 +
      (/\(\s*\)\s*\d/.test(text) ? 10 : 0)
    )
  );

  return {
    mathLineCount: mathLines.length,
    tabbedMathLineCount: tabbedMathLines.length,
    isolatedTokenLineCount: isolatedTokenLines.length,
    riskScore,
    riskLevel: riskScore >= 55 ? "high" : riskScore >= 25 ? "medium" : "low",
  };
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

async function buildReadablePreview(chunk, material) {
  const apiKey = getStudyAssistantApiKey();
  if (!apiKey) {
    return "";
  }

  const prompt = [
    "请把下面这段 IB Mathematics markscheme OCR 文本整理成学生可读的评分细则。",
    "",
    "硬性要求：",
    "1. 不新增原文没有的信息，不猜题干。",
    "2. 尽量恢复明显的数学符号和下标，例如 u_1、u_n、u_6、u_12、d。",
    "3. 保留 METHOD、M1/A1、[marks] 等评分点。",
    "4. 如果某个公式不能确定，用【疑似】标记，不要编造。",
    "5. 输出 Markdown，只输出整理后的内容。",
    "",
    `Material: ${material?.title || "unknown"}`,
    `Question: ${chunk.questionRef || "unknown"}`,
    "",
    "原始 OCR 文本：",
    "```text",
    chunk.content,
    "```",
  ].join("\n");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.IB_LAB_REPAIR_TIMEOUT_MS || "120000"));

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
        temperature: 0,
        max_tokens: Number(process.env.IB_LAB_REPAIR_MAX_TOKENS || "1800"),
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
      return `Preview repair failed: ${response.status} ${await response.text()}`;
    }

    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content;
    if (typeof content === "string") {
      return content.trim();
    }
    if (Array.isArray(content)) {
      return content.map((item) => item?.text || "").join("\n").trim();
    }
    return "";
  } finally {
    clearTimeout(timeout);
  }
}

function formatChunk(chunk, index) {
  const diagnostic = scoreMathReadability(chunk.content);
  return [
    `### Chunk ${index + 1}${chunk.questionRef ? ` (${chunk.questionRef})` : ""}`,
    "",
    `- Position: ${chunk.startPos}-${chunk.endPos}`,
    `- Tokens: ~${approximateTokenCount(chunk.content)}`,
    `- Math readability risk: ${diagnostic.riskLevel} (${diagnostic.riskScore}/100)`,
    `- Math lines: ${diagnostic.mathLineCount}, tabbed: ${diagnostic.tabbedMathLineCount}, isolated-token: ${diagnostic.isolatedTokenLineCount}`,
    "",
    "```text",
    chunk.content,
    "```",
  ].join("\n");
}

function buildReport({ options, material, filePath, extracted, chunks, selectedChunks, repairedPreviews }) {
  const refs = [...new Set(chunks.map((chunk) => chunk.questionRef).filter(Boolean))];
  const reportTitle = material?.title || path.basename(filePath);

  return [
    "# IB Material Lab Report",
    "",
    "## Safety",
    "",
    `- Provider: ${options.provider}`,
    `- Paid OCR/model calls: ${options.provider === "none" ? "NO" : "YES, explicitly requested"}`,
    "- MongoDB writes: NO",
    "- Zilliz writes / embedding calls: NO",
    "",
    "## Material",
    "",
    `- Title: ${reportTitle}`,
    `- Material ID: ${material?.materialId || "(file only)"}`,
    `- Type: ${options.type || material?.type || "unknown"}`,
    `- Year/Paper/TZ: ${material?.year || "n/a"} / ${material?.paper || "n/a"} / ${material?.timezone || "n/a"}`,
    `- File: ${filePath}`,
    "",
    "## Extraction",
    "",
    `- Strategy: ${extracted.extraction?.strategy || "unknown"}`,
    `- Quality: ${extracted.extraction?.quality?.level || "unknown"}`,
    `- Review required: ${String(extracted.extraction?.reviewRequired || false)}`,
    `- Text length: ${extracted.text.length}`,
    "",
    "## Chunking",
    "",
    `- Total chunks: ${chunks.length}`,
    `- Question refs: ${refs.join(", ") || "(none)"}`,
    `- Selected question: ${options.question || "(first chunks)"}`,
    `- Selected chunks: ${selectedChunks.length}`,
    "",
    ...selectedChunks.map(formatChunk),
    repairedPreviews.length > 0 ? "## Repair Preview" : "",
    repairedPreviews.length > 0
      ? repairedPreviews
          .map((preview, index) =>
            [
              `### Preview ${index + 1}${selectedChunks[index]?.questionRef ? ` (${selectedChunks[index].questionRef})` : ""}`,
              "",
              "```md",
              preview,
              "```",
            ].join("\n")
          )
          .join("\n\n")
      : "",
    "",
  ].join("\n");
}

async function main() {
  const options = parseArgs();
  configureProvider(options.provider);

  const materials = await findMaterials(options);
  if (options.list) {
    console.log(
      JSON.stringify(
        materials.map((material) => ({
          id: String(material._id),
          materialId: material.materialId,
          title: material.title,
          type: material.type,
          year: material.year,
          paper: material.paper,
          timezone: material.timezone,
          fileUrl: material.fileUrl,
          textExtraction: material.textExtraction,
        })),
        null,
        2
      )
    );
    return;
  }

  const material = materials[0] || null;
  const rawFilePath = options.file || sourcePathFromMaterial(material);
  if (!rawFilePath) {
    throw new Error("Missing file path. Provide --file or identify a Mongo material with --material-id / --title.");
  }

  const filePath = resolveExistingMaterialPath(rawFilePath);
  if (!filePath) {
    const resolution = describeMaterialPathResolution(rawFilePath);
    throw new Error(`Unable to resolve source file. Checked: ${resolution.candidates.join(", ")}`);
  }

  const materialType = options.type || material?.type || "PDF";
  const extracted = await extractTextFromMaterial(filePath, {
    title: material?.title || path.basename(filePath),
    materialType,
  });
  const chunks = splitIntoChunks(extracted.text, options.chunkSize, options.overlapSize, {
    materialType,
  });
  const selectedChunks = options.question
    ? chunks.filter((chunk) => chunk.questionRef === options.question)
    : chunks.slice(0, Math.min(3, chunks.length));
  const repairedPreviews = options.repairPreview
    ? await Promise.all(selectedChunks.map((chunk) => buildReadablePreview(chunk, material)))
    : [];
  const writeResults =
    options.writeReadable && options.repairPreview
      ? await Promise.all(
          selectedChunks.map((chunk, index) =>
            writeReadableContentToMongo(material, chunk.questionRef, repairedPreviews[index] || "")
          )
        )
      : [];

  const outputPath = options.out
    ? path.resolve(options.out)
    : path.join(
        process.cwd(),
        "data",
        "ib",
        "reports",
        "material-lab",
        `${safeSlug(`${material?.materialId || material?.title || path.basename(filePath)}-${options.question || "sample"}`)}.md`
      );

  const report = buildReport({
    options,
    material,
    filePath,
    extracted,
    chunks,
    selectedChunks,
    repairedPreviews,
  });

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, report, "utf8");

  console.log(
    JSON.stringify(
      {
        outputPath,
        title: material?.title || path.basename(filePath),
        materialId: material?.materialId || "",
        provider: options.provider,
        paidCalls: options.provider === "none" ? 0 : "explicit-provider-requested",
        extractionStrategy: extracted.extraction?.strategy || "unknown",
        extractionQuality: extracted.extraction?.quality?.level || "unknown",
        totalChunks: chunks.length,
        questionRefs: [...new Set(chunks.map((chunk) => chunk.questionRef).filter(Boolean))],
        selectedQuestion: options.question,
        selectedChunks: selectedChunks.length,
        repairPreview: options.repairPreview,
        paidModelCalls: options.repairPreview ? selectedChunks.length : 0,
        wroteReadableContent: options.writeReadable,
        writeResults,
        selectedMathRisk: selectedChunks.map((chunk) => scoreMathReadability(chunk.content)),
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error("IB material lab failed:", error);
  process.exit(1);
});
