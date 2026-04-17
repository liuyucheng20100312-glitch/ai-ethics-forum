import { AnyDb } from "@/lib/mongodb";
import { rerankZillizTextHits, searchZillizByText } from "@/lib/zilliz";

export const IB_DISCIPLINES_COLLECTION = "ib_disciplines";
export const IB_SUBJECTS_COLLECTION = "ib_subjects";
export const IB_KNOWLEDGE_POINTS_COLLECTION = "ib_knowledge_points";
export const IB_COMMAND_TERMS_COLLECTION = "ib_command_terms";
export const IB_MATERIALS_COLLECTION = "ib_materials";
export const IB_MATERIAL_CHUNKS_COLLECTION = "ib_material_chunks";

export interface IbDisciplineSeed {
  code: string;
  nameEn: string;
  nameCn: string;
  sortOrder: number;
}

export interface IbSubjectSeed {
  code: string;
  disciplineCode: string;
  nameEn: string;
  nameCn: string;
  level: "HL" | "SL" | "BOTH";
  aliases: string[];
}

export interface IbCommandTermSeed {
  term: string;
  shortDefinition: string;
}

export interface IbKnowledgeContextChunk {
  id?: string;
  title: string;
  materialType: string;
  content: string;
  score: number;
}

export interface IbKnowledgeContextResult {
  subjectCode: string;
  subjectName: string;
  level: string;
  commandTerms: string[];
  knowledgePoints: Array<{
    id: string;
    code: string;
    nameEn: string;
    nameCn: string;
    level: number | null;
    hlSl: string;
  }>;
  materialChunks: IbKnowledgeContextChunk[];
}

export const IB_DISCIPLINE_SEED: IbDisciplineSeed[] = [
  {
    code: "GROUP1",
    nameEn: "Studies in Language and Literature",
    nameCn: "语言与文学研究",
    sortOrder: 1,
  },
  {
    code: "GROUP2",
    nameEn: "Language Acquisition",
    nameCn: "语言习得",
    sortOrder: 2,
  },
  {
    code: "GROUP3",
    nameEn: "Individuals and Societies",
    nameCn: "个人与社会",
    sortOrder: 3,
  },
  {
    code: "GROUP4",
    nameEn: "Sciences",
    nameCn: "实验科学",
    sortOrder: 4,
  },
  {
    code: "GROUP5",
    nameEn: "Mathematics",
    nameCn: "数学",
    sortOrder: 5,
  },
  {
    code: "GROUP6",
    nameEn: "The Arts",
    nameCn: "艺术",
    sortOrder: 6,
  },
];

export const IB_SUBJECT_SEED: IbSubjectSeed[] = [
  {
    code: "MAA",
    disciplineCode: "GROUP5",
    nameEn: "Mathematics: Analysis and Approaches",
    nameCn: "数学：分析与方法",
    level: "BOTH",
    aliases: ["math aa", "mathematics aa", "analysis and approaches"],
  },
  {
    code: "MAI",
    disciplineCode: "GROUP5",
    nameEn: "Mathematics: Applications and Interpretation",
    nameCn: "数学：应用与解释",
    level: "BOTH",
    aliases: ["math ai", "mathematics ai", "applications and interpretation"],
  },
  {
    code: "PHYSICS",
    disciplineCode: "GROUP4",
    nameEn: "Physics",
    nameCn: "物理",
    level: "BOTH",
    aliases: ["physics ib"],
  },
  {
    code: "CHEMISTRY",
    disciplineCode: "GROUP4",
    nameEn: "Chemistry",
    nameCn: "化学",
    level: "BOTH",
    aliases: ["chemistry ib"],
  },
  {
    code: "BIOLOGY",
    disciplineCode: "GROUP4",
    nameEn: "Biology",
    nameCn: "生物",
    level: "BOTH",
    aliases: ["biology ib"],
  },
  {
    code: "ECONOMICS",
    disciplineCode: "GROUP3",
    nameEn: "Economics",
    nameCn: "经济学",
    level: "BOTH",
    aliases: ["economics ib", "econ"],
  },
  {
    code: "BUSINESS_MANAGEMENT",
    disciplineCode: "GROUP3",
    nameEn: "Business Management",
    nameCn: "商务管理",
    level: "BOTH",
    aliases: ["business management ib", "bm"],
  },
  {
    code: "ENGLISH_A_LL",
    disciplineCode: "GROUP1",
    nameEn: "English A: Language and Literature",
    nameCn: "英语 A：语言与文学",
    level: "BOTH",
    aliases: ["english a", "english language and literature"],
  },
  {
    code: "CHINESE_A_LL",
    disciplineCode: "GROUP1",
    nameEn: "Chinese A: Language and Literature",
    nameCn: "中文 A：语言与文学",
    level: "BOTH",
    aliases: ["chinese a", "chinese language and literature"],
  },
  {
    code: "HISTORY",
    disciplineCode: "GROUP3",
    nameEn: "History",
    nameCn: "历史",
    level: "BOTH",
    aliases: ["history ib"],
  },
  {
    code: "PSYCHOLOGY",
    disciplineCode: "GROUP3",
    nameEn: "Psychology",
    nameCn: "心理学",
    level: "BOTH",
    aliases: ["psychology ib"],
  },
  {
    code: "VISUAL_ARTS",
    disciplineCode: "GROUP6",
    nameEn: "Visual Arts",
    nameCn: "视觉艺术",
    level: "BOTH",
    aliases: ["visual arts ib"],
  },
];

