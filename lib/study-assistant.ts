import { createHash } from "crypto";
import { AnyDb } from "@/lib/mongodb";
import { callStudyAssistantModel } from "@/lib/study-model";
import {
  buildIbKnowledgeContext,
  findBestIbSubject,
  formatIbKnowledgeContext,
  IB_MATERIAL_CHUNKS_COLLECTION,
  IB_MATERIALS_COLLECTION,
} from "@/lib/ib-knowledge";
import { deleteZillizVectors, rerankZillizTextHits, searchZillizByText, upsertZillizTextVector } from "@/lib/zilliz";

export const STUDY_EXAMS_COLLECTION = "study_exams";
export const STUDY_ANALYSES_COLLECTION = "study_exam_analyses";
export const STUDY_PLANS_COLLECTION = "study_learning_plans";
export const STUDY_CHECKINS_COLLECTION = "study_check_ins";
export const STUDY_MATERIALS_COLLECTION = "study_materials";
export const STUDY_QUESTION_BANK_COLLECTION = "study_question_bank";
export const STUDY_AUTO_LEARN_ORIGIN = "study_upload_auto_learn";
export const STUDY_AUTO_LEARN_SOURCE_KIND = "uploaded_exam_verified_question";

function readIntegerEnv(name: string, fallback: number): number {
  const value = Number.parseInt(process.env[name] || "", 10);
  return Number.isFinite(value) ? value : fallback;
}

const STUDY_RECOMMENDATION_MIN_YEAR = readIntegerEnv("STUDY_ASSISTANT_RECOMMENDATION_MIN_YEAR", 2015);
const STUDY_RECOMMENDATION_ALLOW_REVIEW_REQUIRED =
  process.env.STUDY_ASSISTANT_RECOMMENDATION_ALLOW_REVIEW_REQUIRED === "true";
const STUDY_RECOMMENDATION_ALLOWED_QUALITY_LEVELS = new Set(["good", "warn"]);
const STUDY_ON_DEMAND_READABLE_REPAIR =
  process.env.STUDY_MATERIAL_ON_DEMAND_READABLE_REPAIR === "true";
const STUDY_ON_DEMAND_READABLE_REPAIR_MAX_YEAR = readIntegerEnv(
  "STUDY_MATERIAL_ON_DEMAND_READABLE_REPAIR_MAX_YEAR",
  2014
);
const STUDY_ON_DEMAND_READABLE_REPAIR_RISK_THRESHOLD = readIntegerEnv(
  "STUDY_MATERIAL_ON_DEMAND_READABLE_REPAIR_RISK_THRESHOLD",
  40
);
const STUDY_ON_DEMAND_READABLE_REPAIR_TIMEOUT_MS = readIntegerEnv(
  "STUDY_MATERIAL_ON_DEMAND_READABLE_REPAIR_TIMEOUT_MS",
  300_000
);
const STUDY_ON_DEMAND_READABLE_REPAIR_MAX_INPUT_CHARS = readIntegerEnv(
  "STUDY_MATERIAL_ON_DEMAND_READABLE_REPAIR_MAX_INPUT_CHARS",
  3000
);
const STUDY_ON_DEMAND_READABLE_REPAIR_MAX_TOKENS = readIntegerEnv(
  "STUDY_MATERIAL_ON_DEMAND_READABLE_REPAIR_MAX_TOKENS",
  1200
);
const STUDY_ON_DEMAND_READABLE_REPAIR_MODEL =
  process.env.STUDY_MATERIAL_ON_DEMAND_READABLE_REPAIR_MODEL || "qwen-plus";

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

export interface StudyExamImageQualityReport {
  fileName: string;
  originalFileName?: string;
  splitFrom?: string;
  cropRegion?: string;
  width: number | null;
  height: number | null;
  megapixels: number | null;
  brightness: number | null;
  contrast: number | null;
  sharpness: number | null;
  level: string;
  warnings: string[];
  processed: boolean;
}

export interface StudyExamSourceFile {
  fileName: string;
  mimeType: string;
  size: number;
  qualityReport?: StudyExamImageQualityReport;
}

export interface StudyStandardizedGoal {
  test: string;
  currentScore: string;
  targetScore: string;
  examDate: string;
  priority: string;
}

export interface StudyPlanningProfile {
  subjectStrengths: string[];
  subjectWeaknesses: string[];
  standardizedGoals: StudyStandardizedGoal[];
  targetMajors: string[];
  activityThemes: string[];
  apFocuses: string[];
  notes: string;
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
  sourceFiles: StudyExamSourceFile[];
  planningProfile: StudyPlanningProfile;
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
  instructions: string[];
  deliverable: string;
  practiceItems: string[];
  linkedMaterialTitles: string[];
  linkedMaterialChunkIds: string[];
  linkedMaterialIds: string[];
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

export interface StudyPlanTableRow {
  category: string;
  item: string;
  currentState: string;
  targetState: string;
  nextAction: string;
  cadence: string;
  priority: StudyWeaknessSeverity;
}

export interface StudyLearningPlan {
  title: string;
  horizonDays: number;
  dailyMinutes: number;
  goals: string[];
  strategicOverview: string;
  planTable: StudyPlanTableRow[];
  tasks: StudyPlanTask[];
  checkpoints: StudyCheckpoint[];
  coachStrategy: StudyCoachStrategy;
}

export interface StudyMaterialRecommendation {
  materialId?: string;
  chunkId?: string;
  title: string;
  url: string;
  materialType: string;
  reason: string;
  topics: string[];
  score: number;
  sourceTitle?: string;
  questionRef?: string;
  excerpt?: string;
  actionLabel?: string;
  estimatedMinutes?: number;
  sourceType?: "practice_pack" | "practice_question" | "markscheme_check" | "reference" | "search_query";
  workflowSteps?: string[];
  expectedOutcome?: string;
  pairedMarkschemeTitle?: string;
  pairedMarkschemeChunkId?: string;
}

export interface StudyMaterialPreviewItem {
  chunkId?: string;
  materialId?: string;
  title: string;
  materialType: string;
  sourceTitle: string;
  questionRef: string;
  content: string;
  readableContent: string;
  hasReadableContent: boolean;
  excerpt: string;
  sourceUrl: string;
}

export interface StudyMaterialPreviewPayload {
  primary: StudyMaterialPreviewItem | null;
  pairedMarkscheme: StudyMaterialPreviewItem | null;
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

function normalizeImageQualityReport(value: unknown): StudyExamImageQualityReport | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const source = value as GenericDocument;
  const fileName = asString(source.fileName);
  const level = asString(source.level);
  const warnings = asStringArray(source.warnings);

  if (!fileName && !level && warnings.length === 0) {
    return undefined;
  }

  return {
    fileName,
    originalFileName: asString(source.originalFileName) || undefined,
    splitFrom: asString(source.splitFrom) || undefined,
    cropRegion: asString(source.cropRegion) || undefined,
    width: asNumber(source.width),
    height: asNumber(source.height),
    megapixels: asNumber(source.megapixels),
    brightness: asNumber(source.brightness),
    contrast: asNumber(source.contrast),
    sharpness: asNumber(source.sharpness),
    level: level || "unknown",
    warnings,
    processed: source.processed === true,
  };
}

function asDocument(value: unknown): GenericDocument {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as GenericDocument) : {};
}

function hasStringArrayValue(value: unknown, expected: string): boolean {
  return asStringArray(value).some((item) => item === expected);
}

function isAutoLearnedReference(document: GenericDocument | null | undefined): boolean {
  if (!document) {
    return false;
  }

  return (
    asString(document.origin) === STUDY_AUTO_LEARN_ORIGIN ||
    asString(document.sourceKind) === STUDY_AUTO_LEARN_SOURCE_KIND ||
    asString(document.sourceName) === "approved_user_question" ||
    hasStringArrayValue(document.tags, "auto-learned")
  );
}

function extractionQualityLevel(document: GenericDocument | null | undefined): string {
  if (!document) {
    return "";
  }

  const direct = asString(document.textExtractionQualityLevel);
  if (direct) {
    return direct.toLowerCase();
  }

  const extraction = asDocument(document.textExtraction);
  const quality = asDocument(extraction.quality);
  return asString(quality.level).toLowerCase();
}

function extractionReviewRequired(document: GenericDocument | null | undefined): boolean {
  if (!document) {
    return false;
  }

  if (document.reviewRequired === true) {
    return true;
  }

  const extraction = asDocument(document.textExtraction);
  return extraction.reviewRequired === true;
}

function isRecommendableStudyChunk(chunk: GenericDocument, material: GenericDocument | undefined): boolean {
  const materialType = asString(chunk.materialType) || asString(material?.type);
  const isVerifiedQuestion = materialType === "VERIFIED_QUESTION";
  const isAutoLearned = isAutoLearnedReference(chunk) || isAutoLearnedReference(material);
  const isTrustedGeneratedItem = isVerifiedQuestion || isAutoLearned;

  if (isVerifiedQuestion && asString(chunk.reviewStatus) !== "approved") {
    return false;
  }

  const year = asNumber(chunk.year) ?? asNumber(material?.year);
  if (!isTrustedGeneratedItem && STUDY_RECOMMENDATION_MIN_YEAR > 0 && year !== null && year < STUDY_RECOMMENDATION_MIN_YEAR) {
    return false;
  }

  if (
    !isTrustedGeneratedItem &&
    !STUDY_RECOMMENDATION_ALLOW_REVIEW_REQUIRED &&
    (extractionReviewRequired(chunk) || extractionReviewRequired(material))
  ) {
    return false;
  }

  const qualityLevel = extractionQualityLevel(chunk) || extractionQualityLevel(material);
  if (qualityLevel && !STUDY_RECOMMENDATION_ALLOWED_QUALITY_LEVELS.has(qualityLevel)) {
    return false;
  }

  return true;
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

function defaultPlanningProfile(): StudyPlanningProfile {
  return {
    subjectStrengths: [],
    subjectWeaknesses: [],
    standardizedGoals: [],
    targetMajors: [],
    activityThemes: [],
    apFocuses: [],
    notes: "",
  };
}

function normalizeStandardizedGoals(value: unknown): StudyStandardizedGoal[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      const source = (item || {}) as GenericDocument;
      const test = asString(source.test);
      const targetScore = asString(source.targetScore);

      if (!test && !targetScore) {
        return null;
      }

      return {
        test,
        currentScore: asString(source.currentScore),
        targetScore,
        examDate: asString(source.examDate),
        priority: asString(source.priority) || "medium",
      } satisfies StudyStandardizedGoal;
    })
    .filter((item): item is StudyStandardizedGoal => Boolean(item));
}

function normalizePlanningProfile(value: unknown): StudyPlanningProfile {
  const source = (value || {}) as GenericDocument;
  const fallback = defaultPlanningProfile();

  return {
    subjectStrengths: asStringArray(source.subjectStrengths),
    subjectWeaknesses: asStringArray(source.subjectWeaknesses),
    standardizedGoals: normalizeStandardizedGoals(source.standardizedGoals),
    targetMajors: asStringArray(source.targetMajors),
    activityThemes: asStringArray(source.activityThemes),
    apFocuses: asStringArray(source.apFocuses),
    notes: asString(source.notes) || fallback.notes,
  };
}

function normalizeQuestion(value: unknown, index: number): StudyExamQuestion {
  const source = (value || {}) as GenericDocument;
  const score = asNumber(source.score);
  const maxScore = asNumber(source.maxScore);
  const rawTeacherComment = asString(source.teacherComment);
  const hasRawScorePair = score !== null && maxScore !== null;
  const hasValidScorePair =
    score !== null && maxScore !== null && maxScore > 0 && score >= 0 && score <= maxScore;
  const normalizedScore = hasValidScorePair ? score : null;
  const normalizedMaxScore = hasValidScorePair ? maxScore : maxScore !== null && maxScore > 0 ? maxScore : null;
  const teacherLooksLikeInvalidScore =
    hasRawScorePair && !hasValidScorePair && rawTeacherComment.replace(/\s+/g, "") === `${score}/${maxScore}`;
  const normalizedTeacherComment = teacherLooksLikeInvalidScore ? "" : rawTeacherComment;

  return {
    questionNumber: asString(source.questionNumber) || String(index + 1),
    stem: asString(source.stem),
    studentAnswer: asString(source.studentAnswer),
    correctAnswer: asString(source.correctAnswer),
    score: normalizedScore,
    maxScore: normalizedMaxScore,
    knowledgePoints: asStringArray(source.knowledgePoints),
    teacherComment: normalizedTeacherComment,
    isWrong:
      typeof source.isWrong === "boolean" && (!hasRawScorePair || hasValidScorePair)
        ? source.isWrong
        : normalizedScore !== null && normalizedMaxScore !== null
          ? normalizedScore < normalizedMaxScore
          : null,
  };
}

function isUsableExamQuestion(question: StudyExamQuestion): boolean {
  const stem = question.stem.trim();
  const studentAnswer = question.studentAnswer.trim();
  const teacherComment = question.teacherComment.trim();
  if (!stem && !studentAnswer && !teacherComment) {
    return false;
  }

  const normalizedStem = stem.replace(/\s+/g, " ").trim();
  if (!teacherComment && /^(?:cm|mm|m|kg|g|s|ms|metal sheet|highest point)$/i.test(normalizedStem)) {
    return false;
  }

  const questionNumber = Number.parseInt(question.questionNumber, 10);
  if (Number.isFinite(questionNumber) && questionNumber > 30 && normalizedStem.length < 25 && !teacherComment) {
    return false;
  }

  if (
    question.score !== null &&
    question.maxScore !== null &&
    (question.maxScore <= 0 || question.score < 0 || question.score > question.maxScore)
  ) {
    question.score = null;
  }

  return true;
}

