import { getUserFromRequest } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { parseUploadedStudyExam } from "@/lib/study-exam-parser";
import {
  STUDY_EXAMS_COLLECTION,
  normalizeExamRecord,
  StudyExamQuestion,
  StudyExamSourceFile,
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

async function parseMultipartExam(request: NextRequest) {
  const formData = await request.formData();
  const file = formData.get("paper");
  const title = asString(formData.get("title"));
  const subject = asString(formData.get("subject"));
  const grade = asString(formData.get("grade"));
  const examDate = asString(formData.get("examDate")) || new Date().toISOString();
  const providedQuestions = parseQuestions(asString(formData.get("questions")));
  const providedText = asString(formData.get("paperText"));
  const providedTags = parseTags(asString(formData.get("tags")));
  let rawText = providedText;
  let sourceFile: StudyExamSourceFile | null = null;
  let ocrStatus: "ready" | "pending" | "not_needed" = rawText ? "ready" : "not_needed";
  let questions = providedQuestions;
  let tags = providedTags;
  let inferredTitle = title;
  let inferredSubject = subject;
  let inferredGrade = grade;
  let inferredExamDate = examDate;

  if (file instanceof File) {
    sourceFile = {
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      size: file.size,
    };

    if ((file.type || "").startsWith("text/") || file.type === "application/json") {
      rawText = rawText || (await file.text());
      ocrStatus = "ready";
    } else if (!rawText && providedQuestions.length === 0) {
      const parsed = await parseUploadedStudyExam(
        file,
        {
          title,
          subject,
          grade,
          examDate,
        },
        providedText
      );
      inferredTitle = parsed.title || inferredTitle || file.name;
      inferredSubject = parsed.subject || inferredSubject;
      inferredGrade = parsed.grade || inferredGrade;
      inferredExamDate = parsed.examDate || inferredExamDate;
      rawText = parsed.rawText || rawText;
      questions = parsed.questions.length > 0 ? parsed.questions : questions;
      tags = [...new Set([...tags, ...parsed.tags])];
      ocrStatus = parsed.ocrStatus;
    } else if (rawText && providedQuestions.length === 0) {
      const parsed = await parseUploadedStudyExam(
        file,
        {
          title,
          subject,
          grade,
          examDate,
        },
        rawText
      );
      inferredTitle = parsed.title || inferredTitle || file.name;
      inferredSubject = parsed.subject || inferredSubject;
      inferredGrade = parsed.grade || inferredGrade;
      inferredExamDate = parsed.examDate || inferredExamDate;
      rawText = parsed.rawText || rawText;
      questions = parsed.questions.length > 0 ? parsed.questions : questions;
      tags = [...new Set([...tags, ...parsed.tags])];
      ocrStatus = parsed.ocrStatus;
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
    sourceFile,
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
    sourceFile:
      body.sourceFile && typeof body.sourceFile === "object"
        ? body.sourceFile
        : null,
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

    if (!exam.rawText && exam.questions.length === 0 && !exam.sourceFile) {
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
