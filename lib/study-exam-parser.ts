import {
  StudyExamQuestion,
  StudyOcrStatus,
} from "@/lib/study-assistant";
import {
  callStudyAssistantChat,
  callStudyAssistantModel,
} from "@/lib/study-model";

interface StudyExamParserContext {
  title?: string;
  subject?: string;
  grade?: string;
  examDate?: string;
  qualityHints?: string[];
}

interface StructuredExamPayload {
  title?: string;
  subject?: string;
  grade?: string;
  examDate?: string;
  rawText?: string;
  tags?: string[];
  questions?: StudyExamQuestion[];
}

interface VisionPageOcrPayload {
  pageNumber?: number;
  subject?: string;
  grade?: string;
  rawText?: string;
  studentWork?: string;
  teacherAnnotations?: string[];
  visibleScores?: string[];
  tags?: string[];
  confidence?: number;
  qualityWarnings?: string[];
  needsReview?: boolean;
}

interface HeuristicQuestionBlock {
  questionNumber: string;
  blockText: string;
}

interface HeuristicQuestionCandidate extends StudyExamQuestion {
  sourcePageNumber: number;
}

export interface ParsedStudyExamResult {
  title: string;
  subject: string;
  grade: string;
  examDate: string;
  rawText: string;
  questions: StudyExamQuestion[];
  tags: string[];
  ocrStatus: StudyOcrStatus;
  parserMode: "provided_text" | "text_model" | "pdf_text" | "vision" | "unparsed";
}

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

function clampConfidence(value: unknown): number {
  const parsed = asNumber(value);
  if (parsed === null) {
    return 0.8;
  }

  return Math.max(0, Math.min(1, parsed));
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => asString(item))
    .filter((item) => item.length > 0);
}

function normalizeStructuredQuestions(value: unknown): StudyExamQuestion[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item, index) => {
      const source = (item || {}) as Record<string, unknown>;
      const stem = asString(source.stem);
      const studentAnswer = asString(source.studentAnswer);
      const correctAnswer = asString(source.correctAnswer);
      const teacherComment = asString(source.teacherComment);
      const questionNumber = asString(source.questionNumber) || String(index + 1);
      const score = asNumber(source.score);
      const maxScore = asNumber(source.maxScore);

      if (!stem && !studentAnswer && !teacherComment && score === null && maxScore === null) {
        return null;
      }

      return {
        questionNumber,
        stem,
        studentAnswer,
        correctAnswer,
        score,
        maxScore,
        knowledgePoints: asStringArray(source.knowledgePoints),
        teacherComment,
        isWrong:
          typeof source.isWrong === "boolean"
            ? source.isWrong
            : score !== null && maxScore !== null
              ? score < maxScore
              : null,
      } satisfies StudyExamQuestion;
    })
    .filter((item): item is StudyExamQuestion => Boolean(item));
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }

  return text.slice(0, maxLength);
}

function extractJsonObject(text: string): StructuredExamPayload | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    return null;
  }

  try {
    return JSON.parse(match[0]) as StructuredExamPayload;
  } catch {
    return null;
  }
}

function normalizeStructuredPayload(
  payload: StructuredExamPayload | null,
  context: StudyExamParserContext
): ParsedStudyExamResult {
  const inferredSubject = asString(payload?.subject);
  const inferredGrade = asString(payload?.grade);
  const inferredTitle = asString(payload?.title);

  return {
    title: asString(context.title) || inferredTitle,
    subject: asString(context.subject) || inferredSubject,
    grade: asString(context.grade) || inferredGrade,
    examDate: asString(payload?.examDate) || asString(context.examDate) || new Date().toISOString(),
    rawText: asString(payload?.rawText),
    questions: normalizeStructuredQuestions(payload?.questions),
    tags: asStringArray(payload?.tags),
    ocrStatus: "ready",
    parserMode: "text_model",
  };
}

function isImageMimeType(mimeType: string): boolean {
  return /^image\//i.test(mimeType);
}

function isPdfMimeType(mimeType: string, fileName: string): boolean {
  return mimeType === "application/pdf" || fileName.toLowerCase().endsWith(".pdf");
}

