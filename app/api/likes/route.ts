import { connectToDatabase } from "@/lib/mongodb";
import { getUserFromRequest } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

// GET /api/likes - current user's liked posts
export async function GET(request: NextRequest) {
  const user = getUserFromRequest(request);
  if (!user) return NextResponse.json([], { status: 200 });

  const { db } = await connectToDatabase();
  const likes = await db
    .collection("likes")
    .find({ userId: user.userId })
    .sort({ likedAt: -1 })
    .toArray();

  return NextResponse.json(likes);
}

// POST /api/likes - add a like
export async function POST(request: NextRequest) {
  const user = getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const body = await request.json();
  const { postId, title, author, category, createdAt } = body;
  if (!postId) return NextResponse.json({ error: "缺少 postId" }, { status: 400 });

  const { db } = await connectToDatabase();
  const existing = await db.collection("likes").findOne({ userId: user.userId, postId });
  if (existing) return NextResponse.json({ ok: true, alreadyLiked: true });

  await db.collection("likes").insertOne({
    userId: user.userId,
    postId,
    title: title ?? "",
    author: author ?? "",
    category: category ?? "",
    createdAt: createdAt ?? new Date().toISOString(),
    likedAt: new Date().toISOString(),
  });
  return NextResponse.json({ ok: true });
}
