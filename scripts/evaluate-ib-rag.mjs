import { MongoClient } from "mongodb";
import { loadEnvLocal } from "./lib/env.mjs";

loadEnvLocal();

const SUBJECT_CODE_ALIASES = {
  math: "MAA",
  mathematics: "MAA",
  physics: "PHYSICS",
  chemistry: "CHEMISTRY",
  biology: "BIOLOGY",
  economics: "ECONOMICS",
};

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    query: "IB Mathematics calculus functions paper 1 markscheme",
    subjectCode: "",
    level: "",
    materialTypes: "",
    limit: 5,
    fetchLimit: 0,
    minYear: 0,
    maxYear: 0,
    paper: "",
    timezone: "",
    titleIncludes: "",
    qualityLevels: "",
    excludeReviewRequired: false,
    studentMode: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--query" && args[index + 1]) {
      options.query = args[index + 1];
      index += 1;
    } else if (arg === "--subject" && args[index + 1]) {
      options.subjectCode = args[index + 1];
      index += 1;
    } else if (arg === "--level" && args[index + 1]) {
      options.level = args[index + 1].toUpperCase();
      index += 1;
    } else if (arg === "--types" && args[index + 1]) {
      options.materialTypes = args[index + 1];
      index += 1;
    } else if (arg === "--limit" && args[index + 1]) {
      options.limit = Number(args[index + 1]) || options.limit;
      index += 1;
    } else if (arg === "--fetch-limit" && args[index + 1]) {
      options.fetchLimit = Number(args[index + 1]) || options.fetchLimit;
      index += 1;
    } else if (arg === "--min-year" && args[index + 1]) {
      options.minYear = Number(args[index + 1]) || 0;
      index += 1;
    } else if (arg === "--max-year" && args[index + 1]) {
      options.maxYear = Number(args[index + 1]) || 0;
      index += 1;
    } else if (arg === "--paper" && args[index + 1]) {
      options.paper = args[index + 1];
      index += 1;
    } else if (arg === "--timezone" && args[index + 1]) {
      options.timezone = args[index + 1];
      index += 1;
    } else if (arg === "--title-includes" && args[index + 1]) {
      options.titleIncludes = args[index + 1];
      index += 1;
    } else if (arg === "--quality-levels" && args[index + 1]) {
      options.qualityLevels = args[index + 1];
      index += 1;
    } else if (arg === "--exclude-review-required") {
      options.excludeReviewRequired = true;
    } else if (arg === "--student-mode") {
      options.studentMode = true;
    }
  }

  const normalizedSubject = options.subjectCode.trim().toLowerCase();
  options.subjectCode = SUBJECT_CODE_ALIASES[normalizedSubject] || options.subjectCode.trim().toUpperCase();
  if (options.studentMode) {
    options.minYear = options.minYear || Number(process.env.STUDY_ASSISTANT_RECOMMENDATION_MIN_YEAR || "2015");
    options.qualityLevels = options.qualityLevels || "good,warn";
    options.excludeReviewRequired = true;
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
    throw new Error(`Embedding request failed: ${response.status} ${await response.text()}`);
  }

  const data = await response.json();
  return data.data?.[0]?.embedding || [];
}

function buildFilter(options) {
  const filters = [];
  if (options.subjectCode) {
    filters.push(`subject_code == "${options.subjectCode}"`);
  }
  if (options.level) {
    filters.push(`hl_sl == "${options.level}"`);
  }
  const materialTypes = options.materialTypes
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (materialTypes.length > 0) {
    filters.push(`material_type in [${materialTypes.map((item) => `"${item}"`).join(", ")}]`);
  }
  return filters.join(" && ");
}

function compactText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function csvToSet(value) {
  return new Set(
    String(value || "")
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean)
  );
}

function textExtractionQualityLevel(chunk) {
  return String(chunk.textExtractionQualityLevel || chunk.textExtraction?.quality?.level || "").toLowerCase();
}

function isReviewRequired(chunk) {
  return chunk.reviewRequired === true || chunk.textExtraction?.reviewRequired === true;
}

