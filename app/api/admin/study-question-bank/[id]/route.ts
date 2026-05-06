import { getUserFromRequest } from "@/lib/auth";
import { badRequest, forbidden, isAdminUser, notFound, serverError, tryParseObjectId, unauth } from "@/lib/api-helpers";
import { connectToDatabase } from "@/lib/mongodb";
import {
  approveQuestionBankItem,
  moveQuestionBankItemToPendingReview,
  rejectQuestionBankItem,
  STUDY_QUESTION_BANK_COLLECTION,
} from "@/lib/study-assistant";
import { NextRequest, NextResponse } from "next/server";

async function findQuestionBankItem(db: Awaited<ReturnType<typeof connectToDatabase>>["db"], id: string) {
  const objectId = tryParseObjectId(id);
  const query = objectId ? { _id: objectId } : { questionHash: id };
  return await db.collection(STUDY_QUESTION_BANK_COLLECTION).findOne(query);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = getUserFromRequest(request);
  if (!user) return unauth();
  if (!isAdminUser(user.userId)) return forbidden();

  try {
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as {
      reviewStatus?: string;
      reason?: string;
    };
    const nextStatus = body.reviewStatus;

    if (nextStatus !== "approved" && nextStatus !== "rejected" && nextStatus !== "pending_review") {
      return badRequest("Invalid review status.");
    }

    const { db } = await connectToDatabase();
    const item = await findQuestionBankItem(db, id);
    if (!item) {
      return notFound("Question bank item not found.");
    }

    if (nextStatus === "approved") {
      const result = await approveQuestionBankItem(db, item as Record<string, unknown>, user.userId);
      return NextResponse.json({
        ok: true,
        reviewStatus: "approved",
        vectorized: result.vectorized,
      });
    }

    if (nextStatus === "rejected") {
      await rejectQuestionBankItem(
        db,
        item as Record<string, unknown>,
        user.userId,
        body.reason || "Rejected by admin review."
      );
      return NextResponse.json({
        ok: true,
        reviewStatus: "rejected",
      });
    }

    await moveQuestionBankItemToPendingReview(db, item as Record<string, unknown>, user.userId);

    return NextResponse.json({
      ok: true,
      reviewStatus: "pending_review",
    });
  } catch (error) {
    console.error("Failed to update study question bank item:", error);
    return serverError("Failed to update study question bank item.");
  }
}