function buildExamExtractionSchemaInstructions(): string {
  return [
    "Return valid JSON only.",
    "Do not wrap the JSON in markdown.",
    "Use this shape exactly:",
    JSON.stringify(
      {
        title: "string",
        subject: "string",
        grade: "string",
        examDate: "ISO date string or empty string",
        rawText: "clean extracted text",
        tags: ["topic"],
        questions: [
          {
            questionNumber: "1",
            stem: "question text",
            studentAnswer: "student answer if visible, else empty string",
            correctAnswer: "correct answer if explicitly visible, else empty string",
            score: 2,
            maxScore: 5,
            knowledgePoints: ["topic"],
            teacherComment: "marker comment if visible, else empty string",
            isWrong: true,
          },
        ],
      },
      null,
      2
    ),
    "If a field is not visible or not reliable, use an empty string, an empty array, or null for score/maxScore.",
    "Preserve IB-specific details such as Paper number, HL/SL, command terms, question numbering, and any visible score annotations.",
    "If a page starts with subquestions such as (b), (c), or (iii) before the next printed top-level question, keep them as continuation subquestions of the previous question number when that is clear.",
    "Distinguish between the student's own writing and the teacher's annotations.",
    "Put the student's calculations, final answers, and handwriting into studentAnswer.",
    "Put teacher ticks, crosses, circled scores, deductions, rewritten corrections, and written remarks into teacherComment.",
    "Do not attach global answer-sheet tables, score breakdown rows, section totals, or candidate/teacher-use tables to a specific question unless the annotation clearly names that question.",
    "Do not treat teacher annotations as the student's answer.",
    "Only fill correctAnswer when an official printed answer or clearly explicit correction is visible.",
    "Infer the most likely subject and grade/level from the uploaded exam evidence when the known subject or known grade is unknown.",
    "For subject, prefer one of: Mathematics, Physics, Chemistry, Biology, Economics, Computer Science, Business Management, English.",
    "For grade, prefer one of: HL, SL, IBDP, MYP, Other.",
  ].join("\n");
}

function extractJson<T>(text: string): T | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    return null;
  }

  try {
    return JSON.parse(match[0]) as T;
  } catch {
    return null;
  }
}

function buildVisionTimeoutMs(): number {
  const configured = Number(process.env.STUDY_ASSISTANT_VISION_TIMEOUT_MS || "");
  if (Number.isFinite(configured) && configured > 0) {
    return configured;
  }

  return 120_000;
}

function buildVisionConcurrency(fileCount: number): number {
  const configured = Number(process.env.STUDY_ASSISTANT_VISION_CONCURRENCY || "");
  if (Number.isFinite(configured) && configured > 0) {
    return Math.max(1, Math.min(fileCount, Math.floor(configured)));
  }

  return Math.max(1, Math.min(fileCount, 5));
}

function normalizeVisionPagePayload(
  payload: VisionPageOcrPayload | null,
  pageNumber: number
): Required<VisionPageOcrPayload> {
  return {
    pageNumber,
    subject: asString(payload?.subject),
    grade: asString(payload?.grade),
    rawText: asString(payload?.rawText),
    studentWork: asString(payload?.studentWork),
    teacherAnnotations: asStringArray(payload?.teacherAnnotations),
    visibleScores: asStringArray(payload?.visibleScores),
    tags: asStringArray(payload?.tags),
    confidence: clampConfidence(payload?.confidence),
    qualityWarnings: asStringArray(payload?.qualityWarnings),
    needsReview: payload?.needsReview === true,
  };
}

function cleanInlineText(value: string): string {
  return value
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeHeuristicQuestionNumber(value: string): string {
  const normalized = asString(value).replace(/\s+/g, "").replace(/^q/i, "");
  const match = normalized.match(/^0*(\d{1,2})(?:\(([a-zivx]{1,4})\))?$/i);
  if (!match) {
    return "";
  }

  const numeric = Number(match[1]);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return "";
  }

  const subpart = match[2]?.toLowerCase();
  return subpart ? `${numeric}(${subpart})` : String(numeric);
}

function buildQuestionPrefixPattern(questionNumber: string): RegExp {
  const normalizedNumber = normalizeHeuristicQuestionNumber(questionNumber);
  const match = normalizedNumber.match(/^(\d{1,2})(?:\(([a-zivx]{1,4})\))?$/i);
  if (!match) {
    return /^$/;
  }

  const number = escapeRegExp(match[1]);
  const subpart = match[2] ? escapeRegExp(match[2]) : "";
  if (subpart) {
    return new RegExp(`^(?:${number}\\s*)?\\(${subpart}\\)\\s*`, "i");
  }

  return new RegExp(`^${number}(?:[.)]|\\s+)\\s*`, "i");
}

function stripQuestionPrefix(blockText: string, questionNumber: string): string {
  return cleanInlineText(blockText).replace(buildQuestionPrefixPattern(questionNumber), "");
}

function normalizeQuestionBlockBoundaries(text: string): string {
  const commonOpeners =
    "(?:\\[\\s*maximum|what|which|state|calculate|find|show|describe|explain|determine|consider|given|using|hence|draw|write|sketch|evaluate|prove|solve|fig\\.|figure|a\\b|an\\b|the\\b|in\\s+order)";

  return cleanInlineText(text).replace(
    new RegExp(`\\s+(\\d{1,2})(?:[.)]|\\s+)\\s*(?=${commonOpeners})`, "gi"),
    "\n$1 "
  );
}