export const IB_COMMAND_TERM_SEED: IbCommandTermSeed[] = [
  { term: "Analyze", shortDefinition: "Break down material into parts and show how the parts relate to each other." },
  { term: "Compare", shortDefinition: "Give an account of similarities between two or more items or situations." },
  { term: "Contrast", shortDefinition: "Give an account of the differences between two or more items or situations." },
  { term: "Discuss", shortDefinition: "Offer a considered and balanced review of a topic, including a range of arguments." },
  { term: "Evaluate", shortDefinition: "Make an appraisal by weighing strengths and limitations." },
  { term: "Explain", shortDefinition: "Give a detailed account including reasons or causes." },
  { term: "Justify", shortDefinition: "Give valid reasons or evidence to support an answer or conclusion." },
  { term: "Outline", shortDefinition: "Give a brief account or summary." },
  { term: "State", shortDefinition: "Give a specific name, value, or short answer without explanation." },
  { term: "To what extent", shortDefinition: "Consider the merits or otherwise of an argument or concept and present a supported conclusion." },
];

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeTextArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => normalizeText(item))
    .filter((item) => item.length > 0);
}

function tokenizeQuery(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9\u4e00-\u9fa5]+/i)
    .map((item) => item.trim())
    .filter((item) => item.length > 1);
}

function subjectScore(subject: Record<string, unknown>, query: string): number {
  const haystack = [
    normalizeText(subject.code),
    normalizeText(subject.nameEn),
    normalizeText(subject.nameCn),
    ...normalizeTextArray(subject.aliases),
  ]
    .join(" ")
    .toLowerCase();

  const tokens = tokenizeQuery(query);
  let score = 0;

  for (const token of tokens) {
    if (haystack.includes(token)) {
      score += 2;
    }
  }

  if (query && haystack.includes(query.toLowerCase())) {
    score += 5;
  }

  return score;
}

