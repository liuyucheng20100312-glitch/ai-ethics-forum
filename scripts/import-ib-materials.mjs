import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { MongoClient } from "mongodb";
import { loadEnvLocal } from "./lib/env.mjs";

loadEnvLocal();

const IB_MATERIALS_COLLECTION = "ib_materials";
const IB_MATERIAL_CHUNKS_COLLECTION = "ib_material_chunks";

function splitIntoChunks(text, chunkSize, overlapSize) {
  const chunks = [];
  let cursor = 0;

  while (cursor < text.length) {
    const end = Math.min(text.length, cursor + chunkSize);
    chunks.push({
      content: text.slice(cursor, end).trim(),
      startPos: cursor,
      endPos: end,
    });
    if (end >= text.length) {
      break;
    }
    cursor = Math.max(end - overlapSize, cursor + 1);
  }

  return chunks.filter((item) => item.content.length > 0);
}

async function loadOptionalModule(name) {
  try {
    return await import(name);
  } catch {
    throw new Error(`Missing dependency "${name}". Install it before running this script.`);
  }
}

async function extractText(filePath) {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === ".html" || ext === ".htm") {
    const html = await fs.readFile(filePath, "utf8");
    return html
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
  }

  if (ext === ".txt" || ext === ".md") {
    return await fs.readFile(filePath, "utf8");
  }

  if (ext === ".pdf") {
    const pdfParseModule = await loadOptionalModule("pdf-parse");
    const fileBuffer = await fs.readFile(filePath);
    if (typeof pdfParseModule.default === "function") {
      const result = await pdfParseModule.default(fileBuffer);
      return result.text;
    }
    if (typeof pdfParseModule.PDFParse === "function") {
      const parser = new pdfParseModule.PDFParse({ data: fileBuffer });
      try {
        const result = await parser.getText();
        return result.text;
      } finally {
        await parser.destroy?.();
      }
    }
    throw new Error("pdf-parse did not expose a supported parser.");
  }

  if (ext === ".docx") {
    const mammoth = await loadOptionalModule("mammoth");
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value;
  }

  throw new Error(`Unsupported file type: ${ext}`);
}

function approximateTokenCount(text) {
  return Math.ceil(text.length / 4);
}

function createStableChunkId(materialId, chunkIndex) {
  const digest = crypto.createHash("sha256").update(`${materialId}:${chunkIndex}`).digest("hex");
  return `ibc_${digest.slice(0, 48)}`;
}

async function createEmbedding(text) {
  const apiKey =
    process.env.STUDY_ASSISTANT_EMBEDDING_API_KEY ||
    process.env.DASHSCOPE_API_KEY ||
    process.env.ALIBABA_BAILIAN_API_KEY;
  const model = process.env.STUDY_ASSISTANT_EMBEDDING_MODEL || "text-embedding-v4";
  const dimensions = Number(process.env.STUDY_ASSISTANT_EMBEDDING_DIMENSIONS || "1536");
  const apiUrl =
    process.env.STUDY_ASSISTANT_EMBEDDING_API_URL ||
    "https://dashscope.aliyuncs.com/compatible-mode/v1/embeddings";

  if (!apiKey) {
    throw new Error("Embedding API key is missing.");
  }

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      input: text,
      dimensions,
      encoding_format: "float",
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Embedding request failed: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  return data.data?.[0]?.embedding || [];
}

function getMongoConfig() {
  const uri = process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DB || "ai-ethics-forum";

  if (!uri) {
    throw new Error("MONGODB_URI is not configured.");
  }

  return { uri, dbName };
}

function getZillizConfig() {
  const address = process.env.ZILLIZ_CLOUD_ADDRESS || process.env.MILVUS_ADDRESS;
  const token = process.env.ZILLIZ_CLOUD_TOKEN || process.env.MILVUS_TOKEN;
  const collectionName = process.env.ZILLIZ_COLLECTION_NAME || process.env.MILVUS_COLLECTION_NAME || "ib_material_embeddings";

  if (!address) {
    throw new Error("ZILLIZ_CLOUD_ADDRESS is not configured.");
  }

  if (!token) {
    throw new Error("ZILLIZ_CLOUD_TOKEN is not configured.");
  }

  return { address, token, collectionName };
}

function normalizeManifestItem(item, absoluteFilePath, totalTokens) {
  const now = new Date().toISOString();
  const fileType =
    item.fileType || path.extname(absoluteFilePath).replace(".", "").toUpperCase() || "TXT";
  const materialId = item.materialId || crypto.randomUUID();

  return {
    materialId,
    subjectId: Number(item.subjectId || 0),
    subjectCode: item.subjectCode || "",
    type: item.type || "KNOWLEDGE_NOTE",
    title: item.titleCn || item.titleEn || path.basename(absoluteFilePath),
    titleEn: item.titleEn || item.titleCn || path.basename(absoluteFilePath),
    titleCn: item.titleCn || item.titleEn || path.basename(absoluteFilePath),
    hlSl: item.hlSl || "BOTH",
    difficulty: Number(item.difficulty || 3),
    year: item.year || null,
    paper: item.paper || null,
    timezone: item.timezone || null,
    fileUrl: item.fileUrl || absoluteFilePath,
    fileType,
    totalTokens,
    sourceName: item.sourceName || "local",
    sourceUrl: item.sourceUrl || "",
    tags: item.tags || [],
    topics: item.topics || [],
    createdAt: now,
    updatedAt: now,
  };
}

