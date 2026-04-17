import { AnyDb } from "@/lib/mongodb";
import { callStudyAssistantModel } from "@/lib/study-model";
import {
  buildIbKnowledgeContext,
  formatIbKnowledgeContext,
  IB_MATERIALS_COLLECTION,
} from "@/lib/ib-knowledge";

export const STUDY_EXAMS_COLLECTION = "study_exams";
export const STUDY_ANALYSES_COLLECTION = "study_exam_analyses";
export const STUDY_PLANS_COLLECTION = "study_learning_plans";
export const STUDY_CHECKINS_COLLECTION = "study_check_ins";
export const STUDY_MATERIALS_COLLECTION = "study_materials";

export type StudyWeaknessSeverity = "high" | "medium" | "low";
export type StudyExamSourceType = "text" | "structured" | "file";
export type StudyOcrStatus = "ready" | "pending" | "not_needed";
export type StudyTaskType = "review" | "practice" | "revision" | "reflection";

export interface StudyExamQuestion {
  questionNumber: string;
  stem: string;
  studentAnswer: string;
  correctAnswer: string;
  score: number | null;
  maxScore: number | null;
  knowledgePoints: string[];
  teacherComment: string;
  isWrong: boolean | null;
}

export interface StudyExamSourceFile {
  fileName: string;
  mimeType: string;
  size: number;
}

export interface StudyExamRecord {
  _id?: string;
  userId: string;
  username: string;
  title: string;
  subject: string;
  grade: string;
  examDate: string;
  sourceType: StudyExamSourceType;
  ocrStatus: StudyOcrStatus;
  rawText: string;
  questions: StudyExamQuestion[];
  sourceFile: StudyExamSourceFile | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface StudyScoreSummary {
  totalQuestions: number;
  wrongQuestions: number;
  scoredPoints: number | null;
  totalPoints: number | null;
  accuracyRate: number | null;
}

export interface StudyWeakness {
  topic: string;
  skill: string;
  severity: StudyWeaknessSeverity;
  reason: string;
  evidence: string[];
  recommendedFocus: string;
  confidence: number;
}

export interface StudyPlanTask {
  taskId: string;
  day: number;
  title: string;
  type: StudyTaskType;
  minutes: number;
  focusTopics: string[];
  successCriteria: string;
}

export interface StudyCheckpoint {
  day: number;
  title: string;
  metric: string;
}

export interface StudyCoachStrategy {
  tone: string;
  reminderStyle: string;
  monitoringFocus: string[];
}

export interface StudyLearningPlan {
  title: string;
  horizonDays: number;
  dailyMinutes: number;
  goals: string[];
  tasks: StudyPlanTask[];
  checkpoints: StudyCheckpoint[];
  coachStrategy: StudyCoachStrategy;
}

export interface StudyMaterialRecommendation {
  materialId?: string;
  title: string;
  url: string;
  materialType: string;
  reason: string;
  topics: string[];
  score: number;
}

export interface StudyAnalysisBundle {
  overview: string;
  scoreSummary: StudyScoreSummary;
  weaknesses: StudyWeakness[];
  plan: StudyLearningPlan;
  recommendedQueries: string[];
  recommendedMaterials: StudyMaterialRecommendation[];
  analysisMode: "ai" | "fallback";
}

export interface StudyPlanRecord extends StudyLearningPlan {
  _id?: string;
  analysisId: string;
  examId: string;
  userId: string;
  username: string;
  status: string;
  completedTaskIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface StudyCheckInPayload {
  planId: string;
  completedTaskIds: string[];
  minutesStudied: number;
  blockers: string[];
  reflection: string;
}

export interface StudyCoachFeedback {
  summary: string;
  nextAction: string;
  riskLevel: "low" | "medium" | "high";
}

type GenericDocument = Record<string, unknown>;

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => asString(item))
    .filter((item) => item.length > 0);
}

function toIsoString(value: unknown): string {
  const text = asString(value);
  if (!text) {
    return new Date().toISOString();
  }

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) {
    return new Date().toISOString();
  }

  return parsed.toISOString();
}

