import { connectToDatabase } from "@/lib/mongodb";
import { getUserFromRequest } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const user = getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  // Offline admin token — return info directly without DB
  if (user.userId === "offline_admin") {
    return NextResponse.json({
      userId: "offline_admin",
      username: user.username,
      bio: "离线管理员",
      avatar: "",
    });
  }
  // Guest token
  if (user.userId === "guest") {
    return NextResponse.json({ userId: "guest", username: "游客", bio: "游客账号，仅供浏览", avatar: "" });
  }

  try {
    const { db } = await connectToDatabase();
    // Local DB stores _id as plain string; MongoDB uses ObjectId
    // Try string match first (local DB), then ObjectId (MongoDB)
    let doc = await db.collection("users").findOne({ _id: user.userId } as never);
    if (!doc) {
      try {
        const { ObjectId } = await import("mongodb");
        doc = await db.collection("users").findOne({ _id: new ObjectId(user.userId) } as never);
      } catch { /* id not an ObjectId */ }
    }
    if (!doc) return NextResponse.json({ userId: user.userId, username: user.username, bio: "", avatar: "" });
    return NextResponse.json({
      userId: doc._id!.toString(),
      username: doc.username,
      bio: doc.bio ?? "",
      avatar: doc.avatar ?? "",
    });
  } catch {
    return NextResponse.json({ userId: user.userId, username: user.username, bio: "", avatar: "" });
  }
}
