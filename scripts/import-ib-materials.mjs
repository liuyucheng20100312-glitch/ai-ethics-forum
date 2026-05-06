import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { MongoClient } from "mongodb";
import { loadEnvLocal } from "./lib/env.mjs";
import {
  approximateTokenCount,
  createStableChunkId,
  extractTextFromMaterial,
  splitIntoChunks,
} from "./lib/ib-material-text.mjs";
import { describeMaterialPathResolution, resolveExistingMaterialPath } from "./lib/ib-paths.mjs";

loadEnvLocal();

const IB_MATERIALS_COLLECTION = "ib_materials";
const IB_MATERIAL_CHUNKS_COLLECTION = "ib_material_chunks";

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    manifest: "",
    progressFile: "",
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!options.manifest && !arg.startsWith("--")) {
      options.manifest = arg;
      continue;
    }
    if (arg === "--manifest" && args[index + 1]) {
      options.manifest = args[index + 1];
      index += 1;
    } else if (arg === "--progress-file" && args[index + 1]) {
      options.progressFile = args[index + 1];
      index += 1;
    }
  }

  return options;
}

async function loadOptionalModule(name) {
  try {
    return await import(name);
  } catch {
    throw new Error(`Missing dependency "${name}". Install it before running this script.`);
  }
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

function normalizeManifestItem(item, absoluteFilePath, totalTokens, extraction) {
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
    localFilePath: item.localFilePath || "",
    resolvedFilePath: absoluteFilePath,
    fileUrl: item.fileUrl || absoluteFilePath,
    fileType,
    totalTokens,
    sourceName: item.sourceName || "local",
    sourceUrl: item.sourceUrl || "",
    tags: item.tags || [],
    topics: item.topics || [],
    textExtraction: extraction || null,
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

async function readProgressState(progressFilePath) {
  if (!progressFilePath) {
    return {
      completedMaterialIds: [],
      completedItems: [],
    };
  }

  try {
    const content = await fs.readFile(progressFilePath, "utf8");
    const parsed = JSON.parse(content);
    return {
      completedMaterialIds: Array.isArray(parsed.completedMaterialIds) ? parsed.completedMaterialIds : [],
      completedItems: Array.isArray(parsed.completedItems) ? parsed.completedItems : [],
      manifestPath: parsed.manifestPath || "",
      updatedAt: parsed.updatedAt || "",
    };
  } catch {
    return {
      completedMaterialIds: [],
      completedItems: [],
    };
  }
}

async function writeProgressState(progressFilePath, state) {
  if (!progressFilePath) {
    return;
  }

  await fs.mkdir(path.dirname(progressFilePath), { recursive: true });
  const tempPath = `${progressFilePath}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(state, null, 2), "utf8");
  await fs.rename(tempPath, progressFilePath);
}

async function markProgressCompleted(progressFilePath, state, material) {
  if (!progressFilePath || !material?.materialId) {
    return;
  }

  if (!state.completedMaterialIds.includes(material.materialId)) {
    state.completedMaterialIds.push(material.materialId);
  }

  state.completedItems = (state.completedItems || []).filter(
    (item) => item.materialId !== material.materialId
  );
  state.completedItems.push({
    materialId: material.materialId,
    title: material.title,
    completedAt: new Date().toISOString(),
  });
  state.updatedAt = new Date().toISOString();
  state.lastCompletedMaterialId = material.materialId;
  state.lastCompletedTitle = material.title;

  await writeProgressState(progressFilePath, state);
}

async function main() {
  const options = parseArgs();
  const manifestPath = options.manifest
    ? path.isAbsolute(options.manifest)
      ? options.manifest
      : path.join(process.cwd(), options.manifest)
    : path.join(process.cwd(), "data", "ib", "materials.template.json");
  const progressFilePath = options.progressFile
    ? path.isAbsolute(options.progressFile)
      ? options.progressFile
      : path.join(process.cwd(), options.progressFile)
    : "";
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
  await safeCreateIndex(db.collection(IB_MATERIALS_COLLECTION), { year: 1, subjectCode: 1 });
  await safeCreateIndex(db.collection(IB_MATERIAL_CHUNKS_COLLECTION), { materialId: 1 });
  await safeCreateIndex(db.collection(IB_MATERIAL_CHUNKS_COLLECTION), { milvusVectorId: 1 });
  await safeCreateIndex(db.collection(IB_MATERIAL_CHUNKS_COLLECTION), { subjectCode: 1, year: 1 });

  const materials = manifest.materials || [];
  const progressState = await readProgressState(progressFilePath);
  progressState.manifestPath = manifestPath;
  progressState.progressFilePath = progressFilePath || "";
  const completedMaterialIds = new Set(progressState.completedMaterialIds || []);
  const remainingMaterials = materials.filter((item) => !completedMaterialIds.has(item.materialId));
  console.log(`Preparing to import ${remainingMaterials.length} IB materials.`);
  if (progressFilePath) {
    console.log(
      `Resume progress: ${completedMaterialIds.size} completed, ${remainingMaterials.length} remaining.`
    );
  }

  for (let materialIndex = 0; materialIndex < remainingMaterials.length; materialIndex += 1) {
    const item = remainingMaterials[materialIndex];
    const absoluteFilePath = resolveExistingMaterialPath(item.localFilePath || item.fileUrl);
    if (!absoluteFilePath) {
      const resolution = describeMaterialPathResolution(item.localFilePath || item.fileUrl);
      throw new Error(
        `Unable to resolve source file for ${item.titleCn || item.titleEn || item.materialId}. Checked: ${resolution.candidates.join(", ")}`
      );
    }
    const extracted = await extractTextFromMaterial(absoluteFilePath, {
      title: item.titleCn || item.titleEn || item.materialId,
      materialType: item.type,
    });
    const rawText = extracted.text;
    const totalTokens = approximateTokenCount(rawText);
    const material = normalizeManifestItem(item, absoluteFilePath, totalTokens, extracted.extraction);
    console.log(
      `[${materialIndex + 1}/${remainingMaterials.length}] ${material.title} -> extraction ${material.textExtraction?.strategy || "unknown"} (${material.textExtraction?.quality?.level || "unknown"})`
    );

    await db.collection(IB_MATERIALS_COLLECTION).updateOne(
      { materialId: material.materialId },
      { $set: material },
      { upsert: true }
    );

    const chunkSize = item.type === "KNOWLEDGE_NOTE" ? 2400 : 3600;
    const chunks = splitIntoChunks(rawText, item.chunkSize || chunkSize, item.overlapSize || 300, {
      materialType: material.type,
    });
    console.log(
      `[${materialIndex + 1}/${remainingMaterials.length}] ${material.title} -> ${chunks.length} chunks`
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
            questionRef: chunk.questionRef || "",
            content: chunk.content,
            startPos: chunk.startPos,
            endPos: chunk.endPos,
            tokenCount,
            milvusVectorId,
            textExtractionStrategy: material.textExtraction?.strategy || "unknown",
            textExtractionQualityLevel: material.textExtraction?.quality?.level || "unknown",
            updatedAt: new Date().toISOString(),
          },
          $setOnInsert: {
            createdAt: new Date().toISOString(),
          },
        },
        { upsert: true }
      );
    }

    await markProgressCompleted(progressFilePath, progressState, material);
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
