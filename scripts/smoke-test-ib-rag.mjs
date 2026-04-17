import { MongoClient } from "mongodb";
import { loadEnvLocal } from "./lib/env.mjs";

loadEnvLocal();

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
    throw new Error(`Embedding request failed: ${response.status} ${await response.text()}`);
  }

  const data = await response.json();
  return data.data?.[0]?.embedding || [];
}

async function main() {
  const mongo = new MongoClient(process.env.MONGODB_URI);
  const { MilvusClient } = await loadOptionalModule("@zilliz/milvus2-sdk-node");
  const milvus = new MilvusClient({
    address: process.env.ZILLIZ_CLOUD_ADDRESS,
    token: process.env.ZILLIZ_CLOUD_TOKEN,
  });
  const dbName = process.env.MONGODB_DB || "ai-ethics-forum";
  const collectionName = process.env.ZILLIZ_COLLECTION_NAME || "ib_material_embeddings";
  const query = "IB Math AA calculus functions reasoning";
  const embedding = await createEmbedding(query);

  await mongo.connect();
  const db = mongo.db(dbName);
  const searchResult = await milvus.search({
    collection_name: collectionName,
    vector: embedding,
    filter: 'subject_code == "MAA"',
    limit: 3,
    output_fields: ["id", "subject_code", "material_type"],
    params: { nprobe: Number(process.env.ZILLIZ_NPROBE || "10") },
  });

  const ids = (searchResult.results || []).map((item) => item.id).filter(Boolean);
  const chunks = ids.length
    ? await db.collection("ib_material_chunks").find({ milvusVectorId: { $in: ids } }).toArray()
    : [];

  console.log(
    JSON.stringify(
      {
        vectorHits: ids.length,
        mongoChunks: chunks.length,
        titles: chunks.map((chunk) => chunk.title).slice(0, 3),
      },
      null,
      2
    )
  );

  await mongo.close();
  await milvus.closeConnection?.();
}

main().catch((error) => {
  console.error("IB RAG smoke test failed:", error);
  process.exit(1);
});