function startsWithLikelyQuestionText(text: string): boolean {
  const firstLine = cleanInlineText(text).split("\n").find(Boolean) || "";
  if (!firstLine) {
    return false;
  }

  if (/^(?:cm|mm|m|kg|g|s|ms|metal\s+sheet|highest\s+point)\b/i.test(firstLine)) {
    return false;
  }

  return /^(?:\[\s*maximum|\([a-zivx]{1,4}\)|what|which|state|calculate|find|show|describe|explain|determine|consider|given|using|hence|draw|write|sketch|evaluate|prove|solve|fig\.|figure|a\b|an\b|the\b|in\s+order)\b/i.test(
    firstLine
  );
}

function isLikelyQuestionBlock(blockText: string, questionNumber: string): boolean {
  const normalizedNumber = normalizeHeuristicQuestionNumber(questionNumber);
  if (!normalizedNumber) {
    return false;
  }

  const withoutLeadingNumber = stripQuestionPrefix(blockText, normalizedNumber);

  if (!withoutLeadingNumber || withoutLeadingNumber.length < 10) {
    return false;
  }

  if (/^\d+\s*\/\s*\d+$/.test(withoutLeadingNumber)) {
    return false;
  }

  return (
    startsWithLikelyQuestionText(withoutLeadingNumber) &&
    (/[A-Za-z]/.test(withoutLeadingNumber) || /\[(\d{1,3})\]/.test(blockText))
  );
}

function splitTopLevelQuestionBlocks(text: string): HeuristicQuestionBlock[] {
  const normalized = normalizeQuestionBlockBoundaries(text);
  if (!normalized) {
    return [];
  }

  const pattern = /(?:^|\n)\s*(\d{1,2})(?:[.)]|\s+)/g;
  const matches = [...normalized.matchAll(pattern)];

  if (matches.length === 0) {
    return [];
  }

  const blocks: HeuristicQuestionBlock[] = [];
  for (let index = 0; index < matches.length; index += 1) {
    const current = matches[index];
    const next = matches[index + 1];
    const start = current.index ?? 0;
    const end = next?.index ?? normalized.length;
    const blockText = normalized.slice(start, end).trim();
    const questionNumber = normalizeHeuristicQuestionNumber(current[1]);

    if (!blockText || !questionNumber || !isLikelyQuestionBlock(blockText, questionNumber)) {
      continue;
    }

    blocks.push({
      questionNumber,
      blockText,
    });
  }

  return blocks;
}

function splitLeadingContinuationSubquestionBlocks(text: string): HeuristicQuestionBlock[] {
  const normalized = normalizeQuestionBlockBoundaries(text);
  if (!normalized) {
    return [];
  }

  const topLevelMatches = [...normalized.matchAll(/(?:^|\n)\s*(\d{1,2})(?:[.)]|\s+)/g)];
  const firstTopLevel = topLevelMatches[0];
  const firstTopLevelIndex = firstTopLevel?.index ?? -1;
  if (!firstTopLevel || firstTopLevelIndex <= 0) {
    return [];
  }

  const nextTopLevelNumber = Number(firstTopLevel[1]);
  if (!Number.isFinite(nextTopLevelNumber) || nextTopLevelNumber <= 1) {
    return [];
  }

  const inferredParentQuestion = String(nextTopLevelNumber - 1);
  const leadingText = normalized.slice(0, firstTopLevelIndex).trim();
  if (!leadingText || leadingText.length < 20) {
    return [];
  }

  const subquestionMatches = [...leadingText.matchAll(/(?:^|\n|[.!?]\s+)\(([a-z]|[ivx]{1,4})\)\s+/gi)];
  if (subquestionMatches.length === 0) {
    return [];
  }

  const blocks: HeuristicQuestionBlock[] = [];
  for (let index = 0; index < subquestionMatches.length; index += 1) {
    const current = subquestionMatches[index];
    const next = subquestionMatches[index + 1];
    const start = current.index ?? 0;
    const end = next?.index ?? leadingText.length;
    const part = current[1].toLowerCase();
    const questionNumber = normalizeHeuristicQuestionNumber(`${inferredParentQuestion}(${part})`);
    const blockText = leadingText.slice(start, end).trim();

    if (!questionNumber || blockText.length < 20 || !/[A-Za-z]/.test(blockText)) {
      continue;
    }

    blocks.push({
      questionNumber,
      blockText,
    });
  }

  return blocks;
}

function extractStemFromBlock(blockText: string, questionNumber: string): string {
  const normalized = cleanInlineText(blockText);
  const withoutLeadingNumber = normalized.replace(buildQuestionPrefixPattern(questionNumber), "");
  const lines = withoutLeadingNumber
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return "";
  }

  const firstLine = lines[0];
  if (lines.length === 1) {
    return firstLine;
  }

  const secondLine = lines[1];
  if (/^\([ivx]+\)/i.test(secondLine)) {
    return [firstLine, secondLine].join("\n");
  }

  return firstLine;
}

