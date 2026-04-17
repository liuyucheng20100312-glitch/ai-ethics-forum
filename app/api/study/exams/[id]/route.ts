import { getUserFromRequest } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import {
  findDocumentById,
  STUDY_ANALYSES_COLLECTION,
  STUDY_EXAMS_COLLECTION,
  STUDY_PLANS_COLLECTION,
} from "@/lib/study-assistant";
import { NextRequest, NextResponse } from "next/server";

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = getUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const { db } = await connectToDatabase();
    const exam = await findDocumentById(db, STUDY_EXAMS_COLLECTION, id);

    if (!exam || String(exam.userId) !== user.userId) {
      return NextResponse.json({ error: "Exam not found" }, { status: 404 });
    }

    const analyses = await db
      .collection(STUDY_ANALYSES_COLLECTION)
      .find({ examId: id, userId: user.userId })
      .sort({ createdAt: -1 })
      .limit(1)
      .toArray();

    const plans = await db
      .collection(STUDY_PLANS_COLLECTION)
      .find({ examId: id, userId: user.userId, status: "active" })
      .sort({ createdAt: -1 })
      .limit(1)
      .toArray();

    return NextResponse.json({
      exam: {
        ...exam,
        _id: String(exam._id),
      },
      latestAnalysis:
        analyses.length > 0
          ? {
              ...analyses[0],
              _id: String(analyses[0]._id),
            }
          : null,
      activePlan:
        plans.length > 0
          ? {
              ...plans[0],
              _id: String(plans[0]._id),
            }
          : null,
    });
  } catch (error) {
    console.error("Failed to load study exam:", error);
    return NextResponse.json({ error: "Failed to load study exam" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = getUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = (await request.json()) as Record<string, unknown>;
    const { db } = await connectToDatabase();
    const exam = await findDocumentById(db, STUDY_EXAMS_COLLECTION, id);

    if (!exam || String(exam.userId) !== user.userId) {
      return NextResponse.json({ error: "Exam not found" }, { status: 404 });
    }

    const update: Record<string, unknown> = {
      updatedAt: new Date().toISOString(),
    };
    const title = asString(body.title);
    const subject = asString(body.subject);
    const grade = asString(body.grade);

    if (title) {
      update.title = title;
    }
    if (subject) {
      update.subject = subject;
    }
    if (grade) {
      update.grade = grade;
    }

    await db.collection(STUDY_EXAMS_COLLECTION).updateOne(
      { _id: exam._id as never },
      {
        $set: update,
      }
    );

    const updatedExam = await findDocumentById(db, STUDY_EXAMS_COLLECTION, id);

    return NextResponse.json({
      exam: updatedExam
        ? {
            ...updatedExam,
            _id: String(updatedExam._id),
          }
        : null,
    });
  } catch (error) {
    console.error("Failed to update study exam metadata:", error);
    return NextResponse.json({ error: "Failed to update study exam metadata" }, { status: 500 });
  }
}