function passesMongoPostFilter(chunk, options) {
  if (!chunk || Object.keys(chunk).length === 0) {
    return false;
  }

  const year = Number(chunk.year || 0);
  if (options.minYear > 0 && year > 0 && year < options.minYear) {
    return false;
  }
  if (options.maxYear > 0 && year > 0 && year > options.maxYear) {
    return false;
  }
  if (options.paper && String(chunk.paper || "").toLowerCase() !== options.paper.toLowerCase()) {
    return false;
  }
  if (options.timezone && String(chunk.timezone || "").toLowerCase() !== options.timezone.toLowerCase()) {
    return false;
  }
  if (
    options.titleIncludes &&
    !String(chunk.title || "").toLowerCase().includes(options.titleIncludes.toLowerCase())
  ) {
    return false;
  }
  if (options.excludeReviewRequired && isReviewRequired(chunk)) {
    return false;
  }

  const qualityLevels = csvToSet(options.qualityLevels);
  if (qualityLevels.size > 0) {
    const level = textExtractionQualityLevel(chunk);
    if (level && !qualityLevels.has(level)) {
      return false;
    }
  }

  return true;
}

async function main() {
  const options = parseArgs();
  const { MilvusClient } = await loadOptionalModule("@zilliz/milvus2-sdk-node");
  const mongo = new MongoClient(process.env.MONGODB_URI);
  const milvus = new MilvusClient({
    address: process.env.ZILLIZ_CLOUD_ADDRESS,
    token: process.env.ZILLIZ_CLOUD_TOKEN,
  });
  const dbName = process.env.MONGODB_DB || "ai-ethics-forum";
  const collectionName = process.env.ZILLIZ_COLLECTION_NAME || "ib_material_embeddings";
  const embedding = await createEmbedding(options.query);
  const filter = buildFilter(options);

  await mongo.connect();
  const db = mongo.db(dbName);
  const fetchLimit = options.fetchLimit || Math.max(options.limit * 12, 50);
  const searchResult = await milvus.search({
    collection_name: collectionName,
    vector: embedding,
    filter: filter || undefined,
    limit: fetchLimit,
    output_fields: ["id", "subject_code", "material_type", "hl_sl", "difficulty", "chunk_token_count"],
    params: { nprobe: Number(process.env.ZILLIZ_NPROBE || "10") },
  });

  const vectorHits = searchResult.results || [];
  const ids = vectorHits.map((item) => item.id).filter(Boolean);
  const chunks = ids.length
    ? await db.collection("ib_material_chunks").find({ milvusVectorId: { $in: ids } }).toArray()
    : [];
  const chunkMap = new Map(chunks.map((chunk) => [chunk.milvusVectorId, chunk]));
  const filteredHits = vectorHits
    .map((hit) => ({ hit, chunk: chunkMap.get(hit.id) || {} }))
    .filter((item) => passesMongoPostFilter(item.chunk, options))
    .slice(0, options.limit);

  console.log(`Query: ${options.query}`);
  console.log(`Filter: ${filter || "(none)"}`);
  console.log(
    `Post filter: ${[
      options.studentMode ? "student-mode" : "",
      options.minYear ? `minYear>=${options.minYear}` : "",
      options.maxYear ? `maxYear<=${options.maxYear}` : "",
      options.paper ? `paper=${options.paper}` : "",
      options.timezone ? `timezone=${options.timezone}` : "",
      options.titleIncludes ? `title~=${options.titleIncludes}` : "",
      options.qualityLevels ? `quality in [${options.qualityLevels}]` : "",
      options.excludeReviewRequired ? "exclude reviewRequired" : "",
    ]
      .filter(Boolean)
      .join(" && ") || "(none)"}`
  );
  console.log(`Vector hits: ${vectorHits.length}, Mongo chunks: ${chunks.length}, Displayed hits: ${filteredHits.length}`);

  filteredHits.forEach(({ hit, chunk }, index) => {
    const snippet = compactText(chunk.content).slice(0, 360);
    console.log(`\n#${index + 1}`);
    console.log(`score: ${hit.score ?? hit.distance ?? "n/a"}`);
    console.log(`title: ${chunk.title || "n/a"}`);
    console.log(`type: ${chunk.materialType || hit.material_type || "n/a"}`);
    console.log(`subject: ${chunk.subjectCode || hit.subject_code || "n/a"}`);
    console.log(`level/year/paper: ${chunk.hlSl || hit.hl_sl || "n/a"} / ${chunk.year || hit.year || "n/a"} / ${chunk.paper || hit.paper || "n/a"}`);
    console.log(`extraction: ${chunk.textExtractionStrategy || "n/a"} / ${textExtractionQualityLevel(chunk) || "n/a"} / reviewRequired=${isReviewRequired(chunk)}`);
    console.log(`snippet: ${snippet || "n/a"}`);
  });

  await mongo.close();
  await milvus.closeConnection?.();
}

main().catch((error) => {
  console.error("IB RAG evaluation failed:", error);
  process.exit(1);
});