export async function findBestIbSubject(
  db: AnyDb,
  query: string
): Promise<Record<string, unknown> | null> {
  const subjects = (await db.collection(IB_SUBJECTS_COLLECTION).find({}).toArray()) as Record<string, unknown>[];

  if (subjects.length === 0 || !query.trim()) {
    return null;
  }

  const ranked = subjects
    .map((subject) => ({
      subject,
      score: subjectScore(subject, query),
    }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score);

  return ranked[0]?.subject || null;
}

function computeChunkScore(
  chunk: Record<string, unknown>,
  queryTerms: string[],
  subjectCode: string,
  level: string
): number {
  const haystack = [
    normalizeText(chunk.title),
    normalizeText(chunk.content),
    normalizeText(chunk.subjectCode),
    normalizeText(chunk.materialType),
    ...normalizeTextArray(chunk.tags),
    ...normalizeTextArray(chunk.knowledgePointNames),
  ]
    .join(" ")
    .toLowerCase();

  let score = 0;
  for (const term of queryTerms) {
    if (term && haystack.includes(term.toLowerCase())) {
      score += 2;
    }
  }

  const chunkSubjectCode = normalizeText(chunk.subjectCode).toLowerCase();
  if (subjectCode && chunkSubjectCode === subjectCode.toLowerCase()) {
    score += 3;
  }

  const chunkLevel = normalizeText(chunk.hlSl).toUpperCase();
  if (level && (chunkLevel === "BOTH" || chunkLevel === level.toUpperCase())) {
    score += 1;
  }

  return score;
}

export async function buildIbKnowledgeContext(
  db: AnyDb,
  input: {
    subjectText: string;
    level?: string;
    queryTerms?: string[];
  }
): Promise<IbKnowledgeContextResult | null> {
  const subject = await findBestIbSubject(db, input.subjectText);
  if (!subject) {
    return null;
  }

  const subjectCode = normalizeText(subject.code);
  const level = normalizeText(input.level) || normalizeText(subject.level) || "BOTH";
  const queryTerms = (input.queryTerms || []).filter((item) => item.trim().length > 0);
  const queryText = [input.subjectText, level, ...queryTerms].filter(Boolean).join(" ");

  const knowledgePoints = (await db
    .collection(IB_KNOWLEDGE_POINTS_COLLECTION)
    .find({ subjectCode })
    .limit(12)
    .toArray()) as Record<string, unknown>[];

  const commandTerms = (await db
    .collection(IB_COMMAND_TERMS_COLLECTION)
    .find({})
    .limit(10)
    .toArray()) as Record<string, unknown>[];

  const materialChunks = (await db
    .collection(IB_MATERIAL_CHUNKS_COLLECTION)
    .find(subjectCode ? { subjectCode } : {})
    .limit(80)
    .toArray()) as Record<string, unknown>[];
  const vectorMaterialChunks: Record<string, unknown>[] = [];

  try {
    const vectorHits = await searchZillizByText(
      queryText,
      {
        subjectCode,
        hlSl: level,
      },
      20
    );
    const vectorIds = vectorHits.map((hit) => hit.id).filter(Boolean);

    if (vectorIds.length > 0) {
      const chunksByVectorId = (await db
        .collection(IB_MATERIAL_CHUNKS_COLLECTION)
        .find({ milvusVectorId: { $in: vectorIds } })
        .limit(vectorIds.length)
        .toArray()) as Record<string, unknown>[];
      const chunkMap = new Map(chunksByVectorId.map((chunk) => [normalizeText(chunk.milvusVectorId), chunk]));

      for (const hit of vectorHits) {
        const chunk = chunkMap.get(hit.id);
        if (chunk) {
          vectorMaterialChunks.push({
            ...chunk,
            vectorScore: hit.score,
          });
        }
      }
    }
  } catch (error) {
    console.warn("Zilliz vector retrieval skipped:", (error as Error).message);
  }

  const rankedChunks = [...vectorMaterialChunks, ...materialChunks]
    .map((chunk) => ({
      id: normalizeText(chunk.milvusVectorId) || (chunk._id ? String(chunk._id) : ""),
      title: normalizeText(chunk.title) || "IB reference",
      materialType: normalizeText(chunk.materialType) || "KNOWLEDGE_NOTE",
      content: normalizeText(chunk.content),
      score:
        typeof chunk.vectorScore === "number"
          ? 100 + chunk.vectorScore
          : computeChunkScore(chunk, queryTerms, subjectCode, level),
    }))
    .filter((chunk) => chunk.content.length > 0 && chunk.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 20);
  const finalChunks =
    rankedChunks.length > 1
      ? await rerankZillizTextHits(queryText, rankedChunks, 4)
      : rankedChunks.slice(0, 4);

  return {
    subjectCode,
    subjectName: normalizeText(subject.nameEn) || subjectCode,
    level,
    commandTerms: commandTerms.map((item) => normalizeText(item.term)).filter(Boolean),
    knowledgePoints: knowledgePoints.slice(0, 10).map((item) => ({
      id: item._id ? String(item._id) : "",
      code: normalizeText(item.code),
      nameEn: normalizeText(item.nameEn),
      nameCn: normalizeText(item.nameCn),
      level: typeof item.level === "number" ? item.level : null,
      hlSl: normalizeText(item.hlSl) || "BOTH",
    })),
    materialChunks: finalChunks,
  };
}

export function formatIbKnowledgeContext(context: IbKnowledgeContextResult | null): string {
  if (!context) {
    return "";
  }

  const knowledgePointsBlock = context.knowledgePoints
    .map((point) => `- ${point.code || "N/A"} | ${point.nameEn || point.nameCn || "Unnamed point"} | ${point.hlSl}`)
    .join("\n");

  const chunkBlock = context.materialChunks
    .map(
      (chunk, index) =>
        `Reference ${index + 1}\nTitle: ${chunk.title}\nType: ${chunk.materialType}\nContent: ${chunk.content.slice(0, 800)}`
    )
    .join("\n\n");

  return [
    `IB Subject: ${context.subjectName} (${context.subjectCode})`,
    `Level: ${context.level}`,
    `Command terms: ${context.commandTerms.join(", ") || "N/A"}`,
    "Knowledge points:",
    knowledgePointsBlock || "- No structured knowledge points imported yet.",
    "Retrieved references:",
    chunkBlock || "No local IB reference chunks were found.",
  ].join("\n");
}
