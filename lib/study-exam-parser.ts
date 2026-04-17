import {
  StudyExamQuestion,
  StudyOcrStatus,
} from "@/lib/study-assistant";
import {
  callStudyAssistantChat,
  callStudyAssistantModel,
  StudyChatContentPart,
} from "@/lib/study-model";

interface StudyExamParserContext {
  title?: string;
  subject?: string;
  grade?: string;
  examDate?: string;
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
    "Infer the most likely subject and grade/level from the uploaded exam evidence when the known subject or known grade is unknown.",
    "For subject, prefer one of: Mathematics, Physics, Chemistry, Biology, Economics, Computer Science, Business Management, English.",
    "For grade, prefer one of: HL, SL, IBDP, MYP, Other.",
  ].join("\n");
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
      "You extract structured IB exam evidence from OCR text. Be conservative, do not invent scores or answers, and return JSON only.",
    temperature: 0.1,
    maxTokens: 2600,
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

async function extractFromVision(
  file: File,
  context: StudyExamParserContext
): Promise<ParsedStudyExamResult> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const mimeType = file.type || "image/jpeg";
  const dataUrl = `data:${mimeType};base64,${buffer.toString("base64")}`;
  const userContent: StudyChatContentPart[] = [
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
        "",
        "Focus on visible question text, student answers, score annotations, teacher comments, and likely weak topics.",
      ].join("\n"),
    },
    {
      type: "image_url",
      image_url: {
        url: dataUrl,
      },
    },
  ];

  const response = await callStudyAssistantChat(
    [
      {
        role: "system",
        content:
          "You are a careful IB exam parser. Extract only what is visible in the image and return JSON only.",
      },
      {
        role: "user",
        content: userContent,
      },
    ],
    {
      temperature: 0.1,
      maxTokens: 2600,
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

export async function parseUploadedStudyExam(
  file: File,
  context: StudyExamParserContext,
  providedText = ""
): Promise<ParsedStudyExamResult> {
  const normalizedProvidedText = asString(providedText);
  if (normalizedProvidedText) {
    return structureExamText(normalizedProvidedText, context, "provided_text");
  }

  if (isImageMimeType(file.type || "")) {
    return extractFromVision(file, context);
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