function clampConfidence(value: unknown): number {
  const numeric = asNumber(value);
  if (numeric === null) {
    return 0.6;
  }
  return Math.max(0.1, Math.min(0.99, numeric));
}

function normalizeSeverity(value: unknown): StudyWeaknessSeverity {
  const text = asString(value).toLowerCase();
  if (text === "high" || text === "medium" || text === "low") {
    return text;
  }
  return "medium";
}

function normalizeQuestion(value: unknown, index: number): StudyExamQuestion {
  const source = (value || {}) as GenericDocument;
  const score = asNumber(source.score);
  const maxScore = asNumber(source.maxScore);

  return {
    questionNumber: asString(source.questionNumber) || String(index + 1),
    stem: asString(source.stem),
    studentAnswer: asString(source.studentAnswer),
    correctAnswer: asString(source.correctAnswer),
    score,
    maxScore,
    knowledgePoints: asStringArray(source.knowledgePoints),
    teacherComment: asString(source.teacherComment),
    isWrong:
      typeof source.isWrong === "boolean"
        ? source.isWrong
        : score !== null && maxScore !== null
          ? score < maxScore
          : null,
  };
}

export function normalizeExamRecord(input: GenericDocument): Omit<StudyExamRecord, "_id"> {
  const questions = Array.isArray(input.questions)
    ? input.questions.map((item, index) => normalizeQuestion(item, index))
    : [];

  return {
    userId: asString(input.userId),
    username: asString(input.username),
    title: asString(input.title),
    subject: asString(input.subject),
    grade: asString(input.grade),
    examDate: toIsoString(input.examDate),
    sourceType: (asString(input.sourceType) as StudyExamSourceType) || "text",
    ocrStatus: (asString(input.ocrStatus) as StudyOcrStatus) || "not_needed",
    rawText: asString(input.rawText),
    questions,
    sourceFile: input.sourceFile
      ? {
          fileName: asString((input.sourceFile as GenericDocument).fileName),
          mimeType: asString((input.sourceFile as GenericDocument).mimeType),
          size: asNumber((input.sourceFile as GenericDocument).size) || 0,
        }
      : null,
    tags: asStringArray(input.tags),
    createdAt: toIsoString(input.createdAt),
    updatedAt: toIsoString(input.updatedAt),
  };
}

export function tryObjectId(id: string) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { ObjectId } = require("mongodb");
    return new ObjectId(id);
  } catch {
    return id;
  }
}

export async function findDocumentById(
  db: AnyDb,
  collectionName: string,
  id: string
): Promise<GenericDocument | null> {
  const typedId = tryObjectId(id);
  const byObjectId = await db.collection(collectionName).findOne({ _id: typedId as never });
  if (byObjectId) {
    return byObjectId as GenericDocument;
  }

  return (await db.collection(collectionName).findOne({ _id: id as never })) as GenericDocument | null;
}

function inferQuestionIsWrong(question: StudyExamQuestion): boolean {
  if (typeof question.isWrong === "boolean") {
    return question.isWrong;
  }
  if (question.score !== null && question.maxScore !== null) {
    return question.score < question.maxScore;
  }
  if (question.studentAnswer && question.correctAnswer) {
    return question.studentAnswer.trim().toLowerCase() !== question.correctAnswer.trim().toLowerCase();
  }
  return false;
}

function buildScoreSummary(exam: StudyExamRecord): StudyScoreSummary {
  const totalQuestions = exam.questions.length;
  const wrongQuestions = exam.questions.filter(inferQuestionIsWrong).length;

  const scoredQuestions = exam.questions.filter(
    (question) => question.score !== null && question.maxScore !== null
  );

  if (scoredQuestions.length === 0) {
    return {
      totalQuestions,
      wrongQuestions,
      scoredPoints: null,
      totalPoints: null,
      accuracyRate: totalQuestions > 0 ? Number(((totalQuestions - wrongQuestions) / totalQuestions).toFixed(2)) : null,
    };
  }

  const scoredPoints = scoredQuestions.reduce((sum, question) => sum + (question.score || 0), 0);
  const totalPoints = scoredQuestions.reduce((sum, question) => sum + (question.maxScore || 0), 0);
  const accuracyRate = totalPoints > 0 ? Number((scoredPoints / totalPoints).toFixed(2)) : null;

  return {
    totalQuestions,
    wrongQuestions,
    scoredPoints,
    totalPoints,
    accuracyRate,
  };
}

