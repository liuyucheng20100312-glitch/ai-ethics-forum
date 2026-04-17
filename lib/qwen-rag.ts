export interface EmbeddingResponse {
  embedding: number[];
  model: string;
  dimensions: number;
  totalTokens: number;
}

export interface RerankDocument {
  id: string;
  text: string;
  metadata?: Record<string, unknown>;
}

export interface RerankedDocument extends RerankDocument {
  rerankScore: number;
  originalIndex: number;
}

interface DashScopeEmbeddingResponse {
  data?: Array<{
    embedding?: number[];
    index?: number;
  }>;
  model?: string;
  usage?: {
    total_tokens?: number;
  };
}

interface DashScopeRerankResponse {
  output?: {
    results?: Array<{
      index?: number;
      relevance_score?: number;
      score?: number;
    }>;
  };
  usage?: {
    total_tokens?: number;
  };
}

const DEFAULT_EMBEDDING_ENDPOINT =
  "https://dashscope.aliyuncs.com/compatible-mode/v1/embeddings";
const DEFAULT_RERANK_ENDPOINT =
  "https://dashscope.aliyuncs.com/api/v1/services/rerank/text-rerank/text-rerank";

function getDashScopeApiKey(): string {
  return (
    process.env.STUDY_ASSISTANT_EMBEDDING_API_KEY ||
    process.env.STUDY_ASSISTANT_RERANK_API_KEY ||
    process.env.DASHSCOPE_API_KEY ||
    process.env.ALIBABA_BAILIAN_API_KEY ||
    ""
  );
}

function getEmbeddingDimensions(): number {
  const dimensions = Number(process.env.STUDY_ASSISTANT_EMBEDDING_DIMENSIONS || "1536");
  return Number.isFinite(dimensions) && dimensions > 0 ? dimensions : 1536;
}

export function isQwenEmbeddingConfigured(): boolean {
  return Boolean(getDashScopeApiKey());
}

export function isQwenRerankConfigured(): boolean {
  return Boolean(
    process.env.STUDY_ASSISTANT_RERANK_API_KEY ||
      process.env.DASHSCOPE_API_KEY ||
      process.env.ALIBABA_BAILIAN_API_KEY
  );
}

export async function createQwenEmbedding(text: string): Promise<EmbeddingResponse> {
  const apiKey = getDashScopeApiKey();
  if (!apiKey) {
    throw new Error("Qwen embedding API key is not configured.");
  }

  const model = process.env.STUDY_ASSISTANT_EMBEDDING_MODEL || "text-embedding-v4";
  const dimensions = getEmbeddingDimensions();
  const endpoint = process.env.STUDY_ASSISTANT_EMBEDDING_API_URL || DEFAULT_EMBEDDING_ENDPOINT;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
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
    throw new Error(`Qwen embedding request failed: ${response.status} ${errorText}`);
  }

  const data = (await response.json()) as DashScopeEmbeddingResponse;
  const embedding = data.data?.[0]?.embedding || [];

  if (embedding.length === 0) {
    throw new Error("Qwen embedding response did not include an embedding vector.");
  }

  return {
    embedding,
    model: data.model || model,
    dimensions: embedding.length,
    totalTokens: data.usage?.total_tokens || 0,
  };
}

export async function rerankWithQwen(
  query: string,
  documents: RerankDocument[],
  topN = 8
): Promise<RerankedDocument[]> {
  if (documents.length === 0) {
    return [];
  }

  const apiKey =
    process.env.STUDY_ASSISTANT_RERANK_API_KEY ||
    process.env.DASHSCOPE_API_KEY ||
    process.env.ALIBABA_BAILIAN_API_KEY ||
    "";

  if (!apiKey) {
    return documents.slice(0, topN).map((document, index) => ({
      ...document,
      originalIndex: index,
      rerankScore: 0,
    }));
  }

  const endpoint = process.env.STUDY_ASSISTANT_RERANK_API_URL || DEFAULT_RERANK_ENDPOINT;
  const model = process.env.STUDY_ASSISTANT_RERANK_MODEL || "qwen3-vl-rerank";
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: {
        query: { text: query },
        documents: documents.map((document) => ({ text: document.text })),
      },
      parameters: {
        return_documents: false,
        top_n: Math.min(topN, documents.length),
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Qwen rerank request failed:", response.status, errorText);
    return documents.slice(0, topN).map((document, index) => ({
      ...document,
      originalIndex: index,
      rerankScore: 0,
    }));
  }

  const data = (await response.json()) as DashScopeRerankResponse;
  const results = data.output?.results || [];

  return results
    .map((result) => {
      const index = result.index ?? 0;
      const document = documents[index];
      if (!document) {
        return null;
      }

      return {
        ...document,
        originalIndex: index,
        rerankScore: result.relevance_score ?? result.score ?? 0,
      };
    })
    .filter((document): document is RerankedDocument => Boolean(document))
    .slice(0, topN);
}
