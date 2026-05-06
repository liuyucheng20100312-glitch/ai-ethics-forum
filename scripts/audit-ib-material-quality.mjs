import fs from "node:fs/promises";
import path from "node:path";
import { MongoClient } from "mongodb";
import { loadEnvLocal } from "./lib/env.mjs";
import { deriveLogicalMaterialPath } from "./lib/ib-paths.mjs";
import { evaluateExtractedTextQuality } from "./lib/ib-material-text.mjs";

loadEnvLocal();

const IB_MATERIALS_COLLECTION = "ib_materials";
const IB_MATERIAL_CHUNKS_COLLECTION = "ib_material_chunks";

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    subjects: "",
    years: "",
    types: "",
    limit: 0,
    out: "",
    manifestOut: "",
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--subjects" && args[index + 1]) {
      options.subjects = args[index + 1];
      index += 1;
    } else if (arg === "--years" && args[index + 1]) {
      options.years = args[index + 1];
      index += 1;
    } else if (arg === "--types" && args[index + 1]) {
      options.types = args[index + 1];
      index += 1;
    } else if (arg === "--limit" && args[index + 1]) {
      options.limit = Number(args[index + 1]) || 0;
      index += 1;
    } else if (arg === "--out" && args[index + 1]) {
      options.out = args[index + 1];
      index += 1;
    } else if (arg === "--manifest-out" && args[index + 1]) {
      options.manifestOut = args[index + 1];
      index += 1;
    }
  }

  return options;
}