function severityFromCount(count: number): StudyWeaknessSeverity {
  if (count >= 3) {
    return "high";
  }
  if (count >= 2) {
    return "medium";
  }
  return "low";
}

function buildFallbackWeaknesses(exam: StudyExamRecord): StudyWeakness[] {
  const grouped = new Map<string, { count: number; evidence: string[] }>();

  for (const question of exam.questions.filter(inferQuestionIsWrong)) {
    const topics = question.knowledgePoints.length > 0 ? question.knowledgePoints : ["General accuracy"];
    for (const topic of topics) {
      const entry = grouped.get(topic) || { count: 0, evidence: [] };
      entry.count += 1;
      entry.evidence.push(`Q${question.questionNumber}: ${question.stem.slice(0, 120)}`);
      grouped.set(topic, entry);
    }
  }

  const weaknesses = [...grouped.entries()]
    .sort((left, right) => right[1].count - left[1].count)
    .slice(0, 4)
    .map(([topic, entry]) => ({
      topic,
      skill: topic,
      severity: severityFromCount(entry.count),
      reason: "Repeated mistakes suggest a gap in concept mastery or application accuracy.",
      evidence: entry.evidence.slice(0, 3),
      recommendedFocus: `Review core methods for ${topic} and complete targeted practice.`,
      confidence: Math.min(0.9, 0.55 + entry.count * 0.1),
    }));

  if (weaknesses.length > 0) {
    return weaknesses;
  }

  return [
    {
      topic: "Review strategy",
      skill: "Error analysis",
      severity: "medium",
      reason: "The paper did not include enough structured error evidence, so the assistant cannot isolate exact weak points yet.",
      evidence: ["Provide wrong questions, scores, or teacher comments for a sharper diagnosis."],
      recommendedFocus: "Label mistakes by topic, then re-run analysis with richer exam evidence.",
      confidence: 0.45,
    },
  ];
}

function buildFallbackPlan(
  exam: StudyExamRecord,
  weaknesses: StudyWeakness[]
): StudyLearningPlan {
  const topTopics = weaknesses.slice(0, 3).map((item) => item.topic);
  const dailyMinutes = topTopics.length >= 3 ? 50 : 40;
  const horizonDays = 14;
  const tasks: StudyPlanTask[] = topTopics.flatMap((topic, index) => {
    const baseDay = index * 4 + 1;
    return [
      {
        taskId: `${topic.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-review-${baseDay}`,
        day: baseDay,
        title: `Review the method behind ${topic}`,
        type: "review",
        minutes: dailyMinutes,
        focusTopics: [topic],
        successCriteria: `Summarize the main method for ${topic} and record three mistakes to avoid.`,
      },
      {
        taskId: `${topic.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-practice-${baseDay + 1}`,
        day: baseDay + 1,
        title: `Targeted practice on ${topic}`,
        type: "practice",
        minutes: dailyMinutes,
        focusTopics: [topic],
        successCriteria: `Finish at least 8 focused questions on ${topic} with a correction note for each error.`,
      },
      {
        taskId: `${topic.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-reflection-${baseDay + 2}`,
        day: baseDay + 2,
        title: `Reflect on mistakes in ${topic}`,
        type: "reflection",
        minutes: 20,
        focusTopics: [topic],
        successCriteria: `Write a short reflection explaining why mistakes happened and how to prevent them.`,
      },
    ];
  });

  return {
    title: `${exam.subject || "IB"} two-week recovery plan`,
    horizonDays,
    dailyMinutes,
    goals: weaknesses.slice(0, 3).map((item) => `Reduce mistakes in ${item.topic}`),
    tasks,
    checkpoints: [
      {
        day: 4,
        title: "First checkpoint",
        metric: "Rework two previously missed questions without notes.",
      },
      {
        day: 9,
        title: "Mid-plan checkpoint",
        metric: "Complete one mini set under time pressure and compare the error pattern.",
      },
      {
        day: 14,
        title: "Final checkpoint",
        metric: "Review whether the top weakness topics still produce repeated mistakes.",
      },
    ],
    coachStrategy: {
      tone: "supportive",
      reminderStyle: "daily",
      monitoringFocus: [
        "Whether the student completed targeted practice",
        "Whether repeated mistakes are decreasing",
        "Whether time management is improving",
      ],
    },
  };
}