function isGlobalScoreOrAnswerSheetText(value: string): boolean {
  const text = asString(value);
  if (!text) {
    return false;
  }

  const lower = text.toLowerCase();
  if (
    /score\s*breakdown|for teacher'?s use only|answer\s*sheet|section\s+[ab]\b|question\s+1\s+2\s+3|total\s*$/i.test(
      lower
    )
  ) {
    return true;
  }

  const numericTokens = text.match(/\b\d{1,3}\b/g) || [];
  return numericTokens.length >= 6 && !/(q\d|question\s*\d|tick|cross|wrong|correct|deduct|\/|-)/i.test(text);
}

function filterQuestionLevelAnnotations(values: string[]): string[] {
  return values
    .map((value) => asString(value))
    .filter((value) => value.length > 0 && !isGlobalScoreOrAnswerSheetText(value));
}

function buildQuestionReferencePattern(questionNumber: string): RegExp {
  const normalizedNumber = normalizeHeuristicQuestionNumber(questionNumber);
  const match = normalizedNumber.match(/^(\d{1,2})(?:\(([a-zivx]{1,4})\))?$/i);
  if (!match) {
    return /^$/;
  }

  const number = escapeRegExp(match[1]);
  const subpart = match[2] ? escapeRegExp(match[2]) : "";
  if (subpart) {
    return new RegExp(
      `(?:\\b(?:q|question|题)\\s*0*${number}\\s*(?:\\(${subpart}\\)|${subpart})?\\b|^\\s*0*${number}\\s*(?:\\(${subpart}\\)|${subpart})?(?:[.:)]|\\s+(?:wrong|cross|incorrect|deduct|扣分|错)))`,
      "i"
    );
  }

  return new RegExp(
    `(?:\\b(?:q|question|题)\\s*0*${number}\\b|^\\s*0*${number}(?:[.:)]|\\s+(?:wrong|cross|incorrect|deduct|扣分|错)))`,
    "i"
  );
}

function buildQuestionLevelTeacherComment(
  page: Required<VisionPageOcrPayload>,
  questionNumber: string,
  questionCountOnPage: number
): string {
  const annotationPool = filterQuestionLevelAnnotations(page.teacherAnnotations);
  const scorePool = filterQuestionLevelAnnotations(page.visibleScores);
  const questionReferencePattern = buildQuestionReferencePattern(questionNumber);
  const directMatches = annotationPool.filter((annotation) =>
    questionReferencePattern.test(annotation)
  );

  if (directMatches.length > 0) {
    return cleanInlineText(directMatches.join("\n"));
  }

  if (questionCountOnPage === 1) {
    const combined = [...annotationPool, ...scorePool];
    return cleanInlineText(combined.join("\n"));
  }

  return "";
}

function inferQuestionWrongness(
  teacherComment: string,
  score: number | null,
  maxScore: number | null
): boolean | null {
  if (score !== null && maxScore !== null) {
    return score < maxScore;
  }

  if (!teacherComment) {
    return null;
  }

  if (/(cross|wrong|deduct|incorrect|correction|corrected|改正|错|扣分|叉|-\s*\d{1,2}\b)/i.test(teacherComment)) {
    return true;
  }

  if (/(tick|correct|well done|good)/i.test(teacherComment)) {
    return false;
  }

  return null;
}

function appendUniqueText(existing: string, incoming: string): string {
  const normalizedExisting = cleanInlineText(existing);
  const normalizedIncoming = cleanInlineText(incoming);

  if (!normalizedIncoming) {
    return normalizedExisting;
  }

  if (!normalizedExisting) {
    return normalizedIncoming;
  }

  if (
    normalizedExisting.includes(normalizedIncoming) ||
    normalizedIncoming.includes(normalizedExisting)
  ) {
    return normalizedExisting.length >= normalizedIncoming.length
      ? normalizedExisting
      : normalizedIncoming;
  }

  return `${normalizedExisting}\n\n${normalizedIncoming}`;
}

function mergeQuestionRecord(
  existing: StudyExamQuestion,
  incoming: StudyExamQuestion
): StudyExamQuestion {
  const mergedScore =
    incoming.score !== null
      ? incoming.score
      : existing.score !== null
        ? existing.score
        : null;
  const mergedMaxScore = Math.max(existing.maxScore || 0, incoming.maxScore || 0) || null;
  const mergedTeacherComment = appendUniqueText(existing.teacherComment, incoming.teacherComment);

  return {
    questionNumber: existing.questionNumber,
    stem: appendUniqueText(existing.stem, incoming.stem),
    studentAnswer: appendUniqueText(existing.studentAnswer, incoming.studentAnswer),
    correctAnswer: appendUniqueText(existing.correctAnswer, incoming.correctAnswer),
    score: mergedScore,
    maxScore: mergedMaxScore,
    knowledgePoints: [...new Set([...existing.knowledgePoints, ...incoming.knowledgePoints])],
    teacherComment: mergedTeacherComment,
    isWrong:
      typeof existing.isWrong === "boolean" || typeof incoming.isWrong === "boolean"
        ? Boolean(existing.isWrong) || Boolean(incoming.isWrong)
        : inferQuestionWrongness(mergedTeacherComment, mergedScore, mergedMaxScore),
  };
}