function csvToSet(value) {
  return new Set(
    String(value || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
  );
}

function getMongoConfig() {
  const uri = process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DB || "ai-ethics-forum";

  if (!uri) {
    throw new Error("MONGODB_URI is not configured.");
  }

  return { uri, dbName };
}

function matchesFilter(material, subjects, years, types) {
  if (subjects.size > 0) {
    const subjectCode = String(material.subjectCode || "").toUpperCase();
    const title = String(material.title || material.titleCn || material.titleEn || "").toUpperCase();
    const matched = [...subjects].some((subject) => subjectCode === subject || title.includes(subject));
    if (!matched) {
      return false;
    }
  }
  if (years.size > 0 && !years.has(String(material.year || ""))) {
    return false;
  }
  if (types.size > 0 && !types.has(String(material.type || ""))) {
    return false;
  }
  return true;
}

function buildReimportManifestItem(material) {
  const localFilePath =
    String(material.localFilePath || "").trim() ||
    deriveLogicalMaterialPath(material.resolvedFilePath || material.fileUrl || "") ||
    String(material.fileUrl || "").trim();

  return {
    materialId: String(material.materialId || ""),
    subjectId: Number(material.subjectId || 0),
    subjectCode: String(material.subjectCode || ""),
    type: String(material.type || "KNOWLEDGE_NOTE"),
    titleEn: String(material.titleEn || material.title || ""),
    titleCn: String(material.titleCn || material.title || ""),
    hlSl: String(material.hlSl || "BOTH"),
    difficulty: Number(material.difficulty || 3),
    year: material.year || null,
    paper: material.paper || null,
    timezone: material.timezone || null,
    localFilePath,
    fileUrl: "",
    fileType: String(material.fileType || "PDF"),
    sourceName: String(material.sourceName || "local-ib-past-paper-archive"),
    sourceUrl: String(material.sourceUrl || ""),
    tags: Array.isArray(material.tags) ? material.tags : [],
    topics: Array.isArray(material.topics) ? material.topics : [],
    knowledgePointIds: [],
    knowledgePointNames: [],
    chunkSize: material.type === "MARK_SCHEME" ? 3600 : 3000,
    overlapSize: 300,
  };
}

async function main() {
  const options = parseArgs();
  const subjects = csvToSet(options.subjects.toUpperCase());
  const years = csvToSet(options.years);
  const types = csvToSet(options.types.toUpperCase());
  const { uri, dbName } = getMongoConfig();
  const mongo = new MongoClient(uri);

  await mongo.connect();
  const db = mongo.db(dbName);

  const materials = await db.collection(IB_MATERIALS_COLLECTION).find({}).toArray();
  const flagged = [];
  let scanned = 0;

  for (const material of materials) {
    if (!matchesFilter(material, subjects, years, types)) {
      continue;
    }
    scanned += 1;

    const chunks = await db
      .collection(IB_MATERIAL_CHUNKS_COLLECTION)
      .find({ materialId: material.materialId })
      .project({ content: 1, chunkIndex: 1, milvusVectorId: 1 })
      .toArray();

    const chunkReports = chunks
      .map((chunk) => {
        const quality = evaluateExtractedTextQuality(String(chunk.content || ""));
        return {
          chunkIndex: Number(chunk.chunkIndex || 0),
          milvusVectorId: String(chunk.milvusVectorId || ""),
          quality,
          snippet: String(chunk.content || "").replace(/\s+/g, " ").slice(0, 260),
        };
      })
      .filter((report) => report.quality.level !== "good")
      .sort((left, right) => right.quality.suspiciousRatio - left.quality.suspiciousRatio);

    const persistedQuality = material.textExtraction?.quality || null;
    const persistedInitialQuality = material.textExtraction?.initialQuality || null;
    const needsReview = Boolean(material.textExtraction?.reviewRequired);
    const isPersistedPoor =
      (persistedQuality && ["poor", "warn"].includes(String(persistedQuality.level || "").toLowerCase())) ||
      (persistedInitialQuality &&
        ["poor", "warn"].includes(String(persistedInitialQuality.level || "").toLowerCase())) ||
      needsReview;

    if (chunkReports.length === 0 && !isPersistedPoor) {
      continue;
    }

    flagged.push({
      materialId: String(material.materialId || ""),
      title: String(material.title || material.titleCn || material.titleEn || ""),
      subjectId: Number(material.subjectId || 0),
      subjectCode: String(material.subjectCode || ""),
      year: material.year || null,
      type: String(material.type || ""),
      hlSl: String(material.hlSl || ""),
      difficulty: Number(material.difficulty || 3),
      paper: String(material.paper || ""),
      timezone: String(material.timezone || ""),
      fileType: String(material.fileType || "PDF"),
      localFilePath: String(material.localFilePath || ""),
      resolvedFilePath: String(material.resolvedFilePath || material.fileUrl || ""),
      sourceName: String(material.sourceName || "local-ib-past-paper-archive"),
      sourceUrl: String(material.sourceUrl || ""),
      tags: Array.isArray(material.tags) ? material.tags : [],
      topics: Array.isArray(material.topics) ? material.topics : [],
      extractionStrategy: String(material.textExtraction?.strategy || ""),
      extractionQuality: persistedQuality,
      extractionInitialQuality: persistedInitialQuality,
      reviewRequired: needsReview,
      flaggedChunks: chunkReports.slice(0, 3),
    });

    if (options.limit > 0 && flagged.length >= options.limit) {
      break;
    }
  }

  flagged.sort((left, right) => {
    const leftScore = left.flaggedChunks[0]?.quality?.suspiciousRatio || 0;
    const rightScore = right.flaggedChunks[0]?.quality?.suspiciousRatio || 0;
    return rightScore - leftScore;
  });

  if (options.out) {
    const outPath = path.isAbsolute(options.out) ? options.out : path.join(process.cwd(), options.out);
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await fs.writeFile(outPath, JSON.stringify({ generatedAt: new Date().toISOString(), flagged }, null, 2), "utf8");
  }

  if (options.manifestOut) {
    const manifestOutPath = path.isAbsolute(options.manifestOut)
      ? options.manifestOut
      : path.join(process.cwd(), options.manifestOut);
    await fs.mkdir(path.dirname(manifestOutPath), { recursive: true });
    await fs.writeFile(
      manifestOutPath,
      JSON.stringify({ materials: flagged.map((item) => buildReimportManifestItem(item)) }, null, 2),
      "utf8"
    );
  }

  const bySubject = flagged.reduce((accumulator, item) => {
    const key = item.subjectCode || "UNKNOWN";
    accumulator[key] = (accumulator[key] || 0) + 1;
    return accumulator;
  }, {});

  console.log(
    JSON.stringify(
      {
        scanned,
        flagged: flagged.length,
        bySubject,
        outputPath: options.out || null,
        manifestOutPath: options.manifestOut || null,
      },
      null,
      2
    )
  );

  await mongo.close();
}

main().catch((error) => {
  console.error("Failed to audit IB material quality:", error);
  process.exit(1);
});
