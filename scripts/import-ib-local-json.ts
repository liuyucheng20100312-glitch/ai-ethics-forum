import fs from "fs";
import path from "path";

function loadEnvLocal(): void {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) {
    return;
  }

  const content = fs.readFileSync(envPath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, "");
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

interface ImportPayload {
  disciplines?: Record<string, unknown>[];
  subjects?: Record<string, unknown>[];
  commandTerms?: Record<string, unknown>[];
  knowledgePoints?: Record<string, unknown>[];
  materials?: Record<string, unknown>[];
  materialChunks?: Record<string, unknown>[];
}

function readJson(filePath: string): ImportPayload {
  const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
  const raw = fs.readFileSync(absolutePath, "utf8");
  return JSON.parse(raw) as ImportPayload;
}

async function upsertMany(
  collectionName: string,
  items: Record<string, unknown>[],
  uniqueKey: string
): Promise<void> {
  const { connectDB } = await import("../lib/mongodb");
  const db = await connectDB();

  for (const item of items) {
    const uniqueValue = item[uniqueKey];
    if (!uniqueValue) {
      continue;
    }

    const existing = await db.collection(collectionName).findOne({ [uniqueKey]: uniqueValue } as never);
    if (existing) {
      await db.collection(collectionName).updateOne({ _id: existing._id as never }, { $set: item });
    } else {
      await db.collection(collectionName).insertOne(item as never);
    }
  }
}

async function main(): Promise<void> {
  loadEnvLocal();
  const {
    IB_COMMAND_TERMS_COLLECTION,
    IB_DISCIPLINES_COLLECTION,
    IB_KNOWLEDGE_POINTS_COLLECTION,
    IB_MATERIALS_COLLECTION,
    IB_MATERIAL_CHUNKS_COLLECTION,
    IB_SUBJECTS_COLLECTION,
  } = await import("../lib/ib-knowledge");
  const inputPath = process.argv[2] || "data/ib/foundation-seed.json";
  const payload = readJson(inputPath);

  await upsertMany(IB_DISCIPLINES_COLLECTION, payload.disciplines || [], "code");
  await upsertMany(IB_SUBJECTS_COLLECTION, payload.subjects || [], "code");
  await upsertMany(IB_COMMAND_TERMS_COLLECTION, payload.commandTerms || [], "term");
  await upsertMany(IB_KNOWLEDGE_POINTS_COLLECTION, payload.knowledgePoints || [], "code");
  await upsertMany(IB_MATERIALS_COLLECTION, payload.materials || [], "materialId");
  await upsertMany(IB_MATERIAL_CHUNKS_COLLECTION, payload.materialChunks || [], "milvusVectorId");

  console.log(`Imported IB local JSON payload from ${inputPath}.`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Failed to import local IB JSON:", error);
    process.exit(1);
  });