function shouldMergeQuestionCandidates(
  existing: HeuristicQuestionCandidate,
  incoming: HeuristicQuestionCandidate
): boolean {
  if (existing.questionNumber !== incoming.questionNumber) {
    return false;
  }

  if (existing.sourcePageNumber === incoming.sourcePageNumber) {
    return false;
  }

  if (Math.abs(existing.sourcePageNumber - incoming.sourcePageNumber) > 1) {
    return false;
  }

  const existingStem = cleanInlineText(existing.stem).toLowerCase();
  const incomingStem = cleanInlineText(incoming.stem).toLowerCase();

  if (!existingStem || !incomingStem) {
    return true;
  }

  return (
    existingStem === incomingStem ||
    existingStem.includes(incomingStem) ||
    incomingStem.includes(existingStem)
  );
}

function mergeDuplicateQuestionsAcrossPages(
  questions: HeuristicQuestionCandidate[]
): StudyExamQuestion[] {
  const merged: HeuristicQuestionCandidate[] = [];

  for (const question of questions) {
    const normalizedQuestionNumber = normalizeHeuristicQuestionNumber(question.questionNumber);
    if (!normalizedQuestionNumber) {
      continue;
    }

    const normalizedQuestion: HeuristicQuestionCandidate = {
      ...question,
      questionNumber: normalizedQuestionNumber,
      stem: cleanInlineText(question.stem),
      studentAnswer: cleanInlineText(question.studentAnswer),
      correctAnswer: cleanInlineText(question.correctAnswer),
      teacherComment: cleanInlineText(question.teacherComment),
    };

    const existingIndex = merged.findIndex((candidate) =>
      shouldMergeQuestionCandidates(candidate, normalizedQuestion)
    );

    if (existingIndex === -1) {
      merged.push(normalizedQuestion);
      continue;
    }

    const existing = merged[existingIndex];
    merged[existingIndex] = {
      ...mergeQuestionRecord(existing, normalizedQuestion),
      sourcePageNumber: Math.max(existing.sourcePageNumber, normalizedQuestion.sourcePageNumber),
    };
  }

  return merged.map(({ sourcePageNumber: _sourcePageNumber, ...question }) => question);
}

function buildHeuristicQuestionsFromVisionPages(
  pages: Array<Required<VisionPageOcrPayload>>
): StudyExamQuestion[] {
  const questions: HeuristicQuestionCandidate[] = [];

  for (const page of pages) {
    const ocrBlocks = [
      ...splitLeadingContinuationSubquestionBlocks(page.rawText),
      ...splitTopLevelQuestionBlocks(page.rawText),
    ];
    const workBlocks = [
      ...splitLeadingContinuationSubquestionBlocks(page.studentWork),
      ...splitTopLevelQuestionBlocks(page.studentWork),
    ];
    const workByQuestion = new Map(workBlocks.map((block) => [block.questionNumber, block.blockText]));

    for (const block of ocrBlocks) {
      const stem = extractStemFromBlock(block.blockText, block.questionNumber);
      const fallbackStudentAnswer = cleanInlineText(
        block.blockText.replace(buildQuestionPrefixPattern(block.questionNumber), "")
      );
      const studentAnswer = cleanInlineText(
        workByQuestion.get(block.questionNumber) || fallbackStudentAnswer
      );
      const teacherComment = buildQuestionLevelTeacherComment(
        page,
        block.questionNumber,
        ocrBlocks.length
      );
      const maxScoreMatch = block.blockText.match(/\[(\d{1,3})\]/);
      const maxScore = maxScoreMatch ? Number(maxScoreMatch[1]) : null;
      const scoreMatch = teacherComment.match(/(\d+)\s*\/\s*(\d+)/);
      const matchedScore = scoreMatch ? Number(scoreMatch[1]) : null;
      const matchedMaxScore = scoreMatch ? Number(scoreMatch[2]) : null;
      const hasValidScorePair =
        matchedScore !== null &&
        matchedMaxScore !== null &&
        matchedMaxScore > 0 &&
        matchedScore >= 0 &&
        matchedScore <= matchedMaxScore;
      const score = hasValidScorePair ? matchedScore : null;
      const resolvedMaxScore = hasValidScorePair ? matchedMaxScore : maxScore;

      if (!stem && !studentAnswer && !teacherComment) {
        continue;
      }

      questions.push({
        questionNumber: block.questionNumber,
        stem,
        studentAnswer,
        correctAnswer: "",
        score,
        maxScore: resolvedMaxScore,
        knowledgePoints: [],
        teacherComment,
        isWrong: inferQuestionWrongness(teacherComment, score, resolvedMaxScore),
        sourcePageNumber: page.pageNumber,
      });
    }
  }

  return mergeDuplicateQuestionsAcrossPages(
    questions.map((question) => ({
      ...question,
      correctAnswer: question.correctAnswer || "",
    }))
  );
}

