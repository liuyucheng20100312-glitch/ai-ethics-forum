import { connectToDatabase } from "@/lib/mongodb";
import { getUserFromRequest } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

// GET /api/bookmarks – current user's bookmarks
export async function GET(request: NextRequest) {
  const user = getUserFromRequest(request);
  if (!user) return NextResponse.json([], { status: 200 });

  const { db } = await connectToDatabase();
  const bookmarks = await db
    .collection("bookmarks")
    .find({ userId: user.userId })
    .sort({ bookmarkedAt: -1 })
    .toArray();

  return NextResponse.json(bookmarks);
}

// POST /api/bookmarks – add a bookmark
// Body: { itemId, itemType, title, subtitle, url?, emoji? }
export async function POST(request: NextRequest) {
  const user = getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const body = await request.json();
  const { itemId, itemType, title, subtitle, url, emoji } = body as {
    itemId: string;
    itemType: "news" | "podcast" | "tool";
    title: string;
    subtitle?: string;
    url?: string;
    emoji?: string;
  };
  if (!itemId || !itemType || !title)
    return NextResponse.json({ error: "缺少必填字段" }, { status: 400 });

  const { db } = await connectToDatabase();
  const existing = await db
    .collection("bookmarks")
    .findOne({ userId: user.userId, itemId, itemType });
  if (existing) return NextResponse.json({ ok: true, alreadyBookmarked: true });

  await db.collection("bookmarks").insertOne({
    userId: user.userId,
    itemId,
    itemType,
    title,
    subtitle: subtitle ?? "",
    url: url ?? "",
    emoji: emoji ?? "⭐",
    bookmarkedAt: new Date().toISOString(),
  });
  return NextResponse.json({ ok: true });
}
