import { getUserFromRequest } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { parseUploadedStudyExam } from "@/lib/study-exam-parser";
import {
  STUDY_EXAMS_COLLECTION,
  normalizeExamRecord,
  StudyExamQuestion,
  StudyExamImageQualityReport,
  StudyExamSourceFile,
  StudyPlanningProfile,
} from "@/lib/study-assistant";
import { NextRequest, NextResponse } from "next/server";

function asString(value: FormDataEntryValue | unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseQuestions(value: string): StudyExamQuestion[] {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as StudyExamQuestion[]) : [];
  } catch {
    return [];
  }
}

function parseTags(value: string): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
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

function parseImageQualityReports(value: string): StudyExamImageQualityReport[] {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((item) => {
        const source = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
        const fileName = typeof source.fileName === "string" ? source.fileName.trim() : "";
        const level = typeof source.level === "string" ? source.level.trim() : "";
        const warnings = Array.isArray(source.warnings)
          ? source.warnings
              .map((warning) => (typeof warning === "string" ? warning.trim() : ""))
              .filter((warning) => warning.length > 0)
          : [];

        if (!fileName && !level && warnings.length === 0) {
          return null;
        }

        const originalFileName =
          typeof source.originalFileName === "string" ? source.originalFileName.trim() : "";
        const splitFrom = typeof source.splitFrom === "string" ? source.splitFrom.trim() : "";
        const cropRegion = typeof source.cropRegion === "string" ? source.cropRegion.trim() : "";

        return {
          fileName,
          ...(originalFileName ? { originalFileName } : {}),
          ...(splitFrom ? { splitFrom } : {}),
          ...(cropRegion ? { cropRegion } : {}),
          width: asNumber(source.width),
          height: asNumber(source.height),
          megapixels: asNumber(source.megapixels),
          brightness: asNumber(source.brightness),
          contrast: asNumber(source.contrast),
          sharpness: asNumber(source.sharpness),
          level: level || "unknown",
          warnings,
          processed: source.processed === true,
        } satisfies StudyExamImageQualityReport;
      })
      .filter((item): item is StudyExamImageQualityReport => Boolean(item));
  } catch {
    return [];
  }
}

function buildUploadQualityHint(report: StudyExamImageQualityReport | undefined): string {
  if (!report) {
    return "";
  }

  const metrics = [
    report.width && report.height ? `${report.width}x${report.height}` : "",
    report.megapixels !== null ? `${report.megapixels.toFixed(2)}MP` : "",
    report.brightness !== null ? `brightness=${Math.round(report.brightness)}` : "",
    report.contrast !== null ? `contrast=${Math.round(report.contrast)}` : "",
    report.sharpness !== null ? `sharpness=${Math.round(report.sharpness)}` : "",
    report.splitFrom ? `auto_split_from=${report.splitFrom}` : "",
    report.cropRegion ? `crop_region=${report.cropRegion}` : "",
  ].filter(Boolean);
  const warnings = report.warnings.length > 0 ? `warnings=${report.warnings.join("; ")}` : "";
  const processed = report.processed ? "client_preprocessed=true" : "client_preprocessed=false";

  return [`quality=${report.level}`, ...metrics, processed, warnings].filter(Boolean).join(", ");
}

function parsePlanningProfile(value: unknown): StudyPlanningProfile | undefined {
  if (!value) {
    return undefined;
  }

  if (typeof value === "string") {
    try {
      return JSON.parse(value) as StudyPlanningProfile;
    } catch {
      return undefined;
    }
  }

  if (typeof value === "object") {
    return value as StudyPlanningProfile;
  }

  return undefined;
}

