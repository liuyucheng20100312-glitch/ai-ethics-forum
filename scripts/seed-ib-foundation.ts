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

/**
 * Seeds the minimum IB foundation dictionaries into the current application database.
 * This enables subject lookup and a light-weight local RAG fallback before PostgreSQL
 * and Milvus are configured.
 */
async function seedIbFoundation(): Promise<void> {
  loadEnvLocal();
  const { connectDB } = await import("../lib/mongodb");
  const {
    IB_COMMAND_TERMS_COLLECTION,
    IB_COMMAND_TERM_SEED,
    IB_DISCIPLINES_COLLECTION,
    IB_DISCIPLINE_SEED,
    IB_KNOWLEDGE_POINTS_COLLECTION,
    IB_MATERIALS_COLLECTION,
    IB_MATERIAL_CHUNKS_COLLECTION,
    IB_SUBJECTS_COLLECTION,
    IB_SUBJECT_SEED,
  } = await import("../lib/ib-knowledge");
  const db = await connectDB();

  for (const discipline of IB_DISCIPLINE_SEED) {
    const existing = await db.collection(IB_DISCIPLINES_COLLECTION).findOne({ code: discipline.code } as never);
    if (existing) {
      await db.collection(IB_DISCIPLINES_COLLECTION).updateOne(
        { _id: existing._id as never },
        { $set: discipline }
      );
    } else {
      await db.collection(IB_DISCIPLINES_COLLECTION).insertOne(discipline as never);
    }
  }

  for (const subject of IB_SUBJECT_SEED) {
    const existing = await db.collection(IB_SUBJECTS_COLLECTION).findOne({ code: subject.code } as never);
    if (existing) {
      await db.collection(IB_SUBJECTS_COLLECTION).updateOne(
        { _id: existing._id as never },
        { $set: subject }
      );
    } else {
      await db.collection(IB_SUBJECTS_COLLECTION).insertOne(subject as never);
    }
  }

  for (const commandTerm of IB_COMMAND_TERM_SEED) {
    const existing = await db
      .collection(IB_COMMAND_TERMS_COLLECTION)
      .findOne({ term: commandTerm.term } as never);
    if (existing) {
      await db.collection(IB_COMMAND_TERMS_COLLECTION).updateOne(
        { _id: existing._id as never },
        { $set: commandTerm }
      );
    } else {
      await db.collection(IB_COMMAND_TERMS_COLLECTION).insertOne(commandTerm as never);
    }
  }

  await db.collection(IB_DISCIPLINES_COLLECTION).createIndex({ code: 1 }, { unique: true });
  await db.collection(IB_SUBJECTS_COLLECTION).createIndex({ code: 1 }, { unique: true });
  await db.collection(IB_COMMAND_TERMS_COLLECTION).createIndex({ term: 1 }, { unique: true });
  await db.collection(IB_KNOWLEDGE_POINTS_COLLECTION).createIndex({ code: 1 }, { unique: true });
  await db.collection(IB_MATERIALS_COLLECTION).createIndex({ materialId: 1 });
  await db.collection(IB_MATERIAL_CHUNKS_COLLECTION).createIndex({ milvusVectorId: 1 });

  console.log("IB foundation seed completed.");
}

seedIbFoundation()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Failed to seed IB foundation:", error);
    process.exit(1);
  });
