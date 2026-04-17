import { createQwenEmbedding, isQwenEmbeddingConfigured, rerankWithQwen } from "@/lib/qwen-rag";

export interface ZillizSearchFilter {
  subjectId?: number;
  subjectCode?: string;
  hlSl?: string;
  materialTypes?: string[];
}

export interface ZillizSearchHit {
  id: string;
  score: number;
  subjectId?: number;
  subjectCode?: string;
  materialType?: string;
  hlSl?: string;
  difficulty?: number;
  chunkTokenCount?: number;
}

type MilvusModule = {
  MilvusClient: new (options: { address: string; token?: string; username?: string; password?: string }) => {
    search: (options: Record<string, unknown>) => Promise<unknown>;
    loadCollection: (options: Record<string, unknown>) => Promise<unknown>;
    closeConnection?: () => Promise<unknown>;
  };
};

function isZillizConfigured(): boolean {
  return Boolean(process.env.ZILLIZ_CLOUD_ADDRESS && process.env.ZILLIZ_CLOUD_TOKEN);
}

async function importMilvusSdk(): Promise<MilvusModule> {
  const importer = new Function("specifier", "return import(specifier)") as (
    specifier: string
  ) => Promise<MilvusModule>;
  return await importer("@zilliz/milvus2-sdk-node");
}

function buildFilterExpr(filter: ZillizSearchFilter): string {
  const conditions: string[] = [];

  if (filter.subjectId !== undefined) {
    conditions.push(`subject_id == ${filter.subjectId}`);
  }

  if (filter.subjectCode) {
    conditions.push(`subject_code == "${filter.subjectCode}"`);
  }

  if (filter.hlSl && filter.hlSl !== "BOTH") {
    conditions.push(`hl_sl in ["${filter.hlSl}", "BOTH"]`);
  }

  if (filter.materialTypes && filter.materialTypes.length > 0) {
    conditions.push(`material_type in ["${filter.materialTypes.join('","')}"]`);
  }

  return conditions.join(" && ");
}

function normalizeSearchResult(raw: unknown): ZillizSearchHit[] {
  const maybeResults = raw as {
    results?: Array<Record<string, unknown>>;
    status?: unknown;
  };
  const results = Array.isArray(maybeResults.results) ? maybeResults.results : [];

  return results.map((item) => ({
    id: String(item.id || item.milvus_vector_id || ""),
    score: typeof item.score === "number" ? item.score : Number(item.distance || 0),
    subjectId: typeof item.subject_id === "number" ? item.subject_id : undefined,
    subjectCode: typeof item.subject_code === "string" ? item.subject_code : undefined,
    materialType: typeof item.material_type === "string" ? item.material_type : undefined,
    hlSl: typeof item.hl_sl === "string" ? item.hl_sl : undefined,
    difficulty: typeof item.difficulty === "number" ? item.difficulty : undefined,
    chunkTokenCount: typeof item.chunk_token_count === "number" ? item.chunk_token_count : undefined,
  }));
}

export async function searchZillizByText(
  query: string,
  filter: ZillizSearchFilter = {},
  limit = 20
): Promise<ZillizSearchHit[]> {
  if (!isZillizConfigured() || !isQwenEmbeddingConfigured()) {
    return [];
  }

  const { embedding } = await createQwenEmbedding(query);
  const { MilvusClient } = await importMilvusSdk();
  const collectionName = process.env.ZILLIZ_COLLECTION_NAME || "ib_material_embeddings";
  const client = new MilvusClient({
    address: process.env.ZILLIZ_CLOUD_ADDRESS || "",
    token: process.env.ZILLIZ_CLOUD_TOKEN,
  });

  try {
    await client.loadCollection({ collection_name: collectionName });
    const filterExpr = buildFilterExpr(filter);
    const result = await client.search({
      collection_name: collectionName,
      vector: embedding,
      filter: filterExpr || undefined,
      limit,
      output_fields: [
        "id",
        "subject_id",
        "subject_code",
        "material_type",
        "hl_sl",
        "difficulty",
        "chunk_token_count",
      ],
      params: { nprobe: Number(process.env.ZILLIZ_NPROBE || "10") },
    });

    return normalizeSearchResult(result);
  } finally {
    await client.closeConnection?.();
  }
}

export async function rerankZillizTextHits<T extends { id: string; content: string }>(
  query: string,
  hits: T[],
  topN = 8
): Promise<T[]> {
  const reranked = await rerankWithQwen(
    query,
    hits.map((hit) => ({
      id: hit.id,
      text: hit.content,
      metadata: hit,
    })),
    topN
  );

  if (reranked.length === 0) {
    return hits.slice(0, topN);
  }

  return reranked.map((item) => item.metadata as T);
}