async function transcribeVisionPage(
  file: File,
  context: StudyExamParserContext,
  pageNumber: number
): Promise<Required<VisionPageOcrPayload>> {
  console.info("[study-parser] starting page OCR", {
    pageNumber,
    fileName: file.name,
    size: file.size,
  });
  const buffer = Buffer.from(await file.arrayBuffer());
  const mimeType = file.type || "image/jpeg";
  const dataUrl = `data:${mimeType};base64,${buffer.toString("base64")}`;
  const qualityHint = asString(context.qualityHints?.[pageNumber - 1]);
  const response = await callStudyAssistantChat(
    [
      {
        role: "system",
        content:
          "You are a careful IB exam OCR assistant. Extract only visible content from the page. Separate student handwriting from teacher annotations. Return JSON only.",
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: [
              `This is page ${pageNumber} of one student's exam paper.`,
              "Return valid JSON only.",
              "Use this shape exactly:",
              JSON.stringify(
                {
                  pageNumber,
                  subject: "string",
                  grade: "string",
                  rawText: "full readable printed text plus readable handwriting",
                  studentWork: "student calculations and final answers on this page",
                  teacherAnnotations: ["teacher comments, ticks, crosses, circled marks, red annotations"],
                  visibleScores: ["4/6", "-1", "tick", "cross"],
                  tags: ["topic"],
                  confidence: 0.82,
                  qualityWarnings: ["blurred area near question 2", "two pages in one photo"],
                  needsReview: false,
                },
                null,
                2
              ),
              `Known title: ${context.title || "unknown"}`,
              `Known subject: ${context.subject || "unknown"}`,
              `Known grade/level: ${context.grade || "unknown"}`,
              qualityHint ? `Client image quality report: ${qualityHint}` : "",
              "When client_preprocessed=true, trust the enhanced crop as the OCR source, but keep uncertainty warnings if the crop looks incomplete.",
              "When auto_split_from/crop_region appears in the quality report, this image is one side of a wider photo. Treat it as a single page/crop and do not infer content from the missing opposite side.",
              "If the image quality report has warnings, use extra caution and mark needsReview=true when any question/score is uncertain.",
              "If the photo is tilted, cropped, blurry, shadowed, reflective, or contains two pages, extract only what is confidently readable and list the problem in qualityWarnings.",
              "Do not guess missing question numbers, marks, student answers, or teacher corrections. Use empty strings/arrays for unreadable parts.",
              "If a handwritten mark could be either student work or teacher annotation, put it in teacherAnnotations only when the ink/color/placement clearly indicates teacher feedback.",
              "Keep teacher remarks separate from the student work.",
              "If the page contains an answer sheet, score breakdown row, or teacher-use total table, keep that in rawText only; do not attach it to one visible question.",
              "If the page is a continuation and begins with subquestions such as (b), (c), or (iii), preserve those labels in rawText and studentWork.",
              "If there are no teacher annotations, return an empty array for teacherAnnotations.",
            ].join("\n"),
          },
          {
            type: "image_url",
            image_url: {
              url: dataUrl,
            },
          },
        ],
      },
    ],
    {
      temperature: 0.1,
      maxTokens: 1200,
      timeoutMs: buildVisionTimeoutMs(),
      requestLabel: `study-vision-page-${pageNumber}`,
      modelId:
        process.env.STUDY_ASSISTANT_VISION_MODEL_ID ||
        process.env.STUDY_ASSISTANT_MODEL_ID ||
        process.env.ALIBABA_BAILIAN_MODEL_ID ||
        "qwen-plus",
      apiUrl:
        process.env.STUDY_ASSISTANT_VISION_API_URL ||
        process.env.STUDY_ASSISTANT_API_URL ||
        "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
    }
  );

  const normalized = normalizeVisionPagePayload(extractJson<VisionPageOcrPayload>(response), pageNumber);
  console.info("[study-parser] finished page OCR", {
    pageNumber,
    rawTextLength: normalized.rawText.length,
    teacherAnnotationCount: normalized.teacherAnnotations.length,
    scoreCount: normalized.visibleScores.length,
    confidence: normalized.confidence,
    needsReview: normalized.needsReview,
  });
  return normalized;
}