async function safeCreateIndex(collection, keys, options = {}) {
  try {
    await collection.createIndex(keys, options);
  } catch (error) {
    if (error?.code === 86) {
      console.warn(`Skipping existing incompatible index for ${JSON.stringify(keys)}.`);
      return;
    }
    throw error;
  }
}

async function deleteZillizVectors(milvus, collectionName, ids) {
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  if (uniqueIds.length === 0) {
    return;
  }

  await milvus.delete({
    collection_name: collectionName,
    ids: uniqueIds,
  });
}

async function upsertZillizVector(milvus, collectionName, data) {
  const payload = {
    collection_name: collectionName,
    data: [data],
  };

  if (typeof milvus.upsert === "function") {
    await milvus.upsert(payload);
    return;
  }

  await deleteZillizVectors(milvus, collectionName, [data.id]);
  await milvus.insert(payload);
}

async function main() {
  const manifestPath = process.argv[2] || path.join(process.cwd(), "data", "ib", "materials.template.json");
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  const { uri, dbName } = getMongoConfig();
  const { address, token, collectionName } = getZillizConfig();
  const { MilvusClient } = await loadOptionalModule("@zilliz/milvus2-sdk-node");
  const mongo = new MongoClient(uri);
  const milvus = new MilvusClient({
    address,
    token,
  });

  await mongo.connect();
  const db = mongo.db(dbName);

  await safeCreateIndex(db.collection(IB_MATERIALS_COLLECTION), { materialId: 1 });
  await safeCreateIndex(db.collection(IB_MATERIALS_COLLECTION), { subjectCode: 1 });
  await safeCreateIndex(db.collection(IB_MATERIAL_CHUNKS_COLLECTION), { materialId: 1 });
  await safeCreateIndex(db.collection(IB_MATERIAL_CHUNKS_COLLECTION), { milvusVectorId: 1 });

  const materials = manifest.materials || [];
  console.log(`Preparing to import ${materials.length} IB materials.`);

  for (let materialIndex = 0; materialIndex < materials.length; materialIndex += 1) {
    const item = materials[materialIndex];
    const absoluteFilePath = path.isAbsolute(item.localFilePath)
      ? item.localFilePath
      : path.join(process.cwd(), item.localFilePath);
    const rawText = await extractText(absoluteFilePath);
    const totalTokens = approximateTokenCount(rawText);
    const material = normalizeManifestItem(item, absoluteFilePath, totalTokens);

    await db.collection(IB_MATERIALS_COLLECTION).updateOne(
      { materialId: material.materialId },
      { $set: material },
      { upsert: true }
    );

    const chunkSize = item.type === "KNOWLEDGE_NOTE" ? 2400 : 3600;
    const chunks = splitIntoChunks(rawText, item.chunkSize || chunkSize, item.overlapSize || 300);
    console.log(
      `[${materialIndex + 1}/${materials.length}] ${material.title} -> ${chunks.length} chunks`
    );
    const stableChunkIds = chunks.map((_, index) => item.chunkIds?.[index] || createStableChunkId(material.materialId, index));
    const staleChunks = await db
      .collection(IB_MATERIAL_CHUNKS_COLLECTION)
      .find({
        materialId: material.materialId,
        milvusVectorId: { $nin: stableChunkIds },
      })
      .project({ milvusVectorId: 1 })
      .toArray();
    const staleVectorIds = staleChunks.map((chunk) => chunk.milvusVectorId).filter(Boolean);

    await deleteZillizVectors(milvus, collectionName, staleVectorIds);
    if (staleVectorIds.length > 0) {
      await db.collection(IB_MATERIAL_CHUNKS_COLLECTION).deleteMany({
        materialId: material.materialId,
        milvusVectorId: { $in: staleVectorIds },
      });
    }

    for (let index = 0; index < chunks.length; index += 1) {
      const chunk = chunks[index];
      const embedding = await createEmbedding(chunk.content);
      const milvusVectorId = stableChunkIds[index];
      const tokenCount = approximateTokenCount(chunk.content);

      await upsertZillizVector(milvus, collectionName, {
        id: milvusVectorId,
        embedding,
        subject_id: material.subjectId,
        subject_code: material.subjectCode,
        knowledge_point_ids: item.knowledgePointIds || [],
        material_type: material.type,
        hl_sl: material.hlSl,
        difficulty: material.difficulty,
        chunk_token_count: tokenCount,
      });

      await db.collection(IB_MATERIAL_CHUNKS_COLLECTION).updateOne(
        { milvusVectorId },
        {
          $set: {
            materialId: material.materialId,
            subjectId: material.subjectId,
            subjectCode: material.subjectCode,
            title: material.title,
            materialType: material.type,
            hlSl: material.hlSl,
            difficulty: material.difficulty,
            year: material.year,
            paper: material.paper,
            timezone: material.timezone,
            knowledgePointIds: item.knowledgePointIds || [],
            knowledgePointNames: item.knowledgePointNames || [],
            tags: material.tags,
            topics: material.topics,
            chunkIndex: index,
            content: chunk.content,
            startPos: chunk.startPos,
            endPos: chunk.endPos,
            tokenCount,
            milvusVectorId,
            updatedAt: new Date().toISOString(),
          },
          $setOnInsert: {
            createdAt: new Date().toISOString(),
          },
        },
        { upsert: true }
      );
    }
  }

  await milvus.loadCollection({ collection_name: collectionName });
  await mongo.close();
  await milvus.closeConnection?.();
  console.log("IB materials import completed with MongoDB metadata and Zilliz vectors.");
}

main().catch((error) => {
  console.error("Failed to import IB materials:", error);
  process.exit(1);
});
