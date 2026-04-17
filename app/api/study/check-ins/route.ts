import { getUserFromRequest } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import {
  buildCheckInFeedback,
  findDocumentById,
  STUDY_CHECKINS_COLLECTION,
  STUDY_PLANS_COLLECTION,
  StudyCheckInPayload,
  StudyPlanRecord,
} from "@/lib/study-assistant";
import { NextRequest, NextResponse } from "next/server";

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => asString(item))
    .filter((item) => item.length > 0);
}

function asNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export async function POST(request: NextRequest) {
  const user = getUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const payload: StudyCheckInPayload = {
      planId: asString(body.planId),
      completedTaskIds: [...new Set(asStringArray(body.completedTaskIds))],
      minutesStudied: asNumber(body.minutesStudied),
      blockers: asStringArray(body.blockers),
      reflection: asString(body.reflection),
    };

    if (!payload.planId) {
      return NextResponse.json({ error: "planId is required" }, { status: 400 });
    }

    const { db } = await connectToDatabase();
    const planDocument = await findDocumentById(db, STUDY_PLANS_COLLECTION, payload.planId);

    if (!planDocument || String(planDocument.userId) !== user.userId) {
      return NextResponse.json({ error: "Plan not found" }, { status: 404 });
    }

    const plan = {
      ...(planDocument as unknown as StudyPlanRecord),
      _id: String(planDocument._id),
      completedTaskIds: Array.isArray(planDocument.completedTaskIds)
        ? (planDocument.completedTaskIds as string[])
        : [],
    };

    const mergedCompletedTaskIds = [...new Set([...plan.completedTaskIds, ...payload.completedTaskIds])];
    const feedback = buildCheckInFeedback(plan, {
      ...payload,
      completedTaskIds: mergedCompletedTaskIds,
    });
    const now = new Date().toISOString();

    const checkInRecord = {
      planId: payload.planId,
      userId: user.userId,
      username: user.username,
      completedTaskIds: mergedCompletedTaskIds,
      minutesStudied: payload.minutesStudied,
      blockers: payload.blockers,
      reflection: payload.reflection,
      coachFeedback: feedback,
      createdAt: now,
      updatedAt: now,
    };

    const insertResult = await db.collection(STUDY_CHECKINS_COLLECTION).insertOne(checkInRecord as never);
    await db.collection(STUDY_PLANS_COLLECTION).updateOne(
      { _id: planDocument._id as never },
      {
        $set: {
          completedTaskIds: mergedCompletedTaskIds,
          updatedAt: now,
          lastCheckInAt: now,
        },
      }
    );

    return NextResponse.json({
      checkIn: {
        ...checkInRecord,
        _id: insertResult.insertedId.toString(),
      },
      feedback,
    });
  } catch (error) {
    console.error("Failed to create study check-in:", error);
    return NextResponse.json({ error: "Failed to create study check-in" }, { status: 500 });
  }
}