async function mapWithConcurrency<TInput, TOutput>(
  items: TInput[],
  concurrency: number,
  worker: (item: TInput, index: number) => Promise<TOutput>
): Promise<PromiseSettledResult<TOutput>[]> {
  const results: PromiseSettledResult<TOutput>[] = new Array(items.length);
  let nextIndex = 0;

  async function runWorker() {
    while (true) {
      const currentIndex = nextIndex;
      nextIndex += 1;

      if (currentIndex >= items.length) {
        return;
      }

      try {
        const value = await worker(items[currentIndex], currentIndex);
        results[currentIndex] = {
          status: "fulfilled",
          value,
        };
      } catch (error) {
        results[currentIndex] = {
          status: "rejected",
          reason: error,
        };
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, () => runWorker())
  );

  return results;
}

function mergePageOcrResults(
  pages: Array<Required<VisionPageOcrPayload>>,
  context: StudyExamParserContext
): { rawText: string; subject: string; grade: string; tags: string[] } {
  const firstSubject = pages.map((page) => page.subject).find((item) => item.length > 0) || "";
  const firstGrade = pages.map((page) => page.grade).find((item) => item.length > 0) || "";
  const mergedRawText = pages
    .map((page) =>
      [
        `[Page ${page.pageNumber}]`,
        page.confidence < 0.75 || page.needsReview || page.qualityWarnings.length > 0
          ? `OCR quality:\nconfidence=${page.confidence.toFixed(2)}\nneedsReview=${page.needsReview ? "yes" : "no"}${
              page.qualityWarnings.length > 0 ? `\nwarnings=${page.qualityWarnings.join("; ")}` : ""
            }`
          : "",
        page.rawText ? `OCR text:\n${page.rawText}` : "",
        page.studentWork ? `Student work:\n${page.studentWork}` : "",
        page.teacherAnnotations.length > 0
          ? `Teacher annotations:\n${page.teacherAnnotations.join("\n")}`
          : "Teacher annotations:\nNone visible",
        page.visibleScores.length > 0 ? `Visible scores:\n${page.visibleScores.join(", ")}` : "",
      ]
        .filter(Boolean)
        .join("\n\n")
    )
    .join("\n\n");

  return {
    rawText: mergedRawText,
    subject: asString(context.subject) || firstSubject,
    grade: asString(context.grade) || firstGrade,
    tags: [...new Set(pages.flatMap((page) => page.tags).filter((item) => item.length > 0))],
  };
}

async function structureExamText(
  rawText: string,
  context: StudyExamParserContext,
  parserMode: ParsedStudyExamResult["parserMode"]
): Promise<ParsedStudyExamResult> {
  const prompt = [
    "You are extracting structured IB exam evidence from text.",
    buildExamExtractionSchemaInstructions(),
    "",
    `Known title: ${context.title || "unknown"}`,
    `Known subject: ${context.subject || "unknown"}`,
    `Known grade/level: ${context.grade || "unknown"}`,
    `Known exam date: ${context.examDate || "unknown"}`,
    "",
    "Exam text:",
    truncate(rawText, 18000),
  ].join("\n");

  const response = await callStudyAssistantModel(prompt, {
    systemPrompt:
      "You extract structured IB exam evidence from OCR text. Be conservative, do not invent scores or answers, keep student work separate from teacher comments, and return JSON only.",
    temperature: 0.1,
    maxTokens: 2600,
    timeoutMs: 90_000,
    requestLabel: `study-text-structuring-${parserMode}`,
    modelId:
      process.env.STUDY_ASSISTANT_EXAM_PARSER_MODEL_ID ||
      process.env.STUDY_ASSISTANT_MODEL_ID ||
      process.env.ALIBABA_BAILIAN_MODEL_ID ||
      "qwen-plus",
  });

  const parsed = normalizeStructuredPayload(extractJsonObject(response), context);
  const mergedRawText = parsed.rawText || rawText;

  return {
    ...parsed,
    rawText: mergedRawText,
    ocrStatus: mergedRawText || parsed.questions.length > 0 ? "ready" : "pending",
    parserMode,
  };
}

async function extractPdfText(file: File): Promise<string> {
  try {
    const pdfParseModule = (await import("pdf-parse")) as unknown as {
      default?: (buffer: Buffer) => Promise<{ text?: string }>;
    };
    const pdfParse =
      typeof pdfParseModule.default === "function" ? pdfParseModule.default : null;

    if (!pdfParse) {
      return "";
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await pdfParse(buffer);
    return asString(result?.text);
  } catch (error) {
    console.warn("Failed to extract PDF text for study exam upload:", error);
    return "";
  }
}

async function extractSingleImageStructuredFromVision(
  file: File,
  context: StudyExamParserContext
): Promise<ParsedStudyExamResult> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const mimeType = file.type || "image/jpeg";
  const dataUrl = `data:${mimeType};base64,${buffer.toString("base64")}`;
  const qualityHint = asString(context.qualityHints?.[0]);

  const response = await callStudyAssistantChat(
    [
      {
        role: "system",
        content:
          "You are a careful IB exam parser. Extract only what is visible in the image. Keep student work separate from teacher annotations. Return JSON only.",
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: [
              "Extract structured evidence from this IB exam image or answer-sheet image.",
              buildExamExtractionSchemaInstructions(),
              "",
              `Known title: ${context.title || "unknown"}`,
              `Known subject: ${context.subject || "unknown"}`,
              `Known grade/level: ${context.grade || "unknown"}`,
              `Known exam date: ${context.examDate || "unknown"}`,
              qualityHint ? `Client image quality report: ${qualityHint}` : "",
              "",
              "When auto_split_from/crop_region appears in the quality report, this image is one side of a wider photo. Treat it as a single page/crop and do not infer content from the missing opposite side.",
              "If the image quality report has warnings, be conservative: do not invent missing scores, answers, or question text.",
              "If the photo contains two pages or is cropped/blurred, extract only confidently readable evidence.",
              "Student handwriting should go into studentAnswer.",
              "Teacher ticks, circles, crosses, red comments, score deductions, and correction notes should go into teacherComment.",
              "Do not attach answer-sheet score tables or teacher-use total rows to one question unless they clearly identify that question.",
            ].join("\n"),
          },
          {
            type: "image_url",
            image_url: {
              url: dataUrl,
            },
          },
        ],
      },
    ],
    {
      temperature: 0.1,
      maxTokens: 2200,
      timeoutMs: buildVisionTimeoutMs(),
      requestLabel: "study-vision-single-page",
      modelId:
        process.env.STUDY_ASSISTANT_VISION_MODEL_ID ||
        process.env.STUDY_ASSISTANT_MODEL_ID ||
        process.env.ALIBABA_BAILIAN_MODEL_ID ||
        "qwen-plus",
      apiUrl:
        process.env.STUDY_ASSISTANT_VISION_API_URL ||
        process.env.STUDY_ASSISTANT_API_URL ||
        "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
    }
  );

  const parsed = normalizeStructuredPayload(extractJsonObject(response), context);
  return {
    ...parsed,
    ocrStatus: parsed.rawText || parsed.questions.length > 0 ? "ready" : "pending",
    parserMode: "vision",
  };
}

