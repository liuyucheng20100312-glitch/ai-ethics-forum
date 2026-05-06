import { getUserFromRequest } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { forbidden, isAdminUser, serverError, unauth } from "@/lib/api-helpers";
import {
  cleanupAutoLearnedQuestionKnowledge,
  STUDY_AUTO_LEARN_ORIGIN,
  STUDY_QUESTION_BANK_COLLECTION,
} from "@/lib/study-assistant";
import { NextRequest, NextResponse } from "next/server";

function serializeQuestion(item: Record<string, unknown>) {
  return {
    ...item,
    _id: item._id ? String(item._id) : "",
  };
}

export async function GET(request: NextRequest) {
  const user = getUserFromRequest(request);
  if (!user) return unauth();
  if (!isAdminUser(user.userId)) return forbidden();

  try {
    const { db } = await connectToDatabase();
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || "pending_review";
    const subject = searchParams.get("subject") || "all";
    const page = Math.max(1, Number(searchParams.get("page") || "1"));
    const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") || "20")));
    const query: Record<string, unknown> = {};

    if (status !== "all") {
      query.reviewStatus = status;
    }
    if (subject !== "all") {
      query.subjectCode = subject;
    }

    const collection = db.collection(STUDY_QUESTION_BANK_COLLECTION);
    const [items, total, pending, approved, rejected] = await Promise.all([
      collection
        .find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .toArray(),
      collection.countDocuments(query),
      collection.countDocuments({ reviewStatus: "pending_review" }),
      collection.countDocuments({ reviewStatus: "approved" }),
      collection.countDocuments({ reviewStatus: "rejected" }),
    ]);

    return NextResponse.json({
      items: items.map((item) => serializeQuestion(item as Record<string, unknown>)),
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      stats: {
        total: pending + approved + rejected,
        pending,
        approved,
        rejected,
      },
    });
  } catch (error) {
    console.error("Failed to load study question bank:", error);
    return serverError("Failed to load study question bank.");
  }
}

export async function DELETE(request: NextRequest) {
  const user = getUserFromRequest(request);
  if (!user) return unauth();
  if (!isAdminUser(user.userId)) return forbidden();

  try {
    const { searchParams } = new URL(request.url);
    const origin = searchParams.get("origin");
    const status = searchParams.get("status") || "all";

    if (origin !== STUDY_AUTO_LEARN_ORIGIN) {
      return NextResponse.json(
        { error: "Cleanup must explicitly target study_upload_auto_learn." },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();
    const summary = await cleanupAutoLearnedQuestionKnowledge(db, status);

    return NextResponse.json({
      ok: true,
      summary,
    });
  } catch (error) {
    console.error("Failed to cleanup auto-learned question knowledge:", error);
    return serverError("Failed to cleanup auto-learned question knowledge.");
  }
}