export function normalizeExamRecord(input: GenericDocument): Omit<StudyExamRecord, "_id"> {
  const questions = Array.isArray(input.questions)
    ? input.questions.map((item, index) => normalizeQuestion(item, index))
        .filter(isUsableExamQuestion)
    : [];
  const sourceFiles = Array.isArray(input.sourceFiles)
    ? input.sourceFiles
        .map((item) => {
          const source = (item || {}) as GenericDocument;
          const fileName = asString(source.fileName);
          const mimeType = asString(source.mimeType);
          const size = asNumber(source.size) || 0;
          const qualityReport = normalizeImageQualityReport(source.qualityReport);

          if (!fileName) {
            return null;
          }

          return {
            fileName,
            mimeType,
            size,
            ...(qualityReport ? { qualityReport } : {}),
          } satisfies StudyExamSourceFile;
        })
        .filter((item): item is StudyExamSourceFile => Boolean(item))
    : [];
  const legacySourceFile = input.sourceFile
    ? (() => {
        const source = input.sourceFile as GenericDocument;
        const qualityReport = normalizeImageQualityReport(source.qualityReport);
        return {
          fileName: asString(source.fileName),
          mimeType: asString(source.mimeType),
          size: asNumber(source.size) || 0,
          ...(qualityReport ? { qualityReport } : {}),
        };
      })()
    : null;
  const primarySourceFile =
    sourceFiles[0] ||
    (legacySourceFile?.fileName
      ? legacySourceFile
      : null);
  const normalizedSourceFiles =
    sourceFiles.length > 0
      ? sourceFiles
      : primarySourceFile
        ? [primarySourceFile]
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
    sourceFile: primarySourceFile,
    sourceFiles: normalizedSourceFiles,
    planningProfile: normalizePlanningProfile(input.planningProfile),
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

async function findChunkByReference(db: AnyDb, chunkId: string): Promise<GenericDocument | null> {
  const reference = asString(chunkId);
  if (!reference) {
    return null;
  }

  const byVectorId = (await db
    .collection(IB_MATERIAL_CHUNKS_COLLECTION)
    .findOne({ milvusVectorId: reference as never })) as GenericDocument | null;

  if (byVectorId) {
    return byVectorId;
  }

  return findDocumentById(db, IB_MATERIAL_CHUNKS_COLLECTION, reference);
}

async function findReadableOverlayForChunk(db: AnyDb, chunk: GenericDocument | null): Promise<GenericDocument | null> {
  if (!chunk) {
    return null;
  }

  const materialId = asString(chunk.materialId);
  const rawContent = asString(chunk.content);
  const questionRef = asString(chunk.questionRef) || extractQuestionRef(rawContent);
  if (!materialId || !questionRef || asString(chunk.readableContent)) {
    return null;
  }

  const labChunkId = `lab:${materialId}:${questionRef}`;
  return (await db.collection(IB_MATERIAL_CHUNKS_COLLECTION).findOne({
    $or: [
      {
        milvusVectorId: labChunkId as never,
        readableContent: { $type: "string", $ne: "" } as never,
      },
      {
        materialId: materialId as never,
        questionRef: questionRef as never,
        readableContent: { $type: "string", $ne: "" } as never,
        sourceKind: { $in: ["readable_repair_preview", "lab_readable_preview"] } as never,
      },
    ],
  })) as GenericDocument | null;
}

function scoreReadableRepairRisk(content: string) {
  const lines = content.split(/\r?\n/);
  const mathLines = lines.filter((line) =>
    /[=+\-*/^()[\]{}<>]|(?:\b[A-ZMR]\d\b)|(?:\b[munpqd]\s*=)/i.test(line)
  );
  const tabbedMathLines = mathLines.filter((line) => /\t/.test(line));
  const isolatedTokenLines = mathLines.filter((line) => {
    const tokens = line.trim().split(/\s+/).filter(Boolean);
    const isolated = tokens.filter((token) => /^[a-zA-Z0-9]$/.test(token)).length;
    return tokens.length >= 5 && isolated / tokens.length >= 0.45;
  });
  const replacementCharCount = (content.match(/\uFFFD|\u25A1/g) || []).length;

  return Math.min(
    100,
    Math.round(
      (tabbedMathLines.length / Math.max(1, mathLines.length)) * 45 +
        (isolatedTokenLines.length / Math.max(1, mathLines.length)) * 45 +
        Math.min(20, replacementCharCount * 2) +
        (/\(\s*\)\s*\d/.test(content) ? 10 : 0)
    )
  );
}

function trimReadableRepairInput(content: string): string {
  const maxInputChars = STUDY_ON_DEMAND_READABLE_REPAIR_MAX_INPUT_CHARS;
  if (!maxInputChars || content.length <= maxInputChars) {
    return content;
  }

  const headLength = Math.max(1000, Math.floor(maxInputChars * 0.72));
  const tailLength = Math.max(400, maxInputChars - headLength);
  return [
    content.slice(0, headLength).trim(),
    "",
    "[... middle omitted to keep this on-demand repair responsive ...]",
    "",
    content.slice(Math.max(0, content.length - tailLength)).trim(),
  ].join("\n");
}

function normalizeReadableContent(content: string): string {
  return String(content || "")
    .trim()
    .replace(/^```(?:markdown|md)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
}

function shouldRepairReadableOnDemand(chunk: GenericDocument | null, material: GenericDocument | null): boolean {
  if (!STUDY_ON_DEMAND_READABLE_REPAIR || !chunk) {
    return false;
  }
  if (asString(chunk.readableContent)) {
    return false;
  }

  const materialType = asString(chunk.materialType) || asString(material?.type);
  if (materialType !== "MARK_SCHEME") {
    return false;
  }

  const year = asNumber(material?.year) ?? asNumber(chunk.year);
  if (year !== null && year > STUDY_ON_DEMAND_READABLE_REPAIR_MAX_YEAR) {
    return false;
  }

  const content = asString(chunk.content);
  const questionRef = asString(chunk.questionRef) || extractQuestionRef(content);
  if (!content || !questionRef) {
    return false;
  }

  return scoreReadableRepairRisk(content) >= STUDY_ON_DEMAND_READABLE_REPAIR_RISK_THRESHOLD;
}

async function repairReadableOnDemand(
  db: AnyDb,
  chunk: GenericDocument | null,
  material: GenericDocument | null
): Promise<GenericDocument | null> {
  if (!shouldRepairReadableOnDemand(chunk, material)) {
    return null;
  }

  const rawContent = asString(chunk?.content);
  const materialId = asString(chunk?.materialId) || asString(material?.materialId);
  const questionRef = asString(chunk?.questionRef) || extractQuestionRef(rawContent);
  if (!materialId || !questionRef || !rawContent) {
    return null;
  }

  const focusedContent =
    extractGranularQuestionMatch(rawContent, questionRef, [questionRef], 3000).content ||
    stripAdministrativeLead(rawContent).slice(0, 3000).trim() ||
    rawContent.slice(0, 3000).trim();
  const prompt = [
    "Rewrite the following IB markscheme OCR snippet into a student-readable Markdown scoring guide.",
    "",
    "Hard rules:",
    "1. Do not add information that is not present in the OCR text.",
    "2. Restore obvious math notation when the OCR pattern is clear, for example u_1, u_n, u_6, u_12, d, M1, A1.",
    "3. Preserve METHOD labels, M1/A1/N marks, and [marks] totals.",
    "4. If a formula is uncertain, mark it as [uncertain] instead of inventing it.",
    "5. Output Markdown only, with no preface or explanation.",
    "",
    `Material: ${asString(material?.title) || asString(chunk?.title) || "unknown"}`,
    `Question: ${questionRef}`,
    "",
    "Original OCR text:",
    "```text",
    trimReadableRepairInput(focusedContent),
    "```",
  ].join("\n");

  const readableContent = normalizeReadableContent(await callStudyAssistantModel(prompt, {
    systemPrompt:
      "You conservatively rewrite OCR-extracted IB markscheme snippets into readable Markdown. Do not invent missing math.",
    temperature: 0,
    maxTokens: STUDY_ON_DEMAND_READABLE_REPAIR_MAX_TOKENS,
    modelId: STUDY_ON_DEMAND_READABLE_REPAIR_MODEL,
    timeoutMs: STUDY_ON_DEMAND_READABLE_REPAIR_TIMEOUT_MS,
    requestLabel: "study-material-readable-on-demand",
  }));

  if (!readableContent) {
    return null;
  }

  const labChunkId = `lab:${materialId}:${questionRef}`;
  const overlay: GenericDocument = {
    materialId,
    subjectId: asNumber(chunk?.subjectId) || asNumber(material?.subjectId) || 0,
    subjectCode: asString(chunk?.subjectCode) || asString(material?.subjectCode),
    title: asString(chunk?.title) || asString(material?.title),
    materialType: asString(chunk?.materialType) || asString(material?.type),
    hlSl: asString(chunk?.hlSl) || asString(material?.hlSl) || "BOTH",
    difficulty: asNumber(chunk?.difficulty) || asNumber(material?.difficulty) || 3,
    year: asNumber(chunk?.year) ?? asNumber(material?.year),
    paper: asString(chunk?.paper) || asString(material?.paper),
    timezone: asString(chunk?.timezone) || asString(material?.timezone),
    tags: [...new Set([...asStringArray(chunk?.tags), "readable-repair", "on-demand"])],
    topics: asStringArray(chunk?.topics),
    questionRef,
    chunkIndex: -1,
    content: focusedContent,
    readableContent,
    readableContentSource: "on-demand-qwen-readable-repair",
    readableContentUpdatedAt: new Date().toISOString(),
    tokenCount: Math.ceil(readableContent.length / 4),
    milvusVectorId: labChunkId,
    textExtractionStrategy: "on_demand_readable_repair",
    textExtractionQualityLevel: "readable",
    sourceKind: "readable_repair_preview",
    reviewStatus: "readable_ready",
    updatedAt: new Date().toISOString(),
  };

  await db.collection(IB_MATERIAL_CHUNKS_COLLECTION).updateOne(
    { milvusVectorId: labChunkId as never },
    {
      $set: overlay as never,
      $setOnInsert: {
        createdAt: new Date().toISOString(),
      } as never,
    },
    { upsert: true }
  );

  return overlay;
}

function mergeReadableOverlay(chunk: GenericDocument | null, overlay: GenericDocument | null): GenericDocument | null {
  if (!chunk || !overlay) {
    return chunk;
  }

  const readableContent = normalizeReadableContent(asString(overlay.readableContent));
  if (!readableContent) {
    return chunk;
  }

  return {
    ...chunk,
    readableContent,
    readableContentSource: asString(overlay.readableContentSource),
    readableContentUpdatedAt: asString(overlay.readableContentUpdatedAt),
  };
}

async function findMaterialByReference(db: AnyDb, materialId: string): Promise<GenericDocument | null> {
  const reference = asString(materialId);
  if (!reference) {
    return null;
  }

  const byMaterialId = (await db
    .collection(IB_MATERIALS_COLLECTION)
    .findOne({ materialId: reference as never })) as GenericDocument | null;

  if (byMaterialId) {
    return byMaterialId;
  }

  return findDocumentById(db, IB_MATERIALS_COLLECTION, reference);
}

function buildMaterialPreviewItem(
  chunk: GenericDocument | null,
  material: GenericDocument | null,
  fallbackTitle = ""
): StudyMaterialPreviewItem | null {
  const rawContent = asString(chunk?.content) || asString(material?.description) || asString(material?.summary);
  const readableRawContent = normalizeReadableContent(
    asString(chunk?.readableContent) ||
      asString(chunk?.displayContent) ||
      asString(chunk?.aiReadableContent)
  );
  const sourceTitle = asString(material?.title) || asString(chunk?.title) || fallbackTitle;

  if (!rawContent && !sourceTitle) {
    return null;
  }

  const baseQuestionRef = asString(chunk?.questionRef) || extractQuestionRef(rawContent);
  const displayRawContent = readableRawContent || rawContent;
  const granularMatch = readableRawContent
    ? { content: readableRawContent.slice(0, 4000).trim(), questionRef: baseQuestionRef }
    : extractGranularQuestionMatch(displayRawContent, baseQuestionRef, baseQuestionRef ? [baseQuestionRef] : [], 2200);
  const questionRef = granularMatch.questionRef || baseQuestionRef;
  const content = readableRawContent
    ? readableRawContent.slice(0, 4000).trim()
    : granularMatch.content ||
      stripAdministrativeLead(displayRawContent).slice(0, 2200).trim() ||
      displayRawContent.slice(0, 2200).trim();
  const evidenceContent =
    rawContent && rawContent !== content
      ? (extractGranularQuestionMatch(rawContent, baseQuestionRef, baseQuestionRef ? [baseQuestionRef] : [], 2200).content ||
          stripAdministrativeLead(rawContent).slice(0, 2200).trim() ||
          rawContent.slice(0, 2200).trim())
      : rawContent;
  const title =
    fallbackTitle ||
    asString(chunk?.title) ||
    asString(material?.title) ||
    (questionRef ? `资料片段 ${questionRef}` : "资料片段");
  const lowQualityPreview = chunk ? isLowQualityRecommendedChunk(chunk, content) : false;
  const safeContent = lowQualityPreview
    ? "该资料片段是说明页或 OCR 质量不足，已屏蔽为推荐资料。请返回学习助手重新分析，系统会重新匹配更可用的题目/评分细则。"
    : content;
  const safeEvidenceContent = lowQualityPreview ? safeContent : evidenceContent || content;

  return {
    chunkId: asString(chunk?.milvusVectorId) || (chunk?._id ? String(chunk._id) : undefined),
    materialId: asString(material?.materialId) || asString(chunk?.materialId) || (material?._id ? String(material._id) : undefined),
    title,
    materialType: asString(chunk?.materialType) || asString(material?.type) || "REFERENCE",
    sourceTitle: sourceTitle || title,
    questionRef,
    content: safeEvidenceContent,
    readableContent: safeContent,
    hasReadableContent: Boolean(readableRawContent) && !lowQualityPreview,
    excerpt: buildExcerpt(safeContent || sourceTitle || title, questionRef ? [questionRef] : []),
    sourceUrl: asString(material?.fileUrl) || asString(material?.sourceUrl),
  };
}

export async function getStudyMaterialPreview(
  db: AnyDb,
  input: {
    chunkId?: string;
    materialId?: string;
    pairedMarkschemeChunkId?: string;
    fallbackTitle?: string;
    pairedFallbackTitle?: string;
  }
): Promise<StudyMaterialPreviewPayload> {
  const primaryChunk = await findChunkByReference(db, input.chunkId || "");
  const primaryReadableOverlay = await findReadableOverlayForChunk(db, primaryChunk);
  let mergedPrimaryChunk = mergeReadableOverlay(primaryChunk, primaryReadableOverlay);
  const primaryMaterialId = asString(mergedPrimaryChunk?.materialId) || asString(input.materialId);
  const primaryMaterial = await findMaterialByReference(db, primaryMaterialId);
  if (!primaryReadableOverlay) {
    const onDemandPrimaryOverlay = await repairReadableOnDemand(db, mergedPrimaryChunk, primaryMaterial);
    mergedPrimaryChunk = mergeReadableOverlay(mergedPrimaryChunk, onDemandPrimaryOverlay);
  }

  const primary =
    buildMaterialPreviewItem(
      mergedPrimaryChunk,
      primaryMaterial && !Array.isArray(primaryMaterial) ? primaryMaterial : null,
      asString(input.fallbackTitle)
    ) || null;

  const pairedChunk = await findChunkByReference(db, input.pairedMarkschemeChunkId || "");
  const pairedReadableOverlay = await findReadableOverlayForChunk(db, pairedChunk);
  let mergedPairedChunk = mergeReadableOverlay(pairedChunk, pairedReadableOverlay);
  const pairedMaterialId = asString(mergedPairedChunk?.materialId);
  const pairedMaterial = await findMaterialByReference(db, pairedMaterialId);
  if (!pairedReadableOverlay) {
    const onDemandPairedOverlay = await repairReadableOnDemand(db, mergedPairedChunk, pairedMaterial);
    mergedPairedChunk = mergeReadableOverlay(mergedPairedChunk, onDemandPairedOverlay);
  }
  const pairedMarkscheme =
    buildMaterialPreviewItem(
      mergedPairedChunk,
      pairedMaterial,
      asString(input.pairedFallbackTitle)
    ) || null;

  return {
    primary,
    pairedMarkscheme,
  };
}

function inferQuestionIsWrong(question: StudyExamQuestion): boolean {
  if (typeof question.isWrong === "boolean") {
    return question.isWrong;
  }
  if (
    question.score !== null &&
    question.maxScore !== null &&
    question.maxScore > 0 &&
    question.score >= 0 &&
    question.score <= question.maxScore
  ) {
    return question.score < question.maxScore;
  }
  if (question.studentAnswer && question.correctAnswer) {
    return question.studentAnswer.trim().toLowerCase() !== question.correctAnswer.trim().toLowerCase();
  }
  return false;
}

function extractExamTotalPoints(text: string): number | null {
  const candidates = [...text.matchAll(/(?:\(|\b)(\d{2,3})\s*marks?\b\)?/gi)]
    .map((match) => Number(match[1]))
    .filter((value) => Number.isFinite(value) && value >= 20 && value <= 150);

  if (candidates.length === 0) {
    return null;
  }

  return Math.max(...candidates);
}

function extractVisibleDeductionPoints(text: string): number {
  const normalized = text.replace(/[−–—]/g, "-");
  const deductions = [...normalized.matchAll(/(?:^|[\s,;:([（])-\s*(\d{1,2})(?=\b|[\s,;.)\]）])/gm)]
    .map((match) => Number(match[1]))
    .filter((value) => Number.isFinite(value) && value > 0 && value <= 20);

  if (deductions.length === 0) {
    return 0;
  }

  return deductions.reduce((sum, value) => sum + value, 0);
}

function buildScoreSummary(exam: StudyExamRecord): StudyScoreSummary {
  const totalQuestions = exam.questions.length;
  const wrongQuestions = exam.questions.filter(inferQuestionIsWrong).length;

  const scoredQuestions = exam.questions.filter(
    (question) =>
      question.score !== null &&
      question.maxScore !== null &&
      question.maxScore > 0 &&
      question.score >= 0 &&
      question.score <= question.maxScore
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

function inferFallbackTopic(question: StudyExamQuestion): string {
  const text = [
    question.stem,
    question.studentAnswer,
    question.teacherComment,
    ...question.knowledgePoints,
  ]
    .join(" ")
    .toLowerCase();

  if (/(probability|random|cube|dice|replacement|chosen)/i.test(text)) {
    return "Probability";
  }
  if (/(differentiat|derivative|dy\/dx|normal|tangent|gradient)/i.test(text)) {
    return "Differentiation";
  }
  if (/(integrat|∫|area under|anti-derivative)/i.test(text)) {
    return "Integration";
  }
  if (/(vector|scalar|magnitude|dot product|parallel)/i.test(text)) {
    return "Vectors";
  }
  if (/(polynomial|factor|remainder theorem|divisible|root)/i.test(text)) {
    return "Polynomials";
  }
  if (/(function|graph|domain|range|inverse|composite|ln|log|exponential)/i.test(text)) {
    return "Functions and graphs";
  }
  if (/(cylinder|volume|surface area|maximi|minimi|optimization)/i.test(text)) {
    return "Optimization";
  }

  return "General accuracy";
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
  // Global answer-sheet totals are often OCR-noisy; fallback diagnosis should only use question-level evidence.
  const totalPoints: number | null = null;
  const deductedPoints = 0;

  for (const question of exam.questions.filter(inferQuestionIsWrong)) {
    const topics = question.knowledgePoints.length > 0 ? question.knowledgePoints : [inferFallbackTopic(question)];
    for (const topic of topics) {
      const entry = grouped.get(topic) || { count: 0, evidence: [] };
      entry.count += 1;
      const scoreEvidence =
        question.score !== null && question.maxScore !== null
          ? ` (${question.score}/${question.maxScore})`
          : "";
      entry.evidence.push(`Q${question.questionNumber}${scoreEvidence}: ${question.stem.slice(0, 120)}`);
      grouped.set(topic, entry);
    }
  }

  const stableWeaknesses = [...grouped.entries()]
    .sort((left, right) => right[1].count - left[1].count)
    .slice(0, 4)
    .map(([topic, entry]) => ({
      topic,
      skill: topic,
      severity: severityFromCount(entry.count),
      reason: "该主题在结构化错题证据中出现，需要优先复盘概念、方法和作答表达。",
      evidence: entry.evidence.slice(0, 3),
      recommendedFocus: `先复盘 ${topic} 的核心方法，再完成针对性练习与订正。`,
      confidence: Math.min(0.9, 0.6 + entry.count * 0.1),
    }));

  if (stableWeaknesses.length > 0) {
    return stableWeaknesses;
  }

  return [
    {
      topic: "复盘策略",
      skill: "错因分析",
      severity: "medium",
      reason: "当前卷面中的结构化错因证据不足，暂时无法精确定位具体薄弱点。",
      evidence: ["建议补充错题、分数记录或老师批注后再分析。"],
      recommendedFocus: "先按题型和知识点标注错误，再次上传后可得到更精准诊断。",
      confidence: 0.45,
    },
  ];

  const weaknesses = [...grouped.entries()]
    .sort((left, right) => right[1].count - left[1].count)
    .slice(0, 4)
    .map(([topic, entry]) => ({
      topic,
      skill: topic,
      severity: severityFromCount(entry.count),
      reason:
        deductedPoints > 0 && totalPoints
          ? `从卷面批注可见约失分 ${deductedPoints}/${totalPoints}，该主题在失分证据中出现最集中。`
          : "该主题出现重复错误，说明概念掌握或应用准确性仍有缺口。",
      evidence:
        deductedPoints > 0 && totalPoints
          ? [`识别到可见失分：${deductedPoints}/${totalPoints}。`, ...entry.evidence].slice(0, 3)
          : entry.evidence.slice(0, 3),
      recommendedFocus: `先复盘 ${topic} 的核心方法，再完成针对性练习与订正。`,
      confidence: Math.min(0.9, 0.6 + entry.count * 0.1),
    }));

  if (weaknesses.length > 0) {
    return weaknesses;
  }

  return [
    {
      topic: "复盘策略",
      skill: "错因分析",
      severity: "medium",
      reason: "当前卷面中的结构化错因证据不足，暂时无法精确定位具体薄弱点。",
      evidence: ["建议补充错题、分数记录或老师批注后再分析。"],
      recommendedFocus: "先按题型和知识点标注错误，再次上传后可得到更精准诊断。",
      confidence: 0.45,
    },
  ];
}

function buildFallbackStrategicOverview(
  exam: StudyExamRecord,
  weaknesses: StudyWeakness[],
  profile: StudyPlanningProfile
): string {
  const parts: string[] = [];

  if (weaknesses.length > 0) {
    parts.push(
      `先以 ${exam.subject || "当前 IB 科目"} 作为短期提分主线，优先突破 ${weaknesses
        .slice(0, 2)
        .map((item) => item.topic)
        .join("、")}。`
    );
  }

  if (profile.subjectStrengths.length > 0) {
    parts.push(`优势科目保持手感：${profile.subjectStrengths.slice(0, 3).join("、")}。`);
  }

  if (profile.standardizedGoals.length > 0) {
    parts.push(
      `每周学习负荷需与 ${profile.standardizedGoals
        .slice(0, 2)
        .map((goal) => goal.test)
        .join("、")} 的备考目标联动。`
    );
  }

  if (profile.targetMajors.length > 0 || profile.activityThemes.length > 0) {
    parts.push("学科补弱要与目标专业定位和活动叙事保持一致。");
  }

  if (profile.apFocuses.length > 0) {
    parts.push(`为 AP 方向（如 ${profile.apFocuses.slice(0, 3).join("、")}）保留轻量维持时段。`);
  }

  return parts.join(" ") || "先集中突破诊断出的弱项，再逐步拓展到更长期的学业规划。";
}

function buildFallbackPlanTable(
  exam: StudyExamRecord,
  weaknesses: StudyWeakness[],
  profile: StudyPlanningProfile
): StudyPlanTableRow[] {
  const rows: StudyPlanTableRow[] = weaknesses.slice(0, 3).map((weakness) => ({
    category: "IB 学科",
    item: `${exam.subject || "IB"} - ${weakness.topic}`,
    currentState: weakness.reason,
    targetState: `减少 ${weakness.topic} 的重复错误，逐步恢复解题稳定性。`,
    nextAction: `完成方法复盘 + 错题订正 + 限时小练，形成闭环。`,
    cadence: "2 周内完成 3 个高专注学习块",
    priority: weakness.severity,
  }));

  for (const strength of profile.subjectStrengths.slice(0, 3)) {
    rows.push({
      category: "学科优势",
      item: strength,
      currentState: "当前画像显示这是相对优势项。",
      targetState: "保持稳定，不挤占弱项修复时间。",
      nextAction: `每周保留一次短时维持练习（${strength}）。`,
      cadence: "每周",
      priority: "low",
    });
  }

  for (const watchItem of profile.subjectWeaknesses.slice(0, 3)) {
    rows.push({
      category: "学科预警",
      item: watchItem,
      currentState: "画像中标记为跨考试周期的薄弱方向。",
      targetState: "避免同类缺口在后续评测中反复出现。",
      nextAction: `每周增加 1 次 ${watchItem} 的订正+复盘时段。`,
      cadence: "每周 1-2 次",
      priority: "medium",
    });
  }

  for (const goal of profile.standardizedGoals.slice(0, 3)) {
    const scoreState = [goal.currentScore, goal.targetScore].filter(Boolean).join(" -> ");
    rows.push({
      category: "标化考试",
      item: goal.test || "标化目标",
      currentState: scoreState || "已设置目标方向，但当前分数基线还不完整。",
      targetState: goal.targetScore ? `达到 ${goal.targetScore}。` : "补齐可量化的目标分数。",
      nextAction: `每周固定 1 个时段给 ${goal.test}，并与 IB 补弱节奏联动。`,
      cadence: goal.examDate ? `每周（至 ${goal.examDate}）` : "每周",
      priority: normalizeSeverity(goal.priority),
    });
  }

  for (const major of profile.targetMajors.slice(0, 3)) {
    rows.push({
      category: "专业方向",
      item: major,
      currentState: "已明确目标专业兴趣。",
      targetState: "让学业表现与证据叙事能够支撑该方向。",
      nextAction: `把本轮学科提升沉淀为 1 条与 ${major} 相关的可展示证据。`,
      cadence: "每两周复盘",
      priority: "medium",
    });
  }

  for (const activity of profile.activityThemes.slice(0, 3)) {
    rows.push({
      category: "活动方向",
      item: activity,
      currentState: "该活动主题属于申请叙事的一部分。",
      targetState: "活动成长线与学业提升线保持一致。",
      nextAction: `为 ${activity} 定义 1 个可量化的下一步产出。`,
      cadence: "每周",
      priority: "low",
    });
  }

  for (const apFocus of profile.apFocuses.slice(0, 3)) {
    rows.push({
      category: "AP",
      item: apFocus,
      currentState: "AP 备考已纳入当前规划。",
      targetState: "保持连续性，同时不打断 IB 主线补弱节奏。",
      nextAction: `完成 IB 优先任务后，安排一次 ${apFocus} 轻量维持练习。`,
      cadence: "每周",
      priority: "medium",
    });
  }

  return rows.slice(0, 12);
}

function buildFallbackPlan(
  exam: StudyExamRecord,
  weaknesses: StudyWeakness[]
): StudyLearningPlan {
  const profile = exam.planningProfile;
  const topTopics = weaknesses.slice(0, 3).map((item) => item.topic);
  const dailyMinutes = topTopics.length >= 3 ? 50 : 40;
  const horizonDays = 14;
  const tasks: StudyPlanTask[] = topTopics.flatMap((topic, index) => {
    const baseDay = index * 4 + 1;
    return [
      {
        taskId: `${topic.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-review-${baseDay}`,
        day: baseDay,
        title: `复盘 ${topic} 的核心方法`,
        type: "review",
        minutes: dailyMinutes,
        focusTopics: [topic],
        successCriteria: `总结 ${topic} 的关键解题方法，并记录 3 个“高频易错点”。`,
        instructions: [
          `打开 1 道与 ${topic} 相关的推荐题目，先抄写题目条件。`,
          "不看答案先写标准解题路径。",
          "对照评分细则，标出你原解法中第一处逻辑偏差。",
        ],
        deliverable: `1 页 ${topic} 订正卡（方法、触发词、易错点）。`,
        practiceItems: [`重做上传试卷中与 ${topic} 相关的错题/低置信题。`],
        linkedMaterialTitles: [],
        linkedMaterialChunkIds: [],
        linkedMaterialIds: [],
      },
      {
        taskId: `${topic.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-practice-${baseDay + 1}`,
        day: baseDay + 1,
        title: `${topic} 专项限时练习`,
        type: "practice",
        minutes: dailyMinutes,
        focusTopics: [topic],
        successCriteria: `完成至少 8 道 ${topic} 专项题，每道错题都要有订正说明。`,
        instructions: [
          "先做限时小套题，再统一核对答案。",
          "每个错误按“概念/建模/计算/书写/时间”进行分类。",
          "订正后无笔记重做一遍同题。",
        ],
        deliverable: "一份完成的限时小套题（含错因标签与完整订正）。",
        practiceItems: [
          `${topic} 推荐真题片段 2 题`,
          `${topic} 评分细则对照 1 题`,
          "同难度自选跟练题 3 题",
        ],
        linkedMaterialTitles: [],
        linkedMaterialChunkIds: [],
        linkedMaterialIds: [],
      },
      {
        taskId: `${topic.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-reflection-${baseDay + 2}`,
        day: baseDay + 2,
        title: `${topic} 错因复盘与防错`,
        type: "reflection",
        minutes: 20,
        focusTopics: [topic],
        successCriteria: "写出短反思：错因是什么、下次如何避免、用什么指标验证改进。",
        instructions: [
          "回看订正卡和练习中的错因标签。",
          "选择一个重复错误，写成一句“防错规则”。",
          "定义下次验证指标（得分或正确率）。",
        ],
        deliverable: "一段简短复盘 + 1 条可量化防错规则。",
        practiceItems: [`${topic} 无笔记重做 1 题。`],
        linkedMaterialTitles: [],
        linkedMaterialChunkIds: [],
        linkedMaterialIds: [],
      },
    ];
  });

  return {
    title: `${exam.subject || "IB"} 两周补弱提升计划`,
    horizonDays,
    dailyMinutes,
    goals: weaknesses.slice(0, 3).map((item) => `降低 ${item.topic} 重复失误率`),
    strategicOverview: buildFallbackStrategicOverview(exam, weaknesses, profile),
    planTable: buildFallbackPlanTable(exam, weaknesses, profile),
    tasks,
    checkpoints: [
      {
        day: 4,
        title: "第一检查点",
        metric: "无笔记重做 2 道此前错题。",
      },
      {
        day: 9,
        title: "中期检查点",
        metric: "完成 1 套限时小练，对比错因是否收敛。",
      },
      {
        day: 14,
        title: "结项检查点",
        metric: "验证核心弱项是否仍出现重复失误。",
      },
    ],
    coachStrategy: {
      tone: "支持型",
      reminderStyle: "每日提醒",
      monitoringFocus: [
        "是否按时完成专项练习",
        "重复错误是否下降",
        "时间管理是否改善",
      ],
    },
  };
}

function buildStructuredFallbackTask(
  day: number,
  type: StudyTaskType,
  topicLabel: string,
  dailyMinutes: number,
  secondaryTopic = ""
): StudyPlanTask {
  const compactTopic = topicLabel || "核心弱项";
  const taskId = `${compactTopic.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")}-${type}-${day}`;
  const focusTopics = uniqueStrings([compactTopic, secondaryTopic].filter(Boolean), 3);

  if (type === "review") {
    return {
      taskId,
      day,
      title: `${compactTopic} 方法复盘`,
      type,
      minutes: dailyMinutes,
      focusTopics,
      successCriteria: `把 ${compactTopic} 的核心步骤梳理成一张方法卡，并明确 3 个高频失误点。`,
      instructions: [
        `先回看本次试卷里涉及 ${compactTopic} 的错题，圈出第一处失分步骤。`,
        `不用看答案，重新写一遍 ${compactTopic} 的标准解题路径。`,
        "对照老师批注或评分依据，把方法卡补全成“触发词-步骤-检查点”的结构。",
      ],
      deliverable: `${compactTopic} 方法卡 1 张 + 3 条防错提醒。`,
      practiceItems: [`回看上传试卷中与 ${compactTopic} 相关的原题`, `${compactTopic} 方法卡复述 1 次`],
      linkedMaterialTitles: [],
      linkedMaterialChunkIds: [],
      linkedMaterialIds: [],
    };
  }

  if (type === "practice") {
    return {
      taskId,
      day,
      title: `${compactTopic} 定向练习`,
      type,
      minutes: dailyMinutes,
      focusTopics,
      successCriteria: `完成 2-3 道 ${compactTopic} 对口题，并把每一道错因写清楚。`,
      instructions: [
        `优先做系统绑定的 ${compactTopic} 练习包，严格限时。`,
        "做完后立刻对照评分依据，标注每道题的失分原因。",
        "把错题再无笔记重做一次，确认步骤真的纠正了。",
      ],
      deliverable: `${compactTopic} 练习记录 + 完整订正 + 1 次无笔记重做结果。`,
      practiceItems: [`${compactTopic} 练习包 1 份`, `${compactTopic} 对口评分片段 1 份`],
      linkedMaterialTitles: [],
      linkedMaterialChunkIds: [],
      linkedMaterialIds: [],
    };
  }

  if (type === "reflection") {
    return {
      taskId,
      day,
      title: `${compactTopic} 错因复盘`,
      type,
      minutes: Math.max(20, Math.round(dailyMinutes * 0.55)),
      focusTopics,
      successCriteria: `写出重复错因、触发场景和下次答题前的检查动作。`,
      instructions: [
        `回看今天 ${compactTopic} 的错题与订正，找出最容易重复的 1 类错误。`,
        "把这类错误写成“我一看到什么题型，就先检查什么”的提醒句。",
        "给下一次练习设一个可量化的目标，比如正确率、失分点数量或限时完成度。",
      ],
      deliverable: `${compactTopic} 复盘短记 1 份 + 1 条可执行防错规则。`,
      practiceItems: [`${compactTopic} 错因标签整理`, `${compactTopic} 无笔记口述步骤 1 次`],
      linkedMaterialTitles: [],
      linkedMaterialChunkIds: [],
      linkedMaterialIds: [],
    };
  }

  return {
    taskId,
    day,
    title: secondaryTopic ? `${compactTopic} × ${secondaryTopic} 综合校准` : `${compactTopic} 综合校准`,
    type,
    minutes: dailyMinutes,
    focusTopics,
    successCriteria: "把前面几天的订正方法串起来，在一组综合题里稳定执行。",
    instructions: [
      "先按完整考试节奏完成一组综合题，不中途翻答案。",
      "做完后逐题检查：失分是概念、建模、计算还是书写。",
      "把仍然反复出现的问题重新并入后续练习清单。",
    ],
    deliverable: "1 份综合练习结果 + 1 份阶段性纠偏清单。",
    practiceItems: [
      `${compactTopic} 综合题 1 组`,
      secondaryTopic ? `${secondaryTopic} 交叉题 1 组` : `${compactTopic} 复做题 1 组`,
    ],
    linkedMaterialTitles: [],
    linkedMaterialChunkIds: [],
    linkedMaterialIds: [],
  };
}

function buildStructuredFallbackPlan(
  exam: StudyExamRecord,
  weaknesses: StudyWeakness[]
): StudyLearningPlan {
  const profile = exam.planningProfile;
  const topTopics = weaknesses.slice(0, 3).map((item) => item.topic).filter(Boolean);
  const primary = topTopics[0] || "核心弱项";
  const secondary = topTopics[1] || primary;
  const tertiary = topTopics[2] || secondary;
  const dailyMinutes = topTopics.length >= 3 ? 45 : 40;
  const horizonDays = 14;
  const tasks = [
    buildStructuredFallbackTask(1, "review", primary, dailyMinutes),
    buildStructuredFallbackTask(2, "practice", primary, dailyMinutes),
    buildStructuredFallbackTask(3, "reflection", primary, dailyMinutes),
    buildStructuredFallbackTask(4, "revision", primary, dailyMinutes, secondary),
    buildStructuredFallbackTask(5, "review", secondary, dailyMinutes),
    buildStructuredFallbackTask(6, "practice", secondary, dailyMinutes),
    buildStructuredFallbackTask(7, "reflection", secondary, dailyMinutes),
    buildStructuredFallbackTask(8, "revision", secondary, dailyMinutes, tertiary),
    buildStructuredFallbackTask(9, "review", tertiary, dailyMinutes),
    buildStructuredFallbackTask(10, "practice", tertiary, dailyMinutes),
    buildStructuredFallbackTask(11, "reflection", tertiary, dailyMinutes),
    buildStructuredFallbackTask(12, "revision", tertiary, dailyMinutes, primary),
    buildStructuredFallbackTask(13, "practice", `${primary} + ${secondary}`, dailyMinutes),
    buildStructuredFallbackTask(14, "revision", `${primary} + ${tertiary}`, dailyMinutes),
  ];

  return {
    title: `${exam.subject || "IB"} 两周补弱提升计划`,
    horizonDays,
    dailyMinutes,
    goals: weaknesses.slice(0, 3).map((item) => `降低 ${item.topic} 的重复失误率`),
    strategicOverview: buildFallbackStrategicOverview(exam, weaknesses, profile),
    planTable: buildFallbackPlanTable(exam, weaknesses, profile),
    tasks,
    checkpoints: [
      {
        day: 4,
        title: "第一阶段检查",
        metric: `确认 ${primary} 是否已经形成可复述的方法卡与订正模板。`,
      },
      {
        day: 8,
        title: "第二阶段检查",
        metric: `比较 ${secondary} 练习前后失分点数量，确认是否明显收敛。`,
      },
      {
        day: 12,
        title: "第三阶段检查",
        metric: `检查 ${tertiary} 是否仍然存在重复错因，并补充最后一次专项修正。`,
      },
      {
        day: 14,
        title: "结项验证",
        metric: "完成一次综合回测，验证核心弱项是否真正收敛。",
      },
    ],
    coachStrategy: {
      tone: "支持型",
      reminderStyle: "每日提醒",
      monitoringFocus: [
        "是否按顺序完成每日任务",
        "错因是否从“重复出现”变为“偶发出现”",
        "订正后能否做到无笔记重做",
      ],
    },
  };
}

function severityWeight(severity: StudyWeaknessSeverity): number {
  switch (severity) {
    case "high":
      return 3;
    case "low":
      return 1;
    default:
      return 2;
  }
}

function derivePlanCadenceFromWeaknesses(weaknesses: StudyWeakness[]): {
  horizonDays: number;
  dailyMinutes: number;
} {
  const weightedScore = weaknesses.reduce((sum, item) => sum + severityWeight(item.severity), 0);
  const highCount = weaknesses.filter((item) => item.severity === "high").length;

  if (highCount >= 2 || weightedScore >= 8) {
    return {
      horizonDays: 21,
      dailyMinutes: 55,
    };
  }

  if (highCount >= 1 || weightedScore >= 5) {
    return {
      horizonDays: 14,
      dailyMinutes: 45,
    };
  }

  if (weightedScore >= 3) {
    return {
      horizonDays: 10,
      dailyMinutes: 35,
    };
  }

  return {
    horizonDays: 7,
    dailyMinutes: 25,
  };
}

function buildWeaknessRotation(weaknesses: StudyWeakness[]): string[] {
  return weaknesses.flatMap((item) =>
    Array.from({ length: severityWeight(item.severity) }, () => item.topic).filter(Boolean)
  );
}

function buildAdaptiveFallbackPlan(
  exam: StudyExamRecord,
  weaknesses: StudyWeakness[]
): StudyLearningPlan {
  const profile = exam.planningProfile;
  const cadence = derivePlanCadenceFromWeaknesses(weaknesses);
  const horizonDays = cadence.horizonDays;
  const dailyMinutes = cadence.dailyMinutes;
  const rotation = buildWeaknessRotation(weaknesses);
  const fallbackTopics = weaknesses.slice(0, 3).map((item) => item.topic).filter(Boolean);
  const topicPool = rotation.length > 0 ? rotation : fallbackTopics.length > 0 ? fallbackTopics : ["核心弱项"];
  const taskCycle: StudyTaskType[] = ["review", "practice", "reflection", "revision"];
  const tasks = Array.from({ length: horizonDays }, (_, index) => {
    const topic = topicPool[index % topicPool.length] || "核心弱项";
    const secondaryTopic = topicPool[(index + 1) % topicPool.length] || topic;

    return buildStructuredFallbackTask(
      index + 1,
      taskCycle[index % taskCycle.length],
      topic,
      dailyMinutes,
      secondaryTopic !== topic ? secondaryTopic : ""
    );
  });
  const checkpointDays = uniqueStrings(
    [
      Math.max(2, Math.round(horizonDays * 0.25)).toString(),
      Math.max(3, Math.round(horizonDays * 0.5)).toString(),
      Math.max(4, Math.round(horizonDays * 0.75)).toString(),
      horizonDays.toString(),
    ]
  ).map((item) => Number(item));

  return {
    title: `${exam.subject || "IB"} 补弱提升计划`,
    horizonDays,
    dailyMinutes,
    goals: weaknesses.slice(0, 3).map((item) => `降低 ${item.topic} 的重复失误率`),
    strategicOverview: buildFallbackStrategicOverview(exam, weaknesses, profile),
    planTable: buildFallbackPlanTable(exam, weaknesses, profile),
    tasks,
    checkpoints: checkpointDays.map((day, index) => ({
      day,
      title: index === checkpointDays.length - 1 ? "结项验证" : `阶段检查 ${index + 1}`,
      metric:
        index === checkpointDays.length - 1
          ? "完成一次综合回测，确认核心弱项是否真正收敛。"
          : "检查当前阶段的错因是否减少，并确认下一阶段主攻弱项。",
    })),
    coachStrategy: {
      tone: "支持型",
      reminderStyle: horizonDays >= 14 ? "每日提醒" : "隔日提醒",
      monitoringFocus: [
        "是否按顺序完成每日任务",
        "重复错因是否持续下降",
        "订正后能否做到无笔记重做",
      ],
    },
  };
}

function buildFallbackQueries(exam: StudyExamRecord, weaknesses: StudyWeakness[]): string[] {
  return weaknesses.slice(0, 4).map((item) => `${exam.subject} IB ${item.topic} 真题 讲解 评分标准`);
}

function buildFallbackBundle(exam: StudyExamRecord): StudyAnalysisBundle {
  const weaknesses = buildFallbackWeaknesses(exam);
  const scoreSummary = reconcileScoreSummaryWithWeaknesses(buildScoreSummary(exam), weaknesses);
  const plan = buildAdaptiveFallbackPlan(exam, weaknesses);
  const recommendedQueries = buildFallbackQueries(exam, weaknesses);

  return {
    overview:
      weaknesses.length > 0
        ? `这份试卷显示当前主要压力点在 ${weaknesses
            .slice(0, 3)
            .map((item) => item.topic)
            .join("、")}。`
        : "当前卷面证据仍不足，建议补充更结构化的作答与批注信息后再做精确诊断。",
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
  const planningProfileBlock = JSON.stringify(exam.planningProfile, null, 2);
  const questionBlock = exam.questions
    .slice(0, 20)
    .map((question) => {
      const lines = [
        `Question ${question.questionNumber}`,
        `Stem: ${truncate(question.stem, 500) || "N/A"}`,
        `Student answer: ${truncate(question.studentAnswer, 700) || "N/A"}`,
        `Correct answer: ${truncate(question.correctAnswer, 240) || "N/A"}`,
        `Score: ${question.score ?? "N/A"} / ${question.maxScore ?? "N/A"}`,
        `Knowledge points: ${question.knowledgePoints.join(", ") || "N/A"}`,
        `Teacher comment: ${truncate(question.teacherComment, 500) || "N/A"}`,
        `Marked wrong: ${inferQuestionIsWrong(question) ? "yes" : "no"}`,
      ];
      return lines.join("\n");
    })
    .join("\n\n");
  const fallbackReference = {
    scoreSummary: fallback.scoreSummary,
    weaknesses: fallback.weaknesses,
    planGoals: fallback.plan.goals,
    strategicOverview: fallback.plan.strategicOverview,
  };

  return [
    "请分析以下 IB 试卷证据，仅返回合法 JSON。",
    "不要使用 Markdown 包裹 JSON。",
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
            topic: "函数",
            skill: "函数变换与图像理解",
            severity: "high",
            reason: "该能力点出现重复失误。",
            evidence: ["证据 1"],
            recommendedFocus: "先复盘方法，再做针对题订正。",
            confidence: 0.82,
          },
        ],
        plan: {
          title: "两周补弱计划",
          horizonDays: 14,
          dailyMinutes: 45,
          goals: ["降低函数题重复失误率"],
          strategicOverview: "先集中补弱，再联动长期规划。",
          planTable: [
            {
              category: "IB Subject | Standardized Test | Major Direction | Activity | AP",
              item: "示例项",
              currentState: "当前状态说明",
              targetState: "目标状态说明",
              nextAction: "下一步动作",
              cadence: "每周",
              priority: "high | medium | low",
            },
          ],
          tasks: [
            {
              taskId: "string",
              day: 1,
              title: "函数专项练习",
              type: "review",
              minutes: 45,
              focusTopics: ["函数"],
              successCriteria: "完成任务并记录结果证据。",
              instructions: [
                "先限时作答。",
                "再对照评分细则并标注错因。",
              ],
              deliverable: "订正记录",
              practiceItems: ["specific question/excerpt/set to complete"],
              linkedMaterialTitles: ["string"],
              linkedMaterialChunkIds: ["string"],
              linkedMaterialIds: ["string"],
            },
          ],
          checkpoints: [
            {
              day: 4,
              title: "第一检查点",
              metric: "无笔记重做错题 2 道",
            },
          ],
          coachStrategy: {
            tone: "支持型",
            reminderStyle: "每日提醒",
            monitoringFocus: ["完成率", "错因收敛", "时间管理"],
          },
        },
        recommendedQueries: ["IB 函数 真题 评分标准"],
      },
      null,
      2
    ),
    "",
    "约束条件：",
    "- 只使用试卷证据，不要编造未出现的事实。",
    "- 规划画像只能作为协同信息，不能单独当作弱项证据。",
    "- 聚焦弱项诊断，不要输出泛泛而谈的辅导总结。",
    "- weaknesses 最多 4 项。",
    "- 任务必须具体、可执行、可量化，学生看完就知道下一步怎么做。",
    "- 每个任务尽量包含 instructions、deliverable、practiceItems、linkedMaterialTitles。",
    "- 若能定位到资料，请补充 linkedMaterialChunkIds / linkedMaterialIds。",
    "- 优先推荐“具体题目片段 + 对应评分细则”，而不是笼统整卷复习。",
    "- 当存在规划画像信息时，planTable 需兼顾短期补弱与中长期目标协同。",
    "- 若用户提及 IELTS/TOEFL/SAT、专业、活动、AP 目标，请在 planTable 与 strategicOverview 中体现。",
    "- 所有面向学生的文本字段（overview、reason、recommendedFocus、plan、recommendations）必须使用简体中文。",
    "",
    `Exam title: ${exam.title}`,
    `Subject: ${exam.subject}`,
    `Grade: ${exam.grade || "N/A"}`,
    `Exam date: ${exam.examDate}`,
    `Raw text excerpt: ${truncate(exam.rawText, 2500) || "N/A"}`,
    "",
    "Planning profile:",
    planningProfileBlock,
    "",
    "IB structured context:",
    truncate(ibKnowledgeContext, 2500) || "No IB structured context is available yet.",
    "",
    "Structured questions:",
    questionBlock || "N/A",
    "",
    "Fallback reference:",
    JSON.stringify(fallbackReference, null, 2),
  ].join("\n");
}

