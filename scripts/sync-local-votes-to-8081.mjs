import fs from "fs";
import path from "path";
import { MongoClient, ObjectId } from "mongodb";

const URI =
  process.env.MONGODB_URI ||
  "mongodb://admin:kslmFVQVylH2VXgD@119.91.221.122:8081/?authSource=admin";
const DB_NAME = process.env.MONGODB_DB || "ai-ethics-forum";
const LOCAL_FILE = path.join(process.cwd(), ".localdb", "vote_topics.json");

function uniqueVotes(votes) {
  return Array.from(new Set((Array.isArray(votes) ? votes : []).map(String)));
}

function uniqueOpinions(opinions) {
  const seen = new Set();
  const result = [];
  for (const op of Array.isArray(opinions) ? opinions : []) {
    if (!op || typeof op !== "object") continue;
    const user = String(op.user || "").trim();
    const text = String(op.text || "").trim();
    const createdAt = op.createdAt ? new Date(op.createdAt).toISOString() : new Date().toISOString();
    if (!user || !text) continue;
    const key = `${user}::${text}::${createdAt}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ user, text, createdAt });
  }
  return result;
}

function normalizeTopic(raw) {
  const options = (Array.isArray(raw.options) ? raw.options : []).map((opt) => ({
    name: String(opt?.name || ""),
    votes: uniqueVotes(opt?.votes),
    opinions: uniqueOpinions(opt?.opinions),
  }));

  for (const [key, value] of Object.entries(raw)) {
    const match = key.match(/^options\.(\d+)\.(votes|opinions)$/);
    if (!match) continue;
    const idx = Number(match[1]);
    const field = match[2];
    if (!options[idx]) options[idx] = { name: `选项${idx + 1}`, votes: [], opinions: [] };
    if (field === "votes") {
      options[idx].votes = uniqueVotes([...(options[idx].votes || []), ...(Array.isArray(value) ? value : [])]);
    } else {
      options[idx].opinions = uniqueOpinions([...(options[idx].opinions || []), ...(Array.isArray(value) ? value : [])]);
    }
  }

  return {
    _id: raw._id,
    title: String(raw.title || ""),
    description: String(raw.description || ""),
    author: String(raw.author || "unknown"),
    createdAt: raw.createdAt ? new Date(raw.createdAt) : new Date(),
    options,
  };
}

async function findRemoteTopic(collection, normalized) {
  const id = normalized._id;
  if (id) {
    try {
      const byObjId = await collection.findOne({ _id: new ObjectId(String(id)) });
      if (byObjId) return byObjId;
    } catch {
      // ignore invalid ObjectId
    }
    const byStrId = await collection.findOne({ _id: String(id) });
    if (byStrId) return byStrId;
  }

  return collection.findOne({
    title: normalized.title,
    author: normalized.author,
  });
}

function mergeRemoteOptions(remoteOptions, localOptions) {
  const maxLen = Math.max(remoteOptions.length, localOptions.length);
  const merged = [];

  for (let i = 0; i < maxLen; i++) {
    const ro = remoteOptions[i] || {};
    const lo = localOptions[i] || {};
    merged.push({
      name: String(ro.name || lo.name || `选项${i + 1}`),
      votes: uniqueVotes([...(Array.isArray(ro.votes) ? ro.votes : []), ...(Array.isArray(lo.votes) ? lo.votes : [])]),
      opinions: uniqueOpinions([...(Array.isArray(ro.opinions) ? ro.opinions : []), ...(Array.isArray(lo.opinions) ? lo.opinions : [])]),
    });
  }

  return merged;
}

async function main() {
  if (!fs.existsSync(LOCAL_FILE)) {
    console.log("No local vote_topics file found, nothing to sync.");
    return;
  }

  const raw = JSON.parse(fs.readFileSync(LOCAL_FILE, "utf8"));
  const localTopics = Array.isArray(raw) ? raw : [];
  if (localTopics.length === 0) {
    console.log("Local vote_topics is empty, nothing to sync.");
    return;
  }

  const client = new MongoClient(URI, {
    serverSelectionTimeoutMS: 30000,
    connectTimeoutMS: 30000,
  });

  await client.connect();
  const db = client.db(DB_NAME);
  const collection = db.collection("vote_topics");

  let inserted = 0;
  let updated = 0;

  for (const topic of localTopics) {
    const normalized = normalizeTopic(topic);
    if (!normalized.title || normalized.options.length === 0) continue;

    const remote = await findRemoteTopic(collection, normalized);
    if (!remote) {
      const toInsert = {
        title: normalized.title,
        description: normalized.description,
        options: normalized.options,
        author: normalized.author,
        createdAt: normalized.createdAt,
      };
      await collection.insertOne(toInsert);
      inserted += 1;
      continue;
    }

    const mergedOptions = mergeRemoteOptions(
      Array.isArray(remote.options) ? remote.options : [],
      normalized.options,
    );

    await collection.updateOne(
      { _id: remote._id },
      {
        $set: {
          options: mergedOptions,
          description: remote.description || normalized.description,
        },
      },
    );
    updated += 1;
  }

  await client.close();
  console.log(`Sync complete. inserted=${inserted}, updated=${updated}, totalLocal=${localTopics.length}`);
}

main().catch((err) => {
  console.error("Sync failed:", err.message);
  process.exit(1);
});
