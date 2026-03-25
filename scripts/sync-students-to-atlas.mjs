/**
 * Syncs .localdb/students.json → MongoDB Atlas "students" collection.
 * Runs automatically as part of `vercel-build` before Next.js build.
 * Safe to run multiple times (upserts by username).
 */
import { MongoClient } from "mongodb";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const URI =
  process.env.MONGODB_URI ||
  "mongodb://admin:kslmFVQVylH2VXgD@119.91.221.122:8081/?authSource=admin";
const DB_NAME = process.env.MONGODB_DB || "ai-ethics-forum";

const studentsFile = path.join(__dirname, "../.localdb/students.json");

async function main() {
  if (!fs.existsSync(studentsFile)) {
    console.error("❌ .localdb/students.json not found, skipping sync");
    return;
  }

  const students = JSON.parse(fs.readFileSync(studentsFile, "utf8"));
  console.log(`📋 Found ${students.length} students to sync to Atlas...`);

  let client;
  try {
    client = new MongoClient(URI, { serverSelectionTimeoutMS: 10000, connectTimeoutMS: 10000 });
    await client.connect();
    const db = client.db(DB_NAME);
    const col = db.collection("students");

    // Upsert each student by username
    let upserted = 0;
    for (const s of students) {
      await col.updateOne(
        { username: s.username },
        { $set: { username: s.username, realName: s.realName, classId: s.classId } },
        { upsert: true }
      );
      upserted++;
    }

    await col.createIndex({ username: 1 }, { unique: true });
    console.log(`✅ Synced ${upserted} students to Atlas successfully`);
  } catch (err) {
    console.warn("⚠️  Could not sync students to Atlas:", err.message);
    console.warn("   (This is OK if Atlas is unavailable — local JSON fallback will be used)");
  } finally {
    if (client) await client.close();
  }
}

main();