function extractJson(text: string): GenericDocument | null {
  const trimmed = text.trim();
  const candidates: string[] = [];
  const seen = new Set<string>();

  const pushCandidate = (value: string) => {
    const candidate = value.trim();
    if (!candidate || seen.has(candidate)) {
      return;
    }
    seen.add(candidate);
    candidates.push(candidate);
  };

  const stripJsonCodeFence = (value: string): string => {
    const block = value.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    return block?.[1]?.trim() || value;
  };

  const collectBalancedJsonObjects = (value: string): string[] => {
    const output: string[] = [];
    let inString = false;
    let escaped = false;
    let depth = 0;
    let start = -1;

    for (let index = 0; index < value.length; index += 1) {
      const char = value[index];

      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === "\\") {
        escaped = true;
        continue;
      }

      if (char === '"') {
        inString = !inString;
        continue;
      }

      if (inString) {
        continue;
      }

      if (char === "{") {
        if (depth === 0) {
          start = index;
        }
        depth += 1;
        continue;
      }

      if (char === "}") {
        if (depth > 0) {
          depth -= 1;
          if (depth === 0 && start >= 0) {
            output.push(value.slice(start, index + 1));
            start = -1;
          }
        }
      }
    }

    return output;
  };

  pushCandidate(trimmed);
  pushCandidate(stripJsonCodeFence(trimmed));
  const fencedJsonMatches = trimmed.match(/```(?:json)?\s*[\s\S]*?\s*```/gi) || [];
  for (const block of fencedJsonMatches) {
    pushCandidate(stripJsonCodeFence(block));
  }
  for (const candidate of collectBalancedJsonObjects(trimmed)) {
    pushCandidate(candidate);
  }

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as GenericDocument;
    } catch {
      try {
        const relaxed = candidate.replace(/,\s*([}\]])/g, "$1");
        return JSON.parse(relaxed) as GenericDocument;
      } catch {
        // Continue trying remaining candidates.
      }
    }
  }

  return null;
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
        reason: asString(source.reason) || "该能力点出现重复失误，说明方法或应用仍不稳定。",
        evidence: asStringArray(source.evidence).slice(0, 3),
        recommendedFocus:
          asString(source.recommendedFocus) || `先复盘 ${topic} 的核心方法，再完成针对性订正练习。`,
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
        successCriteria: asString(source.successCriteria) || "完成任务并记录结果证据。",
        instructions: asStringArray(source.instructions).slice(0, 5),
        deliverable: asString(source.deliverable),
        practiceItems: asStringArray(source.practiceItems).slice(0, 6),
        linkedMaterialTitles: asStringArray(source.linkedMaterialTitles).slice(0, 4),
        linkedMaterialChunkIds: asStringArray(source.linkedMaterialChunkIds).slice(0, 6),
        linkedMaterialIds: asStringArray(source.linkedMaterialIds).slice(0, 6),
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

