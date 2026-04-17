import { getUserFromRequest } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import {
  findDocumentById,
  generateStudyAnalysisBundle,
  normalizeExamRecord,
  STUDY_ANALYSES_COLLECTION,
  STUDY_EXAMS_COLLECTION,
  STUDY_PLANS_COLLECTION,
} from "@/lib/study-assistant";
import { NextRequest, NextResponse } from "next/server";

export async function POST(
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
    const examDocument = await findDocumentById(db, STUDY_EXAMS_COLLECTION, id);

    if (!examDocument || String(examDocument.userId) !== user.userId) {
      return NextResponse.json({ error: "Exam not found" }, { status: 404 });
    }

    const exam = normalizeExamRecord(examDocument);
    if (!exam.rawText && exam.questions.length === 0) {
      return NextResponse.json(
        {
          error:
            exam.sourceFile && exam.ocrStatus === "pending"
              ? "Exam file is waiting for OCR extraction before analysis."
              : "Exam does not contain enough text or question data for analysis.",
        },
        { status: 400 }
      );
    }

    const bundle = await generateStudyAnalysisBundle(db, {
      ...examDocument,
      _id: String(examDocument._id),
    });
    const now = new Date().toISOString();

    await db.collection(STUDY_PLANS_COLLECTION).updateMany(
      { examId: id, userId: user.userId, status: "active" },
      {
        $set: {
          status: "superseded",
          updatedAt: now,
        },
      }
    );

    const analysisRecord = {
      examId: id,
      userId: user.userId,
      username: user.username,
      overview: bundle.overview,
      scoreSummary: bundle.scoreSummary,
      weaknesses: bundle.weaknesses,
      recommendedQueries: bundle.recommendedQueries,
      recommendedMaterials: bundle.recommendedMaterials,
      analysisMode: bundle.analysisMode,
      createdAt: now,
      updatedAt: now,
    };
    const analysisInsert = await db.collection(STUDY_ANALYSES_COLLECTION).insertOne(analysisRecord as never);
    const analysisId = analysisInsert.insertedId.toString();

    const planRecord = {
      analysisId,
      examId: id,
      userId: user.userId,
      username: user.username,
      title: bundle.plan.title,
      horizonDays: bundle.plan.horizonDays,
      dailyMinutes: bundle.plan.dailyMinutes,
      goals: bundle.plan.goals,
      tasks: bundle.plan.tasks,
      checkpoints: bundle.plan.checkpoints,
      coachStrategy: bundle.plan.coachStrategy,
      status: "active",
      completedTaskIds: [],
      createdAt: now,
      updatedAt: now,
    };
    const planInsert = await db.collection(STUDY_PLANS_COLLECTION).insertOne(planRecord as never);

    await db.collection(STUDY_EXAMS_COLLECTION).updateOne(
      { _id: examDocument._id as never },
      {
        $set: {
          updatedAt: now,
        },
      }
    );

    return NextResponse.json({
      analysis: {
        ...analysisRecord,
        _id: analysisId,
      },
      plan: {
        ...planRecord,
        _id: planInsert.insertedId.toString(),
      },
    });
  } catch (error) {
    console.error("Failed to analyze study exam:", error);
    return NextResponse.json({ error: "Failed to analyze study exam" }, { status: 500 });
  }
}