function buildFallbackQueries(exam: StudyExamRecord, weaknesses: StudyWeakness[]): string[] {
  return weaknesses.slice(0, 4).map((item) => `${exam.subject} IB ${item.topic} practice explanation`);
}

function buildFallbackBundle(exam: StudyExamRecord): StudyAnalysisBundle {
  const weaknesses = buildFallbackWeaknesses(exam);
  const scoreSummary = buildScoreSummary(exam);
  const plan = buildFallbackPlan(exam, weaknesses);
  const recommendedQueries = buildFallbackQueries(exam, weaknesses);

  return {
    overview:
      weaknesses.length > 0
        ? `The paper suggests the main pressure points are ${weaknesses
            .slice(0, 3)
            .map((item) => item.topic)
            .join(", ")}.`
        : "The paper needs more structured evidence before a precise diagnosis can be made.",
    scoreSummary,
    weaknesses,
    plan,
    recommendedQueries,
    recommendedMaterials: [],
    analysisMode: "fallback",
  };
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength)}...`;
}

function buildAnalysisPrompt(
  exam: StudyExamRecord,
  fallback: StudyAnalysisBundle,
  ibKnowledgeContext: string
): string {
  const questionBlock = exam.questions
    .slice(0, 20)
    .map((question) => {
      const lines = [
        `Question ${question.questionNumber}`,
        `Stem: ${question.stem || "N/A"}`,
        `Student answer: ${question.studentAnswer || "N/A"}`,
        `Correct answer: ${question.correctAnswer || "N/A"}`,
        `Score: ${question.score ?? "N/A"} / ${question.maxScore ?? "N/A"}`,
        `Knowledge points: ${question.knowledgePoints.join(", ") || "N/A"}`,
        `Teacher comment: ${question.teacherComment || "N/A"}`,
        `Marked wrong: ${inferQuestionIsWrong(question) ? "yes" : "no"}`,
      ];
      return lines.join("\n");
    })
    .join("\n\n");

  return [
    "Analyze the following IB exam evidence and return valid JSON only.",
    "Do not wrap the JSON in markdown.",
    "",
    "Required JSON shape:",
    JSON.stringify(
      {
        overview: "string",
        scoreSummary: {
          totalQuestions: 0,
          wrongQuestions: 0,
          scoredPoints: 0,
          totalPoints: 0,
          accuracyRate: 0.74,
        },
        weaknesses: [
          {
            topic: "Functions",
            skill: "Interpreting transformations",
            severity: "high",
            reason: "string",
            evidence: ["string"],
            recommendedFocus: "string",
            confidence: 0.82,
          },
        ],
        plan: {
          title: "string",
          horizonDays: 14,
          dailyMinutes: 45,
          goals: ["string"],
          tasks: [
            {
              taskId: "string",
              day: 1,
              title: "string",
              type: "review",
              minutes: 45,
              focusTopics: ["string"],
              successCriteria: "string",
            },
          ],
          checkpoints: [
            {
              day: 4,
              title: "string",
              metric: "string",
            },
          ],
          coachStrategy: {
            tone: "supportive",
            reminderStyle: "daily",
            monitoringFocus: ["string"],
          },
        },
        recommendedQueries: ["string"],
      },
      null,
      2
    ),
    "",
    "Constraints:",
    "- Use only evidence from the exam.",
    "- Focus on weak points, not a generic tutoring summary.",
    "- Keep weaknesses to at most 4 items.",
    "- Tasks must be specific and measurable.",
    "",
    `Exam title: ${exam.title}`,
    `Subject: ${exam.subject}`,
    `Grade: ${exam.grade || "N/A"}`,
    `Exam date: ${exam.examDate}`,
    `Raw text excerpt: ${truncate(exam.rawText, 5000) || "N/A"}`,
    "",
    "IB structured context:",
    ibKnowledgeContext || "No IB structured context is available yet.",
    "",
    "Structured questions:",
    questionBlock || "N/A",
    "",
    "Fallback diagnosis for reference:",
    JSON.stringify(fallback, null, 2),
  ].join("\n");
}

function extractJson(text: string): GenericDocument | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    return null;
  }

  try {
    return JSON.parse(match[0]) as GenericDocument;
  } catch {
    return null;
  }
}

function sanitizeWeaknesses(value: unknown, fallback: StudyWeakness[]): StudyWeakness[] {
  if (!Array.isArray(value) || value.length === 0) {
    return fallback;
  }

  const normalized = value
    .map((item) => {
      const source = (item || {}) as GenericDocument;
      const topic = asString(source.topic);
      const skill = asString(source.skill) || topic;

      if (!topic) {
        return null;
      }

      return {
        topic,
        skill,
        severity: normalizeSeverity(source.severity),
        reason: asString(source.reason) || "The student shows recurring mistakes in this area.",
        evidence: asStringArray(source.evidence).slice(0, 3),
        recommendedFocus:
          asString(source.recommendedFocus) || `Review ${topic} and complete targeted correction work.`,
        confidence: clampConfidence(source.confidence),
      };
    })
    .filter((item): item is StudyWeakness => Boolean(item));

  return normalized.length > 0 ? normalized.slice(0, 4) : fallback;
}

function sanitizeTasks(value: unknown, fallback: StudyPlanTask[]): StudyPlanTask[] {
  if (!Array.isArray(value) || value.length === 0) {
    return fallback;
  }

  const normalized = value
    .map((item, index) => {
      const source = (item || {}) as GenericDocument;
      const title = asString(source.title);
      if (!title) {
        return null;
      }

      const rawType = asString(source.type).toLowerCase();
      const type: StudyTaskType =
        rawType === "review" || rawType === "practice" || rawType === "revision" || rawType === "reflection"
          ? (rawType as StudyTaskType)
          : "practice";

      return {
        taskId: asString(source.taskId) || `task-${index + 1}`,
        day: asNumber(source.day) || index + 1,
        title,
        type,
        minutes: asNumber(source.minutes) || 30,
        focusTopics: asStringArray(source.focusTopics),
        successCriteria: asString(source.successCriteria) || "Complete the task and record the result.",
      };
    })
    .filter((item): item is StudyPlanTask => Boolean(item));

  return normalized.length > 0 ? normalized : fallback;
}

function sanitizeCheckpoints(value: unknown, fallback: StudyCheckpoint[]): StudyCheckpoint[] {
  if (!Array.isArray(value) || value.length === 0) {
    return fallback;
  }

  const normalized = value
    .map((item) => {
      const source = (item || {}) as GenericDocument;
      const title = asString(source.title);
      const metric = asString(source.metric);
      if (!title || !metric) {
        return null;
      }

      return {
        day: asNumber(source.day) || 1,
        title,
        metric,
      };
    })
    .filter((item): item is StudyCheckpoint => Boolean(item));

  return normalized.length > 0 ? normalized : fallback;
}

function sanitizePlan(value: unknown, fallback: StudyLearningPlan): StudyLearningPlan {
  const source = (value || {}) as GenericDocument;

  return {
    title: asString(source.title) || fallback.title,
    horizonDays: asNumber(source.horizonDays) || fallback.horizonDays,
    dailyMinutes: asNumber(source.dailyMinutes) || fallback.dailyMinutes,
    goals: asStringArray(source.goals).length > 0 ? asStringArray(source.goals) : fallback.goals,
    tasks: sanitizeTasks(source.tasks, fallback.tasks),
    checkpoints: sanitizeCheckpoints(source.checkpoints, fallback.checkpoints),
    coachStrategy: {
      tone: asString((source.coachStrategy as GenericDocument)?.tone) || fallback.coachStrategy.tone,
      reminderStyle:
        asString((source.coachStrategy as GenericDocument)?.reminderStyle) ||
        fallback.coachStrategy.reminderStyle,
      monitoringFocus:
        asStringArray((source.coachStrategy as GenericDocument)?.monitoringFocus).length > 0
          ? asStringArray((source.coachStrategy as GenericDocument)?.monitoringFocus)
          : fallback.coachStrategy.monitoringFocus,
    },
  };
}

function sanitizeScoreSummary(value: unknown, fallback: StudyScoreSummary): StudyScoreSummary {
  const source = (value || {}) as GenericDocument;

  return {
    totalQuestions: asNumber(source.totalQuestions) || fallback.totalQuestions,
    wrongQuestions: asNumber(source.wrongQuestions) || fallback.wrongQuestions,
    scoredPoints: source.scoredPoints === null ? null : asNumber(source.scoredPoints) ?? fallback.scoredPoints,
    totalPoints: source.totalPoints === null ? null : asNumber(source.totalPoints) ?? fallback.totalPoints,
    accuracyRate:
      source.accuracyRate === null ? null : asNumber(source.accuracyRate) ?? fallback.accuracyRate,
  };
}

function sanitizeQueries(value: unknown, fallback: string[]): string[] {
  const normalized = asStringArray(value);
  return normalized.length > 0 ? normalized.slice(0, 6) : fallback;
}

async function recommendStudyMaterials(
  db: AnyDb,
  exam: StudyExamRecord,
  weaknesses: StudyWeakness[],
  queries: string[]
): Promise<StudyMaterialRecommendation[]> {
  const studyCandidates = (await db
    .collection(STUDY_MATERIALS_COLLECTION)
    .find(exam.subject ? { subject: exam.subject } : {})
    .limit(100)
    .toArray()) as GenericDocument[];
  const ibSubjectContext = await buildIbKnowledgeContext(db, {
    subjectText: exam.subject,
    level: exam.grade,
    queryTerms: queries,
  });
  const ibCandidates = (await db
    .collection(IB_MATERIALS_COLLECTION)
    .find(ibSubjectContext?.subjectCode ? { subjectCode: ibSubjectContext.subjectCode } : {})
    .limit(100)
    .toArray()) as GenericDocument[];
  const candidates = [...studyCandidates, ...ibCandidates];

  const weaknessTerms = weaknesses.flatMap((item) => [item.topic, item.skill]).map((item) => item.toLowerCase());

  const ranked = candidates
    .map((candidate) => {
      const title = asString(candidate.title);
      const description = asString(candidate.description) || asString(candidate.summary);
      const topics = asStringArray(candidate.topics);
      const tags = asStringArray(candidate.tags);
      const haystack = [title, description, ...topics, ...tags].join(" ").toLowerCase();

      let score = 0;
      for (const term of weaknessTerms) {
        if (term && haystack.includes(term)) {
          score += 2;
        }
      }
      if (exam.subject && haystack.includes(exam.subject.toLowerCase())) {
        score += 1;
      }

      return {
        materialId: candidate._id ? String(candidate._id) : undefined,
        title,
        url: asString(candidate.url) || asString(candidate.fileUrl),
        materialType: asString(candidate.materialType) || asString(candidate.type) || "reference",
        reason: `Matched with the weakness topics: ${topics.join(", ") || tags.join(", ") || "general review"}.`,
        topics,
        score,
      };
    })
    .filter((item) => item.title && item.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 5);

  if (ranked.length > 0) {
    return ranked;
  }

  return queries.slice(0, 4).map((query, index) => ({
    title: `Suggested search ${index + 1}`,
    url: "",
    materialType: "search_query",
    reason: `Use this query to pull targeted IB resources for the diagnosed weakness: ${query}.`,
    topics: weaknesses.slice(0, 2).map((item) => item.topic),
    score: 0,
  }));
}

export async function generateStudyAnalysisBundle(
  db: AnyDb,
  examInput: GenericDocument
): Promise<StudyAnalysisBundle> {
  const exam = normalizeExamRecord(examInput);
  const fallback = buildFallbackBundle(exam);
  const ibContext = await buildIbKnowledgeContext(db, {
    subjectText: exam.subject,
    level: exam.grade,
    queryTerms: fallback.recommendedQueries,
  });
  const prompt = buildAnalysisPrompt(exam, fallback, formatIbKnowledgeContext(ibContext));
  const aiResponse = await callStudyAssistantModel(prompt, {
    systemPrompt:
      "You are a senior IB learning strategist. Diagnose weaknesses from exam evidence, create a practical study plan, and return valid JSON only.",
    temperature: 0.2,
    maxTokens: 2500,
  });

  if (!aiResponse) {
    fallback.recommendedMaterials = await recommendStudyMaterials(
      db,
      exam,
      fallback.weaknesses,
      fallback.recommendedQueries
    );
    return fallback;
  }

  const parsed = extractJson(aiResponse);
  if (!parsed) {
    fallback.recommendedMaterials = await recommendStudyMaterials(
      db,
      exam,
      fallback.weaknesses,
      fallback.recommendedQueries
    );
    return fallback;
  }

  const weaknesses = sanitizeWeaknesses(parsed.weaknesses, fallback.weaknesses);
  const recommendedQueries = sanitizeQueries(parsed.recommendedQueries, fallback.recommendedQueries);
  const bundle: StudyAnalysisBundle = {
    overview: asString(parsed.overview) || fallback.overview,
    scoreSummary: sanitizeScoreSummary(parsed.scoreSummary, fallback.scoreSummary),
    weaknesses,
    plan: sanitizePlan(parsed.plan, fallback.plan),
    recommendedQueries,
    recommendedMaterials: [],
    analysisMode: "ai",
  };

  bundle.recommendedMaterials = await recommendStudyMaterials(db, exam, weaknesses, recommendedQueries);
  return bundle;
}

function calculatePlanRisk(blockers: string[], completionRate: number): "low" | "medium" | "high" {
  if (blockers.length >= 2 || completionRate < 0.3) {
    return "high";
  }
  if (blockers.length === 1 || completionRate < 0.7) {
    return "medium";
  }
  return "low";
}

export function buildCheckInFeedback(
  plan: StudyPlanRecord,
  payload: StudyCheckInPayload
): StudyCoachFeedback {
  const totalTasks = Math.max(plan.tasks.length, 1);
  const completionRate = payload.completedTaskIds.length / totalTasks;
  const nextOpenTask =
    plan.tasks.find((task) => !payload.completedTaskIds.includes(task.taskId)) || plan.tasks[0];
  const riskLevel = calculatePlanRisk(payload.blockers, completionRate);

  if (riskLevel === "high") {
    return {
      summary:
        "Execution has stalled. The student needs a smaller next step and a quick recovery checkpoint.",
      nextAction: nextOpenTask
        ? `Complete only one focused task next: ${nextOpenTask.title}.`
        : "Review the plan and re-commit to one short recovery task.",
      riskLevel,
    };
  }

  if (riskLevel === "medium") {
    return {
      summary:
        "Progress is moving, but consistency is still fragile. The next study block should stay narrow and measurable.",
      nextAction: nextOpenTask
        ? `Prioritize ${nextOpenTask.title} and record whether the same mistake appears again.`
        : "Continue the next scheduled study block and log the result.",
      riskLevel,
    };
  }

  return {
    summary: "Execution is healthy. Keep reinforcing the same rhythm until the next checkpoint.",
    nextAction: nextOpenTask
      ? `Move to ${nextOpenTask.title} and keep the correction notes concise.`
      : "Maintain the current rhythm and review the next checkpoint.",
    riskLevel,
  };
}