function sanitizePlanTable(value: unknown, fallback: StudyPlanTableRow[]): StudyPlanTableRow[] {
  if (!Array.isArray(value) || value.length === 0) {
    return fallback;
  }

  const normalized = value
    .map((item) => {
      const source = (item || {}) as GenericDocument;
      const category = asString(source.category);
      const itemLabel = asString(source.item);
      const nextAction = asString(source.nextAction);

      if (!category || !itemLabel || !nextAction) {
        return null;
      }

      return {
        category,
        item: itemLabel,
        currentState: asString(source.currentState) || "当前状态还需要进一步明确。",
        targetState: asString(source.targetState) || "请补充更清晰、可量化的目标状态。",
        nextAction,
        cadence: asString(source.cadence) || "每周",
        priority: normalizeSeverity(source.priority),
      } satisfies StudyPlanTableRow;
    })
    .filter((item): item is StudyPlanTableRow => Boolean(item));

  return normalized.length > 0 ? normalized.slice(0, 12) : fallback;
}

function normalizePlanTasks(
  tasks: StudyPlanTask[],
  fallbackTasks: StudyPlanTask[],
  horizonDays: number
): StudyPlanTask[] {
  const ordered = [...tasks].sort((left, right) => left.day - right.day);
  const targetCount = Math.min(
    Math.max(horizonDays, 1),
    Math.max(ordered.length, Math.min(fallbackTasks.length, Math.max(horizonDays, 1)))
  );
  const merged: StudyPlanTask[] = [];
  const seen = new Set<string>();

  const pushUnique = (task: StudyPlanTask) => {
    const signature = [
      task.type,
      task.title.trim().toLowerCase(),
      task.focusTopics.map((item) => item.trim().toLowerCase()).join("|"),
    ].join("::");
    if (seen.has(signature)) {
      return;
    }
    seen.add(signature);
    merged.push({
      ...task,
      linkedMaterialTitles: task.linkedMaterialTitles || [],
      linkedMaterialChunkIds: task.linkedMaterialChunkIds || [],
      linkedMaterialIds: task.linkedMaterialIds || [],
    });
  };

  for (const task of ordered) {
    pushUnique(task);
  }
  for (const task of fallbackTasks) {
    if (merged.length >= targetCount) {
      break;
    }
    pushUnique(task);
  }

  return merged.slice(0, targetCount).map((task, index) => ({
    ...task,
    day: index + 1,
  }));
}