async function extractMultiPageFromVision(
  files: File[],
  context: StudyExamParserContext
): Promise<ParsedStudyExamResult> {
  console.info("[study-parser] starting multi-page OCR", {
    fileCount: files.length,
    concurrency: buildVisionConcurrency(files.length),
  });
  const settled = await mapWithConcurrency(
    files,
    buildVisionConcurrency(files.length),
    async (file, index) => transcribeVisionPage(file, context, index + 1)
  );
  const fulfilledPages = settled
    .filter(
      (item): item is PromiseFulfilledResult<Required<VisionPageOcrPayload>> =>
        item.status === "fulfilled"
    )
    .map((item) => item.value)
    .filter((item) => item.rawText || item.studentWork || item.teacherAnnotations.length > 0);
  console.info("[study-parser] multi-page OCR completed", {
    fulfilledPages: fulfilledPages.length,
    rejectedPages: settled.filter((item) => item.status === "rejected").length,
  });

  if (fulfilledPages.length === 0) {
    return {
      title: asString(context.title),
      subject: asString(context.subject),
      grade: asString(context.grade),
      examDate: asString(context.examDate) || new Date().toISOString(),
      rawText: "",
      questions: [],
      tags: [],
      ocrStatus: "pending",
      parserMode: "unparsed",
    };
  }

  const merged = mergePageOcrResults(fulfilledPages, context);
  const heuristicQuestions = buildHeuristicQuestionsFromVisionPages(fulfilledPages);
  return {
    title: asString(context.title),
    subject: merged.subject || asString(context.subject),
    grade: merged.grade || asString(context.grade),
    examDate: asString(context.examDate) || new Date().toISOString(),
    rawText: merged.rawText,
    questions: heuristicQuestions,
    tags: merged.tags,
    ocrStatus: merged.rawText ? "ready" : "pending",
    parserMode: "vision",
  };
}

export async function parseUploadedStudyExam(
  inputFiles: File | File[],
  context: StudyExamParserContext,
  providedText = ""
): Promise<ParsedStudyExamResult> {
  const files = Array.isArray(inputFiles) ? inputFiles.filter(Boolean) : [inputFiles];
  const normalizedProvidedText = asString(providedText);
  if (normalizedProvidedText) {
    return structureExamText(normalizedProvidedText, context, "provided_text");
  }

  if (files.length > 0 && files.every((file) => isImageMimeType(file.type || ""))) {
    if (files.length === 1) {
      return extractSingleImageStructuredFromVision(files[0], context);
    }

    return extractMultiPageFromVision(files, context);
  }

  const file = files[0];
  if (!file) {
    return {
      title: asString(context.title),
      subject: asString(context.subject),
      grade: asString(context.grade),
      examDate: asString(context.examDate) || new Date().toISOString(),
      rawText: "",
      questions: [],
      tags: [],
      ocrStatus: "pending",
      parserMode: "unparsed",
    };
  }

  if (isPdfMimeType(file.type || "", file.name)) {
    const rawText = await extractPdfText(file);
    if (rawText) {
      return structureExamText(rawText, context, "pdf_text");
    }
  }

  return {
    title: asString(context.title),
    subject: asString(context.subject),
    grade: asString(context.grade),
    examDate: asString(context.examDate) || new Date().toISOString(),
    rawText: "",
    questions: [],
    tags: [],
    ocrStatus: "pending",
    parserMode: "unparsed",
  };
}
