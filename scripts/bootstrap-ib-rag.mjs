import { loadEnvLocal } from "./lib/env.mjs";

loadEnvLocal();

async function loadOptionalModule(name) {
  try {
    return await import(name);
  } catch {
    throw new Error(`Missing dependency "${name}". Install the required package before running this script.`);
  }
}

function getZillizConfig() {
  const address = process.env.ZILLIZ_CLOUD_ADDRESS || process.env.MILVUS_ADDRESS;
  const token = process.env.ZILLIZ_CLOUD_TOKEN || process.env.MILVUS_TOKEN;
  const collectionName =
    process.env.ZILLIZ_COLLECTION_NAME || process.env.MILVUS_COLLECTION_NAME || "ib_material_embeddings";
  const vectorDimension = Number(
    process.env.STUDY_ASSISTANT_EMBEDDING_DIMENSIONS || process.env.EMBEDDING_DIMENSIONS || "1536"
  );

  if (!address) {
    throw new Error("ZILLIZ_CLOUD_ADDRESS is not configured.");
  }

  if (!token) {
    throw new Error("ZILLIZ_CLOUD_TOKEN is not configured.");
  }

  return {
    address,
    token,
    collectionName,
    vectorDimension,
  };
}

async function bootstrapZilliz() {
  const { address, token, collectionName, vectorDimension } = getZillizConfig();
  const { MilvusClient, DataType } = await loadOptionalModule("@zilliz/milvus2-sdk-node");
  const client = new MilvusClient({
    address,
    token,
  });

  const hasCollection = await client.hasCollection({
    collection_name: collectionName,
  });

  if (!hasCollection.value) {
    await client.createCollection({
      collection_name: collectionName,
      fields: [
        {
          name: "id",
          data_type: DataType.VarChar,
          is_primary_key: true,
          max_length: 100,
        },
        {
          name: "embedding",
          data_type: DataType.FloatVector,
          dim: vectorDimension,
        },
        { name: "subject_id", data_type: DataType.Int64 },
        {
          name: "subject_code",
          data_type: DataType.VarChar,
          max_length: 50,
        },
        {
          name: "knowledge_point_ids",
          data_type: DataType.Array,
          element_type: DataType.Int64,
          max_capacity: 32,
        },
        {
          name: "material_type",
          data_type: DataType.VarChar,
          max_length: 50,
        },
        {
          name: "hl_sl",
          data_type: DataType.VarChar,
          max_length: 10,
        },
        { name: "difficulty", data_type: DataType.Int64 },
        { name: "chunk_token_count", data_type: DataType.Int64 },
      ],
    });
  }

  await client.createIndex({
    collection_name: collectionName,
    field_name: "embedding",
    index_name: "embedding_index",
    index_type: "IVF_FLAT",
    metric_type: "COSINE",
    params: { nlist: Number(process.env.ZILLIZ_NLIST || "1024") },
  });

  await client.createIndex({
    collection_name: collectionName,
    field_name: "subject_code",
    index_name: "subject_code_index",
    index_type: "STL_SORT",
  });

  await client.createIndex({
    collection_name: collectionName,
    field_name: "material_type",
    index_name: "material_type_index",
    index_type: "STL_SORT",
  });

  await client.loadCollection({
    collection_name: collectionName,
  });

  await client.closeConnection?.();
  console.log(`Zilliz collection "${collectionName}" initialized.`);
}

bootstrapZilliz().catch((error) => {
  console.error("Failed to bootstrap IB RAG infrastructure:", error);
  process.exit(1);
});