function normalizePlanCheckpoints(checkpoints: StudyCheckpoint[], horizonDays: number): StudyCheckpoint[] {
  return checkpoints
    .map((checkpoint) => ({
      ...checkpoint,
      day: Math.max(1, Math.min(horizonDays, checkpoint.day || 1)),
    }))
    .sort((left, right) => left.day - right.day);
}

function sanitizePlan(value: unknown, fallback: StudyLearningPlan): StudyLearningPlan {
  const source = (value || {}) as GenericDocument;
  const requestedHorizon = asNumber(source.horizonDays) || 0;
  const horizonDays = Math.max(requestedHorizon, fallback.horizonDays);
  const sanitizedTasks = sanitizeTasks(source.tasks, fallback.tasks);
  const requestedDailyMinutes = asNumber(source.dailyMinutes) || 0;

  return {
    title: asString(source.title) || fallback.title,
    horizonDays,
    dailyMinutes: Math.max(requestedDailyMinutes, fallback.dailyMinutes),
    goals: asStringArray(source.goals).length > 0 ? asStringArray(source.goals) : fallback.goals,
    strategicOverview: asString(source.strategicOverview) || fallback.strategicOverview,
    planTable: sanitizePlanTable(source.planTable, fallback.planTable),
    tasks: normalizePlanTasks(sanitizedTasks, fallback.tasks, horizonDays),
    checkpoints: normalizePlanCheckpoints(sanitizeCheckpoints(source.checkpoints, fallback.checkpoints), horizonDays),
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
  const modelScoredPoints = asNumber(source.scoredPoints);
  const modelTotalPoints = asNumber(source.totalPoints);
  const canUseModelScore = fallback.scoredPoints !== null && fallback.totalPoints !== null;
  const scoredPoints = fallback.scoredPoints !== null
    ? fallback.scoredPoints
    : canUseModelScore
      ? modelScoredPoints
      : null;
  const totalPoints = fallback.totalPoints !== null
    ? fallback.totalPoints
    : canUseModelScore
      ? modelTotalPoints
      : null;
  const accuracyRate =
    totalPoints !== null && scoredPoints !== null && totalPoints > 0
      ? Number(Math.max(0, Math.min(1, scoredPoints / totalPoints)).toFixed(2))
      : fallback.accuracyRate;

  return {
    totalQuestions: fallback.totalQuestions,
    wrongQuestions: fallback.wrongQuestions,
    scoredPoints,
    totalPoints,
    accuracyRate,
  };
}

function reconcileScoreSummaryWithWeaknesses(
  scoreSummary: StudyScoreSummary,
  weaknesses: StudyWeakness[]
): StudyScoreSummary {
  const weaknessCount = weaknesses.length;
  const wrongQuestions = Math.max(scoreSummary.wrongQuestions || 0, weaknessCount);
  const hasReliablePointScore = scoreSummary.scoredPoints !== null && scoreSummary.totalPoints !== null;

  return {
    ...scoreSummary,
    wrongQuestions,
    accuracyRate: hasReliablePointScore ? scoreSummary.accuracyRate : wrongQuestions > 0 ? null : scoreSummary.accuracyRate,
  };
}

function sanitizeQueries(value: unknown, fallback: string[]): string[] {
  const normalized = asStringArray(value);
  return normalized.length > 0 ? normalized.slice(0, 6) : fallback;
}

export interface StudyKnowledgeCaptureSummary {
  enabled: boolean;
  candidates: number;
  captured: number;
  skipped: number;
  vectorized: number;
}

export interface StudyAutoLearnCleanupSummary {
  questionBankDeleted: number;
  materialsDeleted: number;
  chunksDeleted: number;
  vectorDeleteRequested: number;
}

function shouldAutoLearnQuestions(): boolean {
  return process.env.STUDY_ASSISTANT_AUTO_LEARN_QUESTIONS === "true";
}

function shouldIncludeTeacherCommentsInKnowledgeBase(): boolean {
  return process.env.STUDY_ASSISTANT_AUTO_LEARN_INCLUDE_TEACHER_COMMENTS === "true";
}

function getAutoLearnLimit(): number {
  const value = Number(process.env.STUDY_ASSISTANT_AUTO_LEARN_MAX_PER_EXAM || "3");
  return Number.isFinite(value) && value > 0 ? Math.min(value, 20) : 3;
}

function approximateTokenCount(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

function normalizeForStableHash(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function hasReliableStandardAnswer(question: StudyExamQuestion): boolean {
  const answer = question.correctAnswer.trim();
  if (answer.length < 8) {
    return false;
  }

  return !/(not visible|not reliable|unknown|n\/a|empty string|if visible)/i.test(answer);
}

function scoreKnowledgeCandidate(question: StudyExamQuestion): number {
  let score = 0;
  if (question.stem.trim().length >= 40) {
    score += 2;
  }
  if (hasReliableStandardAnswer(question)) {
    score += 4;
  }
  if (question.maxScore !== null && question.maxScore > 0) {
    score += 1;
  }
  if (question.knowledgePoints.length > 0) {
    score += 1;
  }
  if (question.teacherComment.trim().length > 20) {
    score += 1;
  }

  return score;
}

function buildVerifiedQuestionContent(
  exam: StudyExamRecord,
  question: StudyExamQuestion
): string {
  const sections = [
    `Subject: ${exam.subject || "IB"}`,
    `Level: ${exam.grade || "BOTH"}`,
    `Question: ${question.questionNumber}`,
    question.knowledgePoints.length > 0 ? `Knowledge points: ${question.knowledgePoints.join(", ")}` : "",
    question.maxScore !== null ? `Max score: ${question.maxScore}` : "",
    "",
    "Question stem:",
    question.stem.trim(),
    "",
    "Standard answer / marking notes:",
    question.correctAnswer.trim(),
  ];

  if (shouldIncludeTeacherCommentsInKnowledgeBase() && question.teacherComment.trim()) {
    sections.push("", "Teacher correction note:", question.teacherComment.trim());
  }

  return sections.filter((item) => item !== "").join("\n");
}

function buildQuestionKnowledgeIds(question: StudyExamQuestion): number[] {
  return question.knowledgePoints
    .map((item) => Number(item))
    .filter((item) => Number.isInteger(item) && item > 0);
}

function buildLearnedQuestionIds(
  exam: StudyExamRecord,
  question: StudyExamQuestion,
  subjectCode: string
): { questionHash: string; materialId: string; vectorId: string } {
  const hash = createHash("sha256")
    .update(
      [
        subjectCode,
        exam.subject,
        exam.grade,
        normalizeForStableHash(question.stem),
        normalizeForStableHash(question.correctAnswer),
      ].join("|")
    )
    .digest("hex");

  return {
    questionHash: hash,
    materialId: `learned_question_${hash.slice(0, 32)}`,
    vectorId: `ibq_${hash.slice(0, 48)}`,
  };
}

export async function captureVerifiedQuestionsForKnowledgeBase(
  db: AnyDb,
  examInput: GenericDocument
): Promise<StudyKnowledgeCaptureSummary> {
  const exam = normalizeExamRecord(examInput);
  const summary: StudyKnowledgeCaptureSummary = {
    enabled: shouldAutoLearnQuestions(),
    candidates: exam.questions.length,
    captured: 0,
    skipped: 0,
    vectorized: 0,
  };

  if (!summary.enabled || exam.questions.length === 0) {
    return summary;
  }

  const subject = await findBestIbSubject(db, exam.subject);
  const subjectCode = asString(subject?.code);
  if (!subjectCode) {
    summary.skipped = exam.questions.length;
    return summary;
  }

  const subjectId = asNumber(subject?.subjectId) || asNumber(subject?.id) || 0;
  const normalizedLevel = exam.grade.toUpperCase();
  const hlSl = normalizedLevel === "HL" || normalizedLevel === "SL" ? normalizedLevel : "BOTH";
  const now = new Date().toISOString();
  const sourceExamId = examInput._id ? String(examInput._id) : "";
  const sourceUserId = asString(examInput.userId);
  const sourceUsername = asString(examInput.username);
  const candidates = exam.questions
    .map((question) => ({
      question,
      qualityScore: scoreKnowledgeCandidate(question),
    }))
    .filter((item) => item.qualityScore >= 6)
    .slice(0, getAutoLearnLimit());

  summary.skipped = exam.questions.length - candidates.length;

  for (const { question, qualityScore } of candidates) {
    const content = buildVerifiedQuestionContent(exam, question);
    const tokenCount = approximateTokenCount(content);
    const { questionHash, materialId, vectorId } = buildLearnedQuestionIds(exam, question, subjectCode);
    const topics = uniqueStrings(question.knowledgePoints, 8);
    const knowledgePointIds = buildQuestionKnowledgeIds(question);
    const title = `${exam.subject || "IB"} verified question ${question.questionNumber}`;

    await db.collection(STUDY_QUESTION_BANK_COLLECTION).updateOne(
      { questionHash },
      {
        $set: {
          questionHash,
          materialId,
          vectorId,
          title,
          subject: exam.subject,
          subjectId,
          subjectCode,
          hlSl,
          questionNumber: question.questionNumber,
          stem: question.stem,
          correctAnswer: question.correctAnswer,
          knowledgePoints: question.knowledgePoints,
          maxScore: question.maxScore,
          qualityScore,
          reviewStatus: "pending_review",
          origin: STUDY_AUTO_LEARN_ORIGIN,
          originLabel: "Uploaded exam auto-learn candidate",
          sourceKind: STUDY_AUTO_LEARN_SOURCE_KIND,
          sourceExamId,
          sourceUserId,
          sourceUsername,
          updatedAt: now,
        },
        $setOnInsert: {
          createdAt: now,
        },
      },
      { upsert: true }
    );

    summary.captured += 1;
  }

  return summary;
}

function buildQuestionBankContent(item: GenericDocument): string {
  const knowledgePoints = asStringArray(item.knowledgePoints);
  const maxScore = asNumber(item.maxScore);
  const sections = [
    `Subject: ${asString(item.subject) || "IB"}`,
    `Level: ${asString(item.hlSl) || "BOTH"}`,
    `Question: ${asString(item.questionNumber) || "N/A"}`,
    knowledgePoints.length > 0 ? `Knowledge points: ${knowledgePoints.join(", ")}` : "",
    maxScore !== null ? `Max score: ${maxScore}` : "",
    "",
    "Question stem:",
    asString(item.stem),
    "",
    "Standard answer / marking notes:",
    asString(item.correctAnswer),
  ];

  return sections.filter((section) => section !== "").join("\n");
}

export async function approveQuestionBankItem(
  db: AnyDb,
  item: GenericDocument,
  reviewerId: string
): Promise<{ vectorized: boolean }> {
  const now = new Date().toISOString();
  const materialId = asString(item.materialId);
  const vectorId = asString(item.vectorId);
  const subjectCode = asString(item.subjectCode);
  const title = asString(item.title) || "Verified question";
  const content = buildQuestionBankContent(item);
  const tokenCount = approximateTokenCount(content);
  const subjectId = asNumber(item.subjectId) || 0;
  const hlSl = asString(item.hlSl) || "BOTH";
  const knowledgePointNames = asStringArray(item.knowledgePoints);
  const knowledgePointIds = knowledgePointNames
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value > 0);

  if (!materialId || !vectorId || !subjectCode || !content.includes("Question stem:")) {
    throw new Error("Question bank item is missing required publication fields.");
  }

  await db.collection(IB_MATERIALS_COLLECTION).updateOne(
    { materialId },
    {
      $set: {
        materialId,
        subjectId,
        subjectCode,
        type: "VERIFIED_QUESTION",
        title,
        titleEn: title,
        titleCn: title,
        hlSl,
        difficulty: 3,
        year: null,
        paper: null,
        timezone: null,
        fileUrl: "",
        fileType: "TEXT",
        totalTokens: tokenCount,
        sourceName: "approved_user_question",
        sourceUrl: "",
        tags: ["approved", "verified-question", "auto-learned"],
        topics: knowledgePointNames,
        reviewStatus: "approved",
        origin: STUDY_AUTO_LEARN_ORIGIN,
        originLabel: "Uploaded exam auto-learn approved question",
        sourceKind: STUDY_AUTO_LEARN_SOURCE_KIND,
        sourceQuestionHash: asString(item.questionHash),
        sourceExamId: asString(item.sourceExamId),
        updatedAt: now,
      },
      $setOnInsert: {
        createdAt: now,
      },
    },
    { upsert: true }
  );

  await db.collection(IB_MATERIAL_CHUNKS_COLLECTION).updateOne(
    { milvusVectorId: vectorId },
    {
      $set: {
        materialId,
        subjectId,
        subjectCode,
        title,
        materialType: "VERIFIED_QUESTION",
        hlSl,
        difficulty: 3,
        year: null,
        paper: null,
        timezone: null,
        knowledgePointIds,
        knowledgePointNames,
        tags: ["approved", "verified-question", "auto-learned"],
        topics: knowledgePointNames,
        chunkIndex: 0,
        content,
        startPos: 0,
        endPos: content.length,
        tokenCount,
        milvusVectorId: vectorId,
        sourceExamId: asString(item.sourceExamId),
        sourceQuestionHash: asString(item.questionHash),
        reviewStatus: "approved",
        origin: STUDY_AUTO_LEARN_ORIGIN,
        originLabel: "Uploaded exam auto-learn approved question",
        sourceKind: STUDY_AUTO_LEARN_SOURCE_KIND,
        reviewerId,
        reviewedAt: now,
        updatedAt: now,
      },
      $setOnInsert: {
        createdAt: now,
      },
    },
    { upsert: true }
  );

  let vectorized = false;
  try {
    vectorized = await upsertZillizTextVector({
      id: vectorId,
      content,
      subjectId,
      subjectCode,
      materialType: "VERIFIED_QUESTION",
      hlSl,
      difficulty: 3,
      chunkTokenCount: tokenCount,
      knowledgePointIds,
    });
  } catch (error) {
    console.warn("[study-knowledge] approved question vector upsert skipped", {
      vectorId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  await db.collection(STUDY_QUESTION_BANK_COLLECTION).updateOne(
    { questionHash: asString(item.questionHash) },
    {
      $set: {
        reviewStatus: "approved",
        reviewerId,
        reviewedAt: now,
        vectorized,
        updatedAt: now,
      },
    }
  );

  return { vectorized };
}

export async function rejectQuestionBankItem(
  db: AnyDb,
  item: GenericDocument,
  reviewerId: string,
  reason: string
): Promise<void> {
  const now = new Date().toISOString();
  const vectorId = asString(item.vectorId);
  const materialId = asString(item.materialId);

  if (vectorId) {
    await deleteZillizVectors([vectorId]).catch((error) => {
      console.warn("[study-knowledge] rejected question vector delete skipped", {
        vectorId,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }

  await Promise.all([
    vectorId
      ? db.collection(IB_MATERIAL_CHUNKS_COLLECTION).updateOne(
          { milvusVectorId: vectorId },
          {
            $set: {
              reviewStatus: "rejected",
              reviewerId,
              reviewedAt: now,
              updatedAt: now,
            },
          }
        )
      : Promise.resolve(),
    materialId
      ? db.collection(IB_MATERIALS_COLLECTION).updateOne(
          { materialId },
          {
            $set: {
              reviewStatus: "rejected",
              updatedAt: now,
            },
          }
        )
      : Promise.resolve(),
    db.collection(STUDY_QUESTION_BANK_COLLECTION).updateOne(
      { questionHash: asString(item.questionHash) },
      {
        $set: {
          reviewStatus: "rejected",
          reviewReason: reason,
          reviewerId,
          reviewedAt: now,
          vectorized: false,
          updatedAt: now,
        },
      }
    ),
  ]);
}

export async function moveQuestionBankItemToPendingReview(
  db: AnyDb,
  item: GenericDocument,
  reviewerId: string
): Promise<void> {
  const now = new Date().toISOString();
  const vectorId = asString(item.vectorId);
  const materialId = asString(item.materialId);

  if (vectorId) {
    await deleteZillizVectors([vectorId]).catch((error) => {
      console.warn("[study-knowledge] pending question vector delete skipped", {
        vectorId,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }

  await Promise.all([
    vectorId
      ? db.collection(IB_MATERIAL_CHUNKS_COLLECTION).updateOne(
          { milvusVectorId: vectorId },
          {
            $set: {
              reviewStatus: "pending_review",
              reviewerId,
              reviewedAt: now,
              updatedAt: now,
            },
          }
        )
      : Promise.resolve(),
    materialId
      ? db.collection(IB_MATERIALS_COLLECTION).updateOne(
          { materialId },
          {
            $set: {
              reviewStatus: "pending_review",
              updatedAt: now,
            },
          }
        )
      : Promise.resolve(),
    db.collection(STUDY_QUESTION_BANK_COLLECTION).updateOne(
      { questionHash: asString(item.questionHash) },
      {
        $set: {
          reviewStatus: "pending_review",
          reviewReason: "",
          reviewerId,
          reviewedAt: now,
          vectorized: false,
          updatedAt: now,
        },
      }
    ),
  ]);
}

function buildAutoLearnQuestionQuery(status?: string): GenericDocument {
  const query: GenericDocument = {
    $or: [
      { origin: STUDY_AUTO_LEARN_ORIGIN },
      { sourceKind: STUDY_AUTO_LEARN_SOURCE_KIND },
      { sourceName: "approved_user_question" },
      { tags: "auto-learned" },
    ],
  };

  if (status && status !== "all") {
    query.reviewStatus = status;
  }

  return query;
}

export async function cleanupAutoLearnedQuestionKnowledge(
  db: AnyDb,
  status = "all"
): Promise<StudyAutoLearnCleanupSummary> {
  const questionQuery = buildAutoLearnQuestionQuery(status);
  const questionItems = (await db
    .collection(STUDY_QUESTION_BANK_COLLECTION)
    .find(questionQuery)
    .project({ materialId: 1, vectorId: 1, questionHash: 1 })
    .toArray()) as GenericDocument[];
  const materialIds = uniqueStrings(questionItems.map((item) => asString(item.materialId)));
  const vectorIdsFromQuestions = uniqueStrings(questionItems.map((item) => asString(item.vectorId)));
  const chunkQuery: GenericDocument = {
    $or: [
      { origin: STUDY_AUTO_LEARN_ORIGIN },
      { sourceKind: STUDY_AUTO_LEARN_SOURCE_KIND },
      { materialId: { $in: materialIds } },
      { milvusVectorId: { $in: vectorIdsFromQuestions } },
      { tags: "auto-learned" },
    ],
  };
  const chunkItems = (await db
    .collection(IB_MATERIAL_CHUNKS_COLLECTION)
    .find(chunkQuery)
    .project({ materialId: 1, milvusVectorId: 1 })
    .toArray()) as GenericDocument[];
  const allMaterialIds = uniqueStrings([
    ...materialIds,
    ...chunkItems.map((item) => asString(item.materialId)),
  ]);
  const allVectorIds = uniqueStrings([
    ...vectorIdsFromQuestions,
    ...chunkItems.map((item) => asString(item.milvusVectorId)),
  ]);

  if (allVectorIds.length > 0) {
    await deleteZillizVectors(allVectorIds).catch((error) => {
      console.warn("[study-knowledge] auto-learn cleanup vector delete skipped", {
        count: allVectorIds.length,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }

  const [questionDelete, materialDelete, chunkDelete] = await Promise.all([
    db.collection(STUDY_QUESTION_BANK_COLLECTION).deleteMany(questionQuery),
    allMaterialIds.length > 0
      ? db.collection(IB_MATERIALS_COLLECTION).deleteMany({
          $or: [
            { origin: STUDY_AUTO_LEARN_ORIGIN },
            { sourceKind: STUDY_AUTO_LEARN_SOURCE_KIND },
            { sourceName: "approved_user_question" },
            { materialId: { $in: allMaterialIds } },
            { tags: "auto-learned" },
          ],
        })
      : db.collection(IB_MATERIALS_COLLECTION).deleteMany({
          $or: [
            { origin: STUDY_AUTO_LEARN_ORIGIN },
            { sourceKind: STUDY_AUTO_LEARN_SOURCE_KIND },
            { sourceName: "approved_user_question" },
            { tags: "auto-learned" },
          ],
        }),
    db.collection(IB_MATERIAL_CHUNKS_COLLECTION).deleteMany(chunkQuery),
  ]);

  return {
    questionBankDeleted: questionDelete.deletedCount || 0,
    materialsDeleted: materialDelete.deletedCount || 0,
    chunksDeleted: chunkDelete.deletedCount || 0,
    vectorDeleteRequested: allVectorIds.length,
  };
}

function uniqueStrings(values: string[], limit = values.length): string[] {
  return [...new Set(values.map((item) => item.trim()).filter(Boolean))].slice(0, limit);
}

function topicSearchTerms(topic: string): string[] {
  const normalized = topic.toLowerCase();
  const directTopicTerms: Array<[string[], string[]]> = [
    [
      ["\u70ed", "\u70ed\u5b66", "\u70ed\u4f20\u9012", "\u4f20\u5bfc", "\u8f90\u5c04", "\u7ea2\u5916", "\u70ed\u80fd", "thermal", "heat", "radiation", "conduction", "infrared"],
      ["thermal", "heat transfer", "radiation", "conduction", "infrared", "thermal energy", "emission", "convection"],
    ],
    [
      ["\u5149\u5b66", "\u53cd\u5c04", "\u5165\u5c04", "\u53cd\u5c04\u89d2", "\u900f\u955c", "\u51f8\u900f\u955c", "\u7126\u70b9", "\u6210\u50cf", "optics", "reflection", "mirror", "lens", "focal"],
      ["optics", "reflection", "mirror", "incident angle", "angle of incidence", "angle of reflection", "lens", "converging lens", "focal point", "image", "ray diagram"],
    ],
    [
      ["\u6d4b\u91cf", "\u8bef\u5dee", "\u4e0d\u786e\u5b9a", "\u7cbe\u5ea6", "\u5b9e\u9a8c", "\u8bfb\u6570", "measurement", "uncertainty", "accuracy", "precision", "experiment"],
      ["measurement", "uncertainty", "accuracy", "precision", "percentage uncertainty", "experimental error", "significant figures"],
    ],
    [
      ["\u5468\u671f", "\u5355\u6446", "\u6446", "\u79d2\u8868", "\u8ba1\u65f6", "\u53cd\u5e94\u65f6\u95f4", "pendulum", "period", "stopwatch", "timing"],
      ["period", "pendulum", "stopwatch", "timing", "reaction time", "multiple oscillations", "average period"],
    ],
  ];
  const directMatch = directTopicTerms.find(([triggers]) => triggers.some((trigger) => normalized.includes(trigger)));
  if (directMatch) {
    return directMatch[1];
  }
  const topicMap: Array<[string[], string[]]> = [
    [["热", "热学", "热传递", "传导", "辐射", "红外"], ["thermal", "heat transfer", "radiation", "conduction", "infrared", "thermal energy", "emission"]],
    [["光学", "反射", "入射", "反射角", "透镜", "凸透镜", "焦点", "成像"], ["optics", "reflection", "mirror", "incident angle", "angle of incidence", "lens", "converging lens", "focal point", "image"]],
    [["测量", "误差", "不确定", "精度", "实验"], ["measurement", "uncertainty", "accuracy", "precision", "percentage uncertainty", "experimental error"]],
    [["probability", "random"], ["probability", "random", "chosen", "replacement", "event", "binomial", "cube"]],
    [["differentiat", "derivative", "gradient"], ["differentiate", "derivative", "gradient", "normal", "tangent", "stationary"]],
    [["integrat"], ["integrate", "integral", "area", "anti-derivative"]],
    [["vector"], ["vector", "scalar", "dot product", "magnitude", "direction"]],
    [["function", "graph"], ["function", "graph", "domain", "range", "inverse", "transformation"]],
    [["polynomial"], ["polynomial", "factor", "remainder", "root", "zero"]],
    [["optimization", "maximum", "minimum"], ["maximum", "minimum", "optimize", "surface area", "volume"]],
    [["stoichiometry", "mole"], ["stoichiometry", "mole", "molar", "limiting reagent", "yield"]],
    [["mechanic", "force"], ["mechanics", "force", "motion", "acceleration", "newton"]],
  ];

  for (const [triggers, terms] of topicMap) {
    if (triggers.some((trigger) => normalized.includes(trigger))) {
      return terms;
    }
  }

  return topic ? [topic] : [];
}

function meaningfulRecommendationTerms(terms: string[]): string[] {
  const commonTerms = new Set([
    "ib",
    "physics",
    "chemistry",
    "mathematics",
    "markscheme",
    "mark",
    "paper",
    "past",
    "question",
    "study",
    "review",
    "hl",
    "sl",
    "gce",
    "senior",
    "high",
    "section",
    "pdp",
  ]);

  return uniqueStrings(
    terms
      .map((term) => term.toLowerCase().trim())
      .filter((term) => term.length >= 3 && !commonTerms.has(term))
      .filter((term) => !/^q?\d{1,2}$/i.test(term)),
    40
  );
}

function buildWeaknessTerms(weaknesses: StudyWeakness[], queries: string[]): string[] {
  const weaknessTerms = weaknesses.flatMap((item) => [
    item.topic,
    item.skill,
    item.recommendedFocus,
    ...item.evidence,
    ...topicSearchTerms(item.topic),
    ...topicSearchTerms(item.skill),
  ]);
  const queryTerms = queries.flatMap((query) =>
    query
      .split(/[^a-z0-9\u4e00-\u9fa5]+/i)
      .map((item) => item.trim())
      .filter((item) => item.length > 2)
  );

  return uniqueStrings([...weaknessTerms, ...queryTerms], 60);
}

function buildRecommendationQuery(exam: StudyExamRecord, weaknesses: StudyWeakness[], queries: string[]): string {
  const weaknessBlock = weaknesses
    .slice(0, 4)
    .map((item) => `${item.topic}: ${item.skill}. ${item.recommendedFocus}`)
    .join(" ");
  return [
    exam.subject,
    exam.grade,
    "IB targeted past paper question and markscheme",
    weaknessBlock,
    queries.slice(0, 4).join(" "),
  ]
    .filter(Boolean)
    .join(" ");
}

function scoreChunkCandidate(
  chunk: GenericDocument,
  terms: string[],
  exam: StudyExamRecord,
  vectorScore: number
): number {
  const rawContent = asString(chunk.content);
  const baseQuestionRef = asString(chunk.questionRef) || extractQuestionRef(rawContent);
  const granularMatch = extractGranularQuestionMatch(rawContent, baseQuestionRef, terms);
  const questionRef = granularMatch.questionRef || baseQuestionRef;
  const focusedContent = granularMatch.content;
  if (!focusedContent) {
    return 0;
  }
  if (isLowQualityRecommendedChunk(chunk, focusedContent)) {
    return 0;
  }

  const haystack = [
    asString(chunk.title),
    focusedContent,
    asString(chunk.materialType),
    asString(chunk.paper),
    asString(chunk.timezone),
    ...asStringArray(chunk.topics),
    ...asStringArray(chunk.tags),
    ...asStringArray(chunk.knowledgePointNames),
  ]
    .join(" ")
    .toLowerCase();
  const meaningfulTerms = meaningfulRecommendationTerms(terms);
  const lexicalHitCount = meaningfulTerms.filter((term) => haystack.includes(term)).length;
  if (meaningfulTerms.length > 0 && lexicalHitCount === 0 && !isAutoLearnedReference(chunk)) {
    return 0;
  }

  let score = vectorScore > 0 ? Math.round(vectorScore * 100) : 0;

  for (const term of terms) {
    const normalized = term.toLowerCase();
    if (normalized.length > 1 && haystack.includes(normalized)) {
      score += normalized.length > 8 ? 4 : 2;
    }
  }

  if (exam.subject && haystack.includes(exam.subject.toLowerCase())) {
    score += 5;
  }

  const materialType = asString(chunk.materialType);
  if (materialType === "PAST_PAPER") {
    score += 8;
  }
  if (materialType === "MARK_SCHEME") {
    score += 6;
  }
  if (questionRef) {
    score += 4;
  }
  if (hasQuestionSignal(focusedContent)) {
    score += 6;
  }
  score += Math.min(lexicalHitCount, 6) * 3;
  if (looksLikeAdministrativeChunk(rawContent)) {
    score -= 12;
  }

  return score;
}

function extractQuestionRef(content: string): string {
  const questionMatch = content.match(/\b(?:question|q)\s*([0-9]{1,2}[a-z]?)/i);
  if (questionMatch) {
    return `Q${questionMatch[1]}`;
  }

  const numberedMatch = content.match(/(?:^|\s)([0-9]{1,2})\s*[.)]\s+(?:\[|[A-Z]|Find|Show|Calculate|Determine|State|Explain|Using)/i);
  if (numberedMatch) {
    return `Q${numberedMatch[1]}`;
  }

  return "";
}

const ADMINISTRATIVE_CONTENT_PATTERNS = [
  /candidate session number/i,
  /do not open this examination paper until instructed/i,
  /international baccalaureate organization/i,
  /this markscheme is the property of/i,
  /applying-for-a-license/i,
  /instructions to candidates/i,
  /write your session number/i,
  /maximum mark for this examination paper/i,
  /zone [abc] (?:morning|afternoon)/i,
  /each row in the [“"']?question[”"']? column relates/i,
  /smallest subpart of the question/i,
];

const QUESTION_SIGNAL_PATTERNS = [
  /(?:^|\n)\s*(?:question\s*)?\d{1,2}(?:\s*[.)]|\s*\[)/i,
  /\[maximum mark:\s*\d+/i,
  /\b(?:Find|Show|Calculate|Determine|State|Explain|Using|Hence|Consider|Given)\b/i,
];

const MARKSCHEME_SIGNAL_PATTERNS = [
  /\b(?:allow|award|accept|do not accept|ecf|marking point|markscheme|marks?)\b/i,
  /\b(?:M|A|B|C|D|R|N)\d\b/,
  /\[\d{1,2}\s*marks?\]/i,
  /[✓✔]/,
];

function hasMarkschemeSignal(content: string): boolean {
  return MARKSCHEME_SIGNAL_PATTERNS.some((pattern) => pattern.test(content));
}

function looksLikeMarkschemeInstructionOnly(content: string): boolean {
  const sample = content.slice(0, 1400);
  return (
    /each row in the [“"']?question[”"']? column relates/i.test(sample) ||
    /smallest subpart of the question/i.test(sample) ||
    /follow through marks are awarded/i.test(sample)
  );
}

function isLowQualityRecommendedChunk(chunk: GenericDocument, focusedContent = ""): boolean {
  const materialType = asString(chunk.materialType);
  const content = focusedContent || asString(chunk.content);
  if (!content) {
    return true;
  }

  if (looksLikeAdministrativeChunk(content) || looksLikeMarkschemeInstructionOnly(content)) {
    return true;
  }

  if (materialType === "MARK_SCHEME") {
    if (!hasMarkschemeSignal(content)) {
      return true;
    }

    const readableContent = asString(chunk.readableContent);
    if (!readableContent && scoreReadableRepairRisk(content) >= STUDY_ON_DEMAND_READABLE_REPAIR_RISK_THRESHOLD) {
      return true;
    }
  }

  return false;
}

function questionNumberFromRef(questionRef: string): string {
  const match = questionRef.trim().match(/q?\s*([0-9]{1,2}[a-z]?)/i);
  return match?.[1] || "";
}

function hasQuestionSignal(content: string): boolean {
  return QUESTION_SIGNAL_PATTERNS.some((pattern) => pattern.test(content));
}

function looksLikeAdministrativeChunk(content: string): boolean {
  const sample = content.slice(0, 2400);
  const adminHits = ADMINISTRATIVE_CONTENT_PATTERNS.filter((pattern) => pattern.test(sample)).length;
  return adminHits >= 2 && !hasQuestionSignal(sample);
}

function stripAdministrativeLead(content: string): string {
  const lines = content
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trimEnd());

  const firstMeaningfulIndex = lines.findIndex((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) {
      return false;
    }
    if (hasQuestionSignal(trimmed)) {
      return true;
    }
    if (index >= 18) {
      return true;
    }
    return false;
  });

  if (firstMeaningfulIndex <= 0) {
    return content.trim();
  }

  return lines.slice(firstMeaningfulIndex).join("\n").trim();
}

function findQuestionAnchorIndex(content: string, questionRef: string, terms: string[]): number {
  const ref = questionNumberFromRef(questionRef);
  if (ref) {
    const escapedRef = ref.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const refPatterns = [
      new RegExp(`(?:^|\\n)\\s*(?:question\\s*)?${escapedRef}(?:\\s*[.)]|\\s*\\[)`, "i"),
      new RegExp(`(?:^|\\n)\\s*${escapedRef}\\s+(?:\\[|Find|Show|Calculate|Determine|State|Explain|Using|Given)`, "i"),
    ];

    for (const pattern of refPatterns) {
      const match = pattern.exec(content);
      if (match && typeof match.index === "number") {
        return match.index;
      }
    }
  }

  const lowerContent = content.toLowerCase();
  const termMatchIndex = terms
    .map((term) => lowerContent.indexOf(term.toLowerCase()))
    .filter((index) => index >= 0)
    .sort((left, right) => left - right)[0];

  return typeof termMatchIndex === "number" ? termMatchIndex : -1;
}

function findNextQuestionBoundary(content: string, startIndex: number, questionRef: string): number {
  const ref = questionNumberFromRef(questionRef);
  const baseNumber = Number.parseInt(ref, 10);
  const searchArea = content.slice(Math.min(content.length, startIndex + 40));

  if (Number.isFinite(baseNumber)) {
    for (let offset = 1; offset <= 4; offset += 1) {
      const nextNumber = baseNumber + offset;
      const nextPattern = new RegExp(`(?:^|\\n)\\s*(?:question\\s*)?${nextNumber}(?:\\s*[.)]|\\s*\\[)`, "i");
      const match = nextPattern.exec(searchArea);
      if (match && typeof match.index === "number") {
        return startIndex + 40 + match.index;
      }
    }
  }

  const genericMatch = /(?:^|\n)\s*(?:question\s*)?([0-9]{1,2})(?:\s*[.)]|\s*\[)/i.exec(searchArea);
  if (genericMatch && typeof genericMatch.index === "number") {
    return startIndex + 40 + genericMatch.index;
  }

  return -1;
}

function extractFocusedMaterialContent(
  content: string,
  questionRef: string,
  terms: string[],
  maxLength = 1600
): string {
  const normalized = stripAdministrativeLead(content.replace(/\r/g, "").trim());
  if (!normalized) {
    return "";
  }

  const anchorIndex = findQuestionAnchorIndex(normalized, questionRef, terms);
  if (anchorIndex >= 0) {
    const nextBoundary = findNextQuestionBoundary(normalized, anchorIndex, questionRef);
    const endIndex =
      nextBoundary > anchorIndex
        ? nextBoundary
        : Math.min(normalized.length, anchorIndex + maxLength);

    return normalized.slice(anchorIndex, endIndex).trim();
  }

  if (looksLikeAdministrativeChunk(normalized)) {
    return "";
  }

  return normalized.slice(0, maxLength).trim();
}

type GranularQuestionMatch = {
  content: string;
  questionRef: string;
};

function normalizeQuestionRefForMatch(value: string): string {
  const match = value.trim().toLowerCase().match(/q?\s*([0-9]{1,2}[a-z]?)/i);
  return match ? `q${match[1]}` : "";
}

function collectEnumeratedMarkers(content: string, regex: RegExp): Array<{ index: number; label: string }> {
  const matches: Array<{ index: number; label: string }> = [];
  const prepared = new RegExp(regex.source, regex.flags.includes("g") ? regex.flags : `${regex.flags}g`);

  for (const match of content.matchAll(prepared)) {
    const label = (match[1] || "").trim().toLowerCase();
    if (!label || typeof match.index !== "number") {
      continue;
    }
    matches.push({
      index: match.index,
      label,
    });
  }

  return matches;
}

function findMarkerBeforeTarget(
  markers: Array<{ index: number; label: string }>,
  targetIndex: number
): { index: number; label: string } | null {
  const valid = markers.filter((item) => item.index <= targetIndex);
  return valid.length > 0 ? valid[valid.length - 1] : null;
}

function findMarkerAfterTarget(
  markers: Array<{ index: number; label: string }>,
  targetIndex: number
): { index: number; label: string } | null {
  return markers.find((item) => item.index > targetIndex) || null;
}

function extractGranularQuestionMatch(
  content: string,
  questionRef: string,
  terms: string[],
  maxLength = 1600
): GranularQuestionMatch {
  const questionContent = extractFocusedMaterialContent(content, questionRef, terms, maxLength);
  if (!questionContent) {
    return {
      content: "",
      questionRef,
    };
  }

  const termIndex = findQuestionAnchorIndex(questionContent, "", terms);
  const targetIndex = termIndex >= 0 ? termIndex : 0;
  const letterMarkers = collectEnumeratedMarkers(questionContent, /(?:^|\n| {2,})\(\s*([a-h])\s*\)(?=\s*[A-Za-z0-9])/gi);
  const romanMarkers = collectEnumeratedMarkers(
    questionContent,
    /(?:^|\n| {2,})\(\s*((?:i|ii|iii|iv|v|vi|vii|viii|ix|x))\s*\)(?=\s*[A-Za-z0-9])/gi
  );
  const letterMarker = findMarkerBeforeTarget(letterMarkers, targetIndex);
  const romanMarkerCandidate = findMarkerBeforeTarget(romanMarkers, targetIndex);
  const romanMarker =
    romanMarkerCandidate && (!letterMarker || romanMarkerCandidate.index > letterMarker.index)
      ? romanMarkerCandidate
      : null;

  const subAnchor = romanMarker?.index ?? letterMarker?.index ?? -1;
  if (subAnchor < 0) {
    return {
      content: questionContent,
      questionRef,
    };
  }

  const nextLetter = findMarkerAfterTarget(letterMarkers, subAnchor);
  const nextRoman = findMarkerAfterTarget(romanMarkers, subAnchor);
  const nextBoundaryCandidates = [nextLetter?.index, nextRoman?.index]
    .filter((item): item is number => typeof item === "number" && item > subAnchor)
    .sort((left, right) => left - right);
  const nextBoundary = nextBoundaryCandidates[0] ?? -1;
  const start = Math.max(0, subAnchor - (romanMarker ? 120 : 80));
  const end =
    nextBoundary > subAnchor
      ? nextBoundary
      : Math.min(questionContent.length, start + maxLength);

  const detailedRefParts = [questionRef];
  if (letterMarker) {
    detailedRefParts.push(`(${letterMarker.label})`);
  }
  if (romanMarker) {
    detailedRefParts.push(`(${romanMarker.label})`);
  }

  return {
    content: questionContent.slice(start, end).trim(),
    questionRef: detailedRefParts.filter(Boolean).join(""),
  };
}

function buildExcerpt(content: string, terms: string[], maxLength = 520): string {
  const normalizedContent = content.replace(/\s+/g, " ").trim();
  if (normalizedContent.length <= maxLength) {
    return normalizedContent;
  }

  const lowerContent = normalizedContent.toLowerCase();
  const matchIndex = terms
    .map((term) => lowerContent.indexOf(term.toLowerCase()))
    .filter((index) => index >= 0)
    .sort((left, right) => left - right)[0];
  const center = typeof matchIndex === "number" ? matchIndex : 0;
  const start = Math.max(0, center - 120);
  const end = Math.min(normalizedContent.length, start + maxLength);
  const prefix = start > 0 ? "..." : "";
  const suffix = end < normalizedContent.length ? "..." : "";

  return `${prefix}${normalizedContent.slice(start, end)}${suffix}`;
}

function materialActionLabel(materialType: string): string {
  if (materialType === "MARK_SCHEME") {
    return "先做题再对照这段评分细则，逐步核查失分点与给分步骤。";
  }
  if (materialType === "PAST_PAPER") {
    return "先限时完成这道题，再核对答案并写订正说明。";
  }
  return "把这份资料作为练习前的短时针对性复习。";
}

function recommendationTopics(chunk: GenericDocument, weaknesses: StudyWeakness[]): string[] {
  const chunkTopics = [...asStringArray(chunk.knowledgePointNames), ...asStringArray(chunk.topics)];
  return uniqueStrings([...chunkTopics, ...weaknesses.map((item) => item.topic)], 4);
}

function dedupeRecommendations(items: StudyMaterialRecommendation[]): StudyMaterialRecommendation[] {
  const seen = new Set<string>();
  const unique: StudyMaterialRecommendation[] = [];

  for (const item of items) {
    const signature = [
      item.sourceTitle || item.title,
      item.questionRef,
      (item.excerpt || "").replace(/\W+/g, "").slice(0, 140).toLowerCase(),
    ].join("|");
    if (seen.has(signature)) {
      continue;
    }
    seen.add(signature);
    unique.push(item);
  }

  return unique;
}

function materialAllocationKey(material: StudyMaterialRecommendation): string {
  return material.chunkId || material.materialId || `${material.title}|${material.questionRef || ""}`;
}

function materialTaskFitness(task: StudyPlanTask, material: StudyMaterialRecommendation, usageCount: number): number {
  let score = topicOverlapScore(task, material) * 5 + Math.min(material.score, 100) / 20;

  if (task.type === "practice" && material.sourceType === "practice_pack") {
    score += 8;
  }
  if (task.type === "review" && material.materialType === "MARK_SCHEME") {
    score += 3;
  }
  if (task.type === "reflection" && material.materialType === "MARK_SCHEME") {
    score += 6;
  }
  if (task.type === "revision" && material.sourceType === "practice_pack") {
    score += 4;
  }

  score -= usageCount * 3;
  return score;
}

function selectTaskRecommendations(
  task: StudyPlanTask,
  recommendations: StudyMaterialRecommendation[],
  usageByKey: Map<string, number>
): StudyMaterialRecommendation[] {
  const ranked = recommendations
    .map((material) => {
      const key = materialAllocationKey(material);
      return {
        key,
        material,
        score: materialTaskFitness(task, material, usageByKey.get(key) || 0),
      };
    })
    .sort((left, right) => right.score - left.score);

  const selected: StudyMaterialRecommendation[] = [];
  const selectedKeys = new Set<string>();
  const maxItems = task.type === "practice" || task.type === "revision" ? 2 : 1;

  for (const item of ranked) {
    if (selected.length >= maxItems) {
      break;
    }
    if (item.score <= 0 && selected.length > 0) {
      continue;
    }
    if (selectedKeys.has(item.key)) {
      continue;
    }
    selected.push(item.material);
    selectedKeys.add(item.key);
  }

  if (selected.length === 0 && ranked.length > 0) {
    selected.push(ranked[0].material);
    selectedKeys.add(ranked[0].key);
  }

  for (const key of selectedKeys) {
    usageByKey.set(key, (usageByKey.get(key) || 0) + 1);
  }

  return selected;
}

function buildChunkRecommendation(
  chunk: GenericDocument,
  weaknesses: StudyWeakness[],
  terms: string[],
  score: number,
  materialUrl: string
): StudyMaterialRecommendation | null {
  const content = asString(chunk.content);
  const sourceTitle = asString(chunk.title);
  if (!content || !sourceTitle) {
    return null;
  }

  const materialType = asString(chunk.materialType) || "reference";
  const baseQuestionRef = asString(chunk.questionRef) || extractQuestionRef(content);
  const granularMatch = extractGranularQuestionMatch(content, baseQuestionRef, terms);
  const questionRef = granularMatch.questionRef || baseQuestionRef;
  const focusedContent = granularMatch.content;
  if (!focusedContent) {
    return null;
  }
  if (isLowQualityRecommendedChunk(chunk, focusedContent)) {
    return null;
  }
  const titlePrefix = materialType === "MARK_SCHEME" ? "评分细则对照" : "针对性练习题";

  return {
    materialId: asString(chunk.materialId) || undefined,
    chunkId: asString(chunk.milvusVectorId) || (chunk._id ? String(chunk._id) : undefined),
    title: questionRef ? `${titlePrefix}: ${questionRef}` : `${titlePrefix}: ${sourceTitle}`,
    url: materialUrl,
    materialType,
    reason:
      materialType === "MARK_SCHEME"
        ? "该片段与当前弱项直接相关，适合在做完对应题目后进行给分校准。"
        : "该真题片段与当前弱项直接相关，可用于精准练习而非盲目刷整卷。",
    topics: recommendationTopics(chunk, weaknesses),
    score,
    sourceTitle,
    questionRef,
    excerpt: buildExcerpt(focusedContent, [questionRef, ...terms].filter(Boolean)),
    actionLabel: materialActionLabel(materialType),
    estimatedMinutes: materialType === "MARK_SCHEME" ? 12 : 20,
    sourceType: materialType === "MARK_SCHEME" ? "markscheme_check" : "practice_question",
  };
}

function normalizePackTitle(value: string): string {
  return value
    .toLowerCase()
    .replace(/markscheme|paper|exam|may|nov|tz[0-9]|hl|sl|ib/gi, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

type MaterialIdentity = {
  year: string;
  paper: string;
  timezone: string;
  level: string;
};

function extractMaterialIdentity(value: string): MaterialIdentity {
  const text = value.toLowerCase();
  return {
    year: text.match(/\b(20\d{2}|19\d{2})\b/)?.[1] || "",
    paper: text.match(/\bpaper\s*([123])\b|paper([123])\b/)?.[1] || text.match(/\bpaper\s*([123])\b|paper([123])\b/)?.[2] || "",
    timezone: text.match(/\btz\s*([0-9])\b|tz([0-9])\b/)?.[1] || text.match(/\btz\s*([0-9])\b|tz([0-9])\b/)?.[2] || "",
    level: text.match(/\b(hl|sl)\b/)?.[1] || "",
  };
}

function materialIdentitiesCompatible(left: string, right: string): boolean {
  const leftIdentity = extractMaterialIdentity(left);
  const rightIdentity = extractMaterialIdentity(right);

  for (const key of ["year", "paper", "timezone", "level"] as const) {
    if (leftIdentity[key] && rightIdentity[key] && leftIdentity[key] !== rightIdentity[key]) {
      return false;
    }
  }

  const matchedSignals = (["year", "paper", "timezone", "level"] as const).filter(
    (key) => leftIdentity[key] && rightIdentity[key] && leftIdentity[key] === rightIdentity[key]
  ).length;

  return matchedSignals >= 2;
}

function findBestMatchingMarkscheme(
  question: StudyMaterialRecommendation,
  markschemes: StudyMaterialRecommendation[]
): StudyMaterialRecommendation | null {
  const questionTitle = normalizePackTitle(question.sourceTitle || question.title);
  const rawQuestionTitle = question.sourceTitle || question.title;
  const questionRef = (question.questionRef || "").toLowerCase();
  const questionBaseRef = normalizeQuestionRefForMatch(question.questionRef || "");
  const ranked = markschemes
    .map((item) => {
      const markTitle = normalizePackTitle(item.sourceTitle || item.title);
      const rawMarkTitle = item.sourceTitle || item.title;
      if (!materialIdentitiesCompatible(rawQuestionTitle, rawMarkTitle)) {
        return {
          item,
          score: 0,
        };
      }
      const markRef = (item.questionRef || "").toLowerCase();
      const markBaseRef = normalizeQuestionRefForMatch(item.questionRef || "");
      let score = 0;

      if (questionRef && markRef && questionRef === markRef) {
        score += 8;
      }
      if (questionBaseRef && markBaseRef && questionBaseRef === markBaseRef) {
        score += 4;
      }
      if (questionRef && markRef && (questionRef.startsWith(markRef) || markRef.startsWith(questionRef))) {
        score += 2;
      }
      if (questionTitle && markTitle && questionTitle === markTitle) {
        score += 5;
      } else if (questionTitle && markTitle && (questionTitle.includes(markTitle) || markTitle.includes(questionTitle))) {
        score += 3;
      }
      score += Math.min(item.score, 120) / 60;

      return {
        item,
        score,
      };
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score);

  return ranked[0]?.item || null;
}

function buildPracticePackRecommendations(
  recommendations: StudyMaterialRecommendation[]
): StudyMaterialRecommendation[] {
  const questionItems = recommendations.filter((item) => item.sourceType === "practice_question");
  const markschemeItems = recommendations.filter((item) => item.sourceType === "markscheme_check");
  const usedMarks = new Set<string>();
  const packs: StudyMaterialRecommendation[] = [];

  for (const question of questionItems) {
    const matchedMarkscheme = findBestMatchingMarkscheme(question, markschemeItems);
    if (matchedMarkscheme?.chunkId) {
      usedMarks.add(matchedMarkscheme.chunkId);
    }

    const workflowSteps = [
      `先在 ${question.estimatedMinutes || 20} 分钟内独立完成 ${question.questionRef || "该题目片段"}。`,
      matchedMarkscheme
        ? `对照评分细则片段${matchedMarkscheme.questionRef ? `（${matchedMarkscheme.questionRef}）` : ""}，逐步标注失分环节。`
        : "结合方法卡自查，定位第一处错误步骤。",
      "写订正句：错误类型（概念/建模/计算/书写）+ 正确做法。",
      "从头无笔记再做一次，并与第一次结果对比。",
    ];

    packs.push({
      materialId: question.materialId,
      chunkId: question.chunkId,
      title: question.questionRef ? `练习包 ${question.questionRef}` : `练习包：${question.title}`,
      url: question.url || matchedMarkscheme?.url || "",
      materialType: "PRACTICE_PACK",
      reason: "已将练题与评分校准打包，学生可以直接执行“做题-对标-订正-复做”的完整闭环。",
      topics: uniqueStrings([...(question.topics || []), ...(matchedMarkscheme?.topics || [])], 4),
      score: Math.round(question.score + (matchedMarkscheme ? matchedMarkscheme.score * 0.6 : 0)),
      sourceTitle: question.sourceTitle || question.title,
      questionRef: question.questionRef,
      excerpt: question.excerpt,
      actionLabel: "按完整闭环执行：限时作答 -> 评分对照 -> 订正记录 -> 无笔记重做。",
      estimatedMinutes: (question.estimatedMinutes || 20) + (matchedMarkscheme?.estimatedMinutes || 10),
      sourceType: "practice_pack",
      workflowSteps,
      expectedOutcome: "形成一份含错因标签的完整订正解，并完成一次无笔记复做验证准确率提升。",
      pairedMarkschemeTitle: matchedMarkscheme?.sourceTitle || matchedMarkscheme?.title,
      pairedMarkschemeChunkId: matchedMarkscheme?.chunkId,
    });
  }

  const supportMarks = markschemeItems
    .filter((item) => !item.chunkId || !usedMarks.has(item.chunkId))
    .slice(0, 2);

  return [...packs, ...supportMarks];
}

async function recommendStudyMaterials(
  db: AnyDb,
  exam: StudyExamRecord,
  weaknesses: StudyWeakness[],
  queries: string[]
): Promise<StudyMaterialRecommendation[]> {
  const ibSubjectContext = await buildIbKnowledgeContext(db, {
    subjectText: exam.subject,
    level: exam.grade,
    queryTerms: queries,
  });
  const subjectCode = asString(ibSubjectContext?.subjectCode);
  const normalizedExamLevel = exam.grade.toUpperCase();
  const retrievalLevel =
    normalizedExamLevel === "HL" || normalizedExamLevel === "SL" || normalizedExamLevel === "BOTH"
      ? normalizedExamLevel
      : undefined;
  const weaknessTerms = buildWeaknessTerms(weaknesses, queries);
  const recommendationQuery = [
    buildRecommendationQuery(exam, weaknesses, queries),
    meaningfulRecommendationTerms(weaknessTerms).slice(0, 20).join(" "),
  ]
    .filter(Boolean)
    .join(" ");
  const vectorHits = subjectCode
    ? await searchZillizByText(
        recommendationQuery,
        {
          subjectCode,
          hlSl: retrievalLevel,
          materialTypes: ["PAST_PAPER", "MARK_SCHEME", "VERIFIED_QUESTION"],
        },
        24
      ).catch(() => [])
    : [];
  const vectorScoreById = new Map(vectorHits.map((hit) => [hit.id, hit.score]));
  const vectorIds = vectorHits.map((hit) => hit.id).filter(Boolean);
  const vectorChunks = vectorIds.length
    ? ((await db
        .collection(IB_MATERIAL_CHUNKS_COLLECTION)
        .find({ milvusVectorId: { $in: vectorIds } })
        .limit(vectorIds.length)
        .toArray()) as GenericDocument[])
    : [];
  const chunkFilter: GenericDocument = {
    materialType: { $in: ["PAST_PAPER", "MARK_SCHEME", "VERIFIED_QUESTION"] },
  };
  if (subjectCode) {
    chunkFilter.subjectCode = subjectCode;
  }
  if (STUDY_RECOMMENDATION_MIN_YEAR > 0) {
    chunkFilter.$or = [
      { year: { $gte: STUDY_RECOMMENDATION_MIN_YEAR } },
      { materialType: "VERIFIED_QUESTION" },
      { origin: STUDY_AUTO_LEARN_ORIGIN },
      { sourceKind: STUDY_AUTO_LEARN_SOURCE_KIND },
      { tags: "auto-learned" },
    ];
  }
  const mongoChunks = (await db
    .collection(IB_MATERIAL_CHUNKS_COLLECTION)
    .find(chunkFilter)
    .sort({ year: -1, chunkIndex: 1 })
    .limit(220)
    .toArray()) as GenericDocument[];
  const chunkMap = new Map<string, GenericDocument>();

  for (const chunk of [...vectorChunks, ...mongoChunks]) {
    const chunkId = asString(chunk.milvusVectorId) || (chunk._id ? String(chunk._id) : "");
    if (chunkId && !chunkMap.has(chunkId)) {
      chunkMap.set(chunkId, chunk);
    }
  }

  const materialIds = uniqueStrings(
    [...chunkMap.values()].map((chunk) => asString(chunk.materialId)).filter(Boolean)
  );
  const materials = materialIds.length
    ? ((await db
        .collection(IB_MATERIALS_COLLECTION)
        .find({ materialId: { $in: materialIds } })
        .limit(materialIds.length)
        .toArray()) as GenericDocument[])
    : [];
  const materialById = new Map(materials.map((material) => [asString(material.materialId), material]));
  const rankedChunks = [...chunkMap.values()]
    .filter((chunk) => isRecommendableStudyChunk(chunk, materialById.get(asString(chunk.materialId))))
    .map((chunk) => ({
      chunk,
      id: asString(chunk.milvusVectorId) || (chunk._id ? String(chunk._id) : ""),
      content: asString(chunk.content),
      score: scoreChunkCandidate(chunk, weaknessTerms, exam, vectorScoreById.get(asString(chunk.milvusVectorId)) || 0),
    }))
    .filter((item) => item.id && item.content && item.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 24);
  const rerankedChunks =
    rankedChunks.length > 1
      ? await rerankZillizTextHits(recommendationQuery, rankedChunks, 10).catch(() => rankedChunks.slice(0, 10))
      : rankedChunks;
  const chunkRecommendations = dedupeRecommendations(
    rerankedChunks
      .map((item) => {
        const material = materialById.get(asString(item.chunk.materialId));
        const url = asString(material?.fileUrl) || asString(material?.sourceUrl);
        return buildChunkRecommendation(item.chunk, weaknesses, weaknessTerms, item.score, url);
      })
      .filter((item): item is StudyMaterialRecommendation => Boolean(item))
  ).slice(0, 8);

  if (chunkRecommendations.length > 0) {
    const prioritizedChunkRecommendations = [
      ...chunkRecommendations.filter((item) => item.materialType === "PAST_PAPER"),
      ...chunkRecommendations.filter((item) => item.materialType === "MARK_SCHEME"),
      ...chunkRecommendations.filter(
        (item) => item.materialType !== "PAST_PAPER" && item.materialType !== "MARK_SCHEME"
      ),
    ];
    const practicePackRecommendations = buildPracticePackRecommendations(prioritizedChunkRecommendations);
    if (practicePackRecommendations.length > 0) {
      return practicePackRecommendations.slice(0, 8);
    }
    return prioritizedChunkRecommendations.slice(0, 8);
  }

  const studyCandidates = (await db
    .collection(STUDY_MATERIALS_COLLECTION)
    .find(exam.subject ? { subject: exam.subject } : {})
    .limit(100)
    .toArray()) as GenericDocument[];
  const ibCandidateFilter: GenericDocument = subjectCode ? { subjectCode } : {};
  if (STUDY_RECOMMENDATION_MIN_YEAR > 0) {
    ibCandidateFilter.year = { $gte: STUDY_RECOMMENDATION_MIN_YEAR };
  }
  const ibCandidates = (await db
    .collection(IB_MATERIALS_COLLECTION)
    .find(ibCandidateFilter)
    .sort({ year: -1 })
    .limit(100)
    .toArray()) as GenericDocument[];
  const candidates = [...studyCandidates, ...ibCandidates.filter((candidate) => isRecommendableStudyChunk(candidate, candidate))];
  const meaningfulWeaknessTerms = meaningfulRecommendationTerms(weaknessTerms);
  const lowerWeaknessTerms = (meaningfulWeaknessTerms.length > 0 ? meaningfulWeaknessTerms : weaknessTerms).map((item) =>
    item.toLowerCase()
  );

  const ranked = candidates
    .map((candidate): StudyMaterialRecommendation | null => {
      const title = asString(candidate.title);
      const description = asString(candidate.description) || asString(candidate.summary);
      const topics = asStringArray(candidate.topics);
      const tags = asStringArray(candidate.tags);
      const haystack = [title, description, ...topics, ...tags].join(" ").toLowerCase();

      let score = 0;
      for (const term of lowerWeaknessTerms) {
        if (term && haystack.includes(term)) {
          score += 2;
        }
      }
      if (meaningfulWeaknessTerms.length > 0 && score === 0) {
        return null;
      }
      if (exam.subject && haystack.includes(exam.subject.toLowerCase())) {
        score += 1;
      }

      return {
        materialId: candidate._id ? String(candidate._id) : undefined,
        title,
        url: asString(candidate.url) || asString(candidate.fileUrl),
        materialType: asString(candidate.materialType) || asString(candidate.type) || "reference",
        reason: `与当前弱项关键词匹配：${topics.join("、") || tags.join("、") || "通用复习主题"}。`,
        topics,
        score,
        sourceTitle: title,
        sourceType: "reference" as const,
        actionLabel: "完成针对题练习后，再用这份资料做补充复盘。",
        estimatedMinutes: 15,
      };
    })
    .filter((item): item is StudyMaterialRecommendation => Boolean(item?.title && item.score > 0))
    .sort((left, right) => right.score - left.score)
    .slice(0, 5);

  if (ranked.length > 0) {
    return ranked;
  }

  return queries.slice(0, 4).map((query, index) => ({
    title: `建议检索 ${index + 1}`,
    url: "",
    materialType: "search_query",
    reason: `可用该检索词补充当前弱项的 IB 资料：${query}`,
    topics: weaknesses.slice(0, 2).map((item) => item.topic),
    score: 0,
    excerpt: query,
    actionLabel: "按该关键词检索，选 1 道题完成并在下次打卡中反馈结果。",
    estimatedMinutes: 10,
    sourceType: "search_query",
  }));
}

function topicOverlapScore(task: StudyPlanTask, material: StudyMaterialRecommendation): number {
  const taskTerms = task.focusTopics.map((item) => item.toLowerCase());
  const materialTerms = [...material.topics, material.title, material.reason].map((item) => item.toLowerCase());
  return taskTerms.reduce(
    (score, term) => score + (materialTerms.some((item) => item.includes(term) || term.includes(item)) ? 1 : 0),
    0
  );
}

function buildDefaultTaskInstructions(task: StudyPlanTask): string[] {
  if (task.type === "practice") {
    return [
      "先限时完成已绑定题目，再查看答案与评分细则。",
      "将每个错误标注为：概念/建模/计算/书写/时间。",
      "每道错题在订正后进行一次无笔记重做。",
    ];
  }

  if (task.type === "reflection") {
    return [
      "回看上一任务的订正过程与错因标签。",
      "为最高频错误写 1 条防错规则。",
      "给该弱项设置下次可量化检查指标。",
    ];
  }

  return [
    "阅读已绑定片段，识别本题真正考查的方法。",
    "先写简版方法卡，再进入练习。",
    "对照评分措辞优化你的方法卡表述。",
  ];
}

function buildTaskInstructionsFromMaterials(
  task: StudyPlanTask,
  selected: StudyMaterialRecommendation[]
): string[] {
  const pack = selected.find((item) => item.sourceType === "practice_pack");
  if (pack?.workflowSteps && pack.workflowSteps.length > 0) {
    if (task.type === "reflection") {
      return [
        "回看练习包中的错因标签，选出重复率最高的一类错误。",
        "写 1 条防错规则 + 1 条触发提示词。",
        "无笔记重做 1 次并与首次作答对比。",
      ];
    }
    return pack.workflowSteps;
  }

  if (task.type === "practice" && selected.length > 0) {
    const primary = selected[0];
    return [
      `先限时完成 ${primary.questionRef || "已绑定题目片段"}。`,
      "按错误类型标注并为每个错误写 1 句订正说明。",
      "无笔记重做同题并比较正确率变化。",
    ];
  }

  return buildDefaultTaskInstructions(task);
}

function buildTaskDeliverable(
  task: StudyPlanTask,
  selected: StudyMaterialRecommendation[]
): string {
  const pack = selected.find((item) => item.sourceType === "practice_pack");
  if (pack?.expectedOutcome) {
    return pack.expectedOutcome;
  }

  if (task.type === "practice") {
    return "限时作答 + 完整订正 + 错因标签 + 一次无笔记重做结果。";
  }

  if (task.type === "reflection") {
    return "一段简洁复盘，并附下一次训练的可量化防错规则。";
  }

  return task.successCriteria;
}

function enrichPlanWithRecommendations(
  plan: StudyLearningPlan,
  recommendations: StudyMaterialRecommendation[]
): StudyLearningPlan {
  if (recommendations.length === 0) {
    return {
      ...plan,
      tasks: plan.tasks.map((task) => ({
        ...task,
        instructions: task.instructions.length > 0 ? task.instructions : buildDefaultTaskInstructions(task),
        deliverable: task.deliverable || task.successCriteria,
        practiceItems: task.practiceItems,
        linkedMaterialTitles: task.linkedMaterialTitles,
        linkedMaterialChunkIds: task.linkedMaterialChunkIds || [],
        linkedMaterialIds: task.linkedMaterialIds || [],
      })),
    };
  }

  const usageByKey = new Map<string, number>();

  return {
    ...plan,
    tasks: plan.tasks.map((task) => {
      const selected = selectTaskRecommendations(task, recommendations, usageByKey);
      const materialTitles = uniqueStrings(
        [...task.linkedMaterialTitles, ...selected.map((item) => item.title)],
        4
      );
      const materialChunkIds = uniqueStrings(
        [...(task.linkedMaterialChunkIds || []), ...selected.map((item) => item.chunkId || "").filter(Boolean)],
        6
      );
      const materialIds = uniqueStrings(
        [...(task.linkedMaterialIds || []), ...selected.map((item) => item.materialId || "").filter(Boolean)],
        6
      );
      const practiceItems = uniqueStrings(
        [
          ...task.practiceItems,
          ...selected.map((item) =>
            item.questionRef
              ? `${item.questionRef}（来源：${item.sourceTitle || item.title}）`
              : item.sourceTitle || item.title
          ),
        ],
        6
      );

      return {
        ...task,
        instructions:
          task.instructions.length > 0
            ? task.instructions
            : buildTaskInstructionsFromMaterials(task, selected),
        deliverable: task.deliverable || buildTaskDeliverable(task, selected),
        practiceItems,
        linkedMaterialTitles: materialTitles,
        linkedMaterialChunkIds: materialChunkIds,
        linkedMaterialIds: materialIds,
      };
    }),
  };
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
      "你是一名资深 IB 学习策略教练。请基于试卷证据诊断弱项、生成可执行学习计划，并仅返回合法 JSON。所有面向学生的内容必须使用简体中文。",
    temperature: 0.2,
    maxTokens: 2600,
    timeoutMs: 180_000,
    requestLabel: "study-analysis",
    jsonMode: true,
  });

  if (!aiResponse) {
    console.warn("[study-analysis] model response is empty; falling back.");
    fallback.recommendedMaterials = await recommendStudyMaterials(
      db,
      exam,
      fallback.weaknesses,
      fallback.recommendedQueries
    );
    fallback.plan = enrichPlanWithRecommendations(fallback.plan, fallback.recommendedMaterials);
    return fallback;
  }

  const parsed = extractJson(aiResponse);
  if (!parsed) {
    console.warn("[study-analysis] JSON parse failed; falling back.", {
      preview: aiResponse.slice(0, 500),
      length: aiResponse.length,
    });
    fallback.recommendedMaterials = await recommendStudyMaterials(
      db,
      exam,
      fallback.weaknesses,
      fallback.recommendedQueries
    );
    fallback.plan = enrichPlanWithRecommendations(fallback.plan, fallback.recommendedMaterials);
    return fallback;
  }

  const weaknesses = sanitizeWeaknesses(parsed.weaknesses, fallback.weaknesses);
  const recommendedQueries = sanitizeQueries(parsed.recommendedQueries, fallback.recommendedQueries);
  const bundle: StudyAnalysisBundle = {
    overview: asString(parsed.overview) || fallback.overview,
    scoreSummary: reconcileScoreSummaryWithWeaknesses(
      sanitizeScoreSummary(parsed.scoreSummary, fallback.scoreSummary),
      weaknesses
    ),
    weaknesses,
    plan: sanitizePlan(parsed.plan, fallback.plan),
    recommendedQueries,
    recommendedMaterials: [],
    analysisMode: "ai",
  };

  bundle.recommendedMaterials = await recommendStudyMaterials(db, exam, weaknesses, recommendedQueries);
  bundle.plan = enrichPlanWithRecommendations(bundle.plan, bundle.recommendedMaterials);
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
