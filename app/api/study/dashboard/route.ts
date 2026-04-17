import { getUserFromRequest } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import {
  STUDY_ANALYSES_COLLECTION,
  STUDY_CHECKINS_COLLECTION,
  STUDY_EXAMS_COLLECTION,
  STUDY_PLANS_COLLECTION,
} from "@/lib/study-assistant";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const user = getUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { db } = await connectToDatabase();
    const [latestExam] = await db
      .collection(STUDY_EXAMS_COLLECTION)
      .find({ userId: user.userId })
      .sort({ createdAt: -1 })
      .limit(1)
      .toArray();
    const [latestAnalysis] = await db
      .collection(STUDY_ANALYSES_COLLECTION)
      .find({ userId: user.userId })
      .sort({ createdAt: -1 })
      .limit(1)
      .toArray();
    const activePlans = await db
      .collection(STUDY_PLANS_COLLECTION)
      .find({ userId: user.userId, status: "active" })
      .sort({ createdAt: -1 })
      .limit(3)
      .toArray();
    const recentCheckIns = await db
      .collection(STUDY_CHECKINS_COLLECTION)
      .find({ userId: user.userId })
      .sort({ createdAt: -1 })
      .limit(5)
      .toArray();

    return NextResponse.json({
      latestExam: latestExam
        ? {
            ...latestExam,
            _id: String(latestExam._id),
          }
        : null,
      latestAnalysis: latestAnalysis
        ? {
            ...latestAnalysis,
            _id: String(latestAnalysis._id),
          }
        : null,
      activePlans: activePlans.map((plan) => ({
        ...plan,
        _id: String(plan._id),
      })),
      recentCheckIns: recentCheckIns.map((checkIn) => ({
        ...checkIn,
        _id: String(checkIn._id),
      })),
    });
  } catch (error) {
    console.error("Failed to load study dashboard:", error);
    return NextResponse.json({ error: "Failed to load study dashboard" }, { status: 500 });
  }
}