async function parseMultipartExam(request: NextRequest) {
  const formData = await request.formData();
  const files = formData
    .getAll("paper")
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);
  console.info("[study-upload] received multipart exam payload", {
    fileCount: files.length,
    fileNames: files.map((file) => file.name),
  });
  const title = asString(formData.get("title"));
  const subject = asString(formData.get("subject"));
  const grade = asString(formData.get("grade"));
  const examDate = asString(formData.get("examDate")) || new Date().toISOString();
  const providedQuestions = parseQuestions(asString(formData.get("questions")));
  const providedText = asString(formData.get("paperText"));
  const providedTags = parseTags(asString(formData.get("tags")));
  const planningProfile = parsePlanningProfile(asString(formData.get("planningProfile")));
  const imageQualityReports = parseImageQualityReports(asString(formData.get("imageQualityReports")));
  let rawText = providedText;
  let sourceFiles: StudyExamSourceFile[] = [];
  let sourceFile: StudyExamSourceFile | null = null;
  let ocrStatus: "ready" | "pending" | "not_needed" = rawText ? "ready" : "not_needed";
  let questions = providedQuestions;
  let tags = providedTags;
  let inferredTitle = title;
  let inferredSubject = subject;
  let inferredGrade = grade;
  let inferredExamDate = examDate;

  if (files.length > 0) {
    sourceFiles = files.map((file, index) => {
      const qualityReport =
        imageQualityReports[index] ||
        imageQualityReports.find((report) => report.fileName === file.name);

      return {
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        size: file.size,
        ...(qualityReport ? { qualityReport } : {}),
      };
    });
    sourceFile = sourceFiles[0] || null;
    if (imageQualityReports.length > 0) {
      console.info("[study-upload] received image quality reports", {
        reportCount: imageQualityReports.length,
        autoSplitCount: imageQualityReports.filter((report) => Boolean(report.splitFrom)).length,
        riskyCount: imageQualityReports.filter((report) => report.level !== "good").length,
      });
    }

    const textFile = files.find(
      (file) => (file.type || "").startsWith("text/") || file.type === "application/json"
    );

    if (textFile) {
      console.info("[study-upload] using text file as raw OCR input", {
        fileName: textFile.name,
      });
      rawText = rawText || (await textFile.text());
      ocrStatus = "ready";
    } else if (!rawText && providedQuestions.length === 0) {
      console.info("[study-upload] starting AI parsing for uploaded files", {
        fileCount: files.length,
      });
      const parsed = await parseUploadedStudyExam(
        files,
        {
          title,
          subject,
          grade,
          examDate,
          qualityHints: sourceFiles.map((file) => buildUploadQualityHint(file.qualityReport)),
        },
        providedText
      );
      inferredTitle = parsed.title || inferredTitle || files[0]?.name || "";
      inferredSubject = parsed.subject || inferredSubject;
      inferredGrade = parsed.grade || inferredGrade;
      inferredExamDate = parsed.examDate || inferredExamDate;
      rawText = parsed.rawText || rawText;
      questions = parsed.questions.length > 0 ? parsed.questions : questions;
      tags = [...new Set([...tags, ...parsed.tags])];
      ocrStatus = parsed.ocrStatus;
      console.info("[study-upload] AI parsing completed", {
        ocrStatus,
        parserMode: parsed.parserMode,
        questionCount: questions.length,
        rawTextLength: rawText.length,
      });
    } else if (rawText && providedQuestions.length === 0) {
      console.info("[study-upload] structuring provided OCR text with uploaded files as context", {
        fileCount: files.length,
      });
      const parsed = await parseUploadedStudyExam(
        files,
        {
          title,
          subject,
          grade,
          examDate,
          qualityHints: sourceFiles.map((file) => buildUploadQualityHint(file.qualityReport)),
        },
        rawText
      );
      inferredTitle = parsed.title || inferredTitle || files[0]?.name || "";
      inferredSubject = parsed.subject || inferredSubject;
      inferredGrade = parsed.grade || inferredGrade;
      inferredExamDate = parsed.examDate || inferredExamDate;
      rawText = parsed.rawText || rawText;
      questions = parsed.questions.length > 0 ? parsed.questions : questions;
      tags = [...new Set([...tags, ...parsed.tags])];
      ocrStatus = parsed.ocrStatus;
      console.info("[study-upload] text structuring completed", {
        ocrStatus,
        parserMode: parsed.parserMode,
        questionCount: questions.length,
        rawTextLength: rawText.length,
      });
    }
  }

  return {
    title: inferredTitle,
    subject: inferredSubject,
    grade: inferredGrade,
    examDate: inferredExamDate,
    sourceType: sourceFile ? "file" : providedQuestions.length > 0 ? "structured" : "text",
    ocrStatus,
    rawText,
    questions,
    tags,
    planningProfile,
    sourceFile,
    sourceFiles,
  };
}

async function parseJsonExam(request: NextRequest) {
  const body = (await request.json()) as Record<string, unknown>;

  return {
    title: typeof body.title === "string" ? body.title : "",
    subject: typeof body.subject === "string" ? body.subject : "",
    grade: typeof body.grade === "string" ? body.grade : "",
    examDate: typeof body.examDate === "string" ? body.examDate : new Date().toISOString(),
    sourceType:
      typeof body.sourceType === "string"
        ? body.sourceType
        : Array.isArray(body.questions) && body.questions.length > 0
          ? "structured"
          : "text",
    ocrStatus: typeof body.ocrStatus === "string" ? body.ocrStatus : "not_needed",
    rawText: typeof body.rawText === "string" ? body.rawText : "",
    questions: Array.isArray(body.questions) ? body.questions : [],
    tags: Array.isArray(body.tags) ? body.tags : [],
    planningProfile: parsePlanningProfile(body.planningProfile),
    sourceFile:
      body.sourceFile && typeof body.sourceFile === "object"
        ? body.sourceFile
        : null,
    sourceFiles: Array.isArray(body.sourceFiles) ? body.sourceFiles : [],
  };
}

export async function GET(request: NextRequest) {
  const user = getUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { db } = await connectToDatabase();
    const exams = await db
      .collection(STUDY_EXAMS_COLLECTION)
      .find({ userId: user.userId })
      .sort({ createdAt: -1 })
      .limit(30)
      .toArray();

    return NextResponse.json({
      items: exams.map((exam) => ({
        id: String(exam._id),
        title: exam.title,
        subject: exam.subject,
        grade: exam.grade ?? "",
        examDate: exam.examDate,
        sourceType: exam.sourceType,
        ocrStatus: exam.ocrStatus,
        tags: exam.tags ?? [],
        createdAt: exam.createdAt,
      })),
    });
  } catch (error) {
    console.error("Failed to list study exams:", error);
    return NextResponse.json({ error: "Failed to list study exams" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const user = getUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const contentType = request.headers.get("content-type") || "";
    const payload = contentType.includes("multipart/form-data")
      ? await parseMultipartExam(request)
      : await parseJsonExam(request);
    const now = new Date().toISOString();

    const exam = normalizeExamRecord({
      ...payload,
      userId: user.userId,
      username: user.username,
      createdAt: now,
      updatedAt: now,
    });

    if (!exam.rawText && exam.questions.length === 0 && !exam.sourceFile && exam.sourceFiles.length === 0) {
      return NextResponse.json(
        { error: "Provide rawText, structured questions, or a file reference." },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();
    const result = await db.collection(STUDY_EXAMS_COLLECTION).insertOne(exam as never);

    return NextResponse.json(
      {
        id: result.insertedId.toString(),
        exam: {
          ...exam,
          _id: result.insertedId.toString(),
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Failed to create study exam:", error);
    return NextResponse.json({ error: "Failed to create study exam" }, { status: 500 });
  }
}
