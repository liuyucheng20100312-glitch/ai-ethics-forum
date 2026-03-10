import { connectToDatabase } from "@/lib/mongodb";
import { getUserFromRequest } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";

// POST /api/creative/[id]/like – toggle like
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { id } = await params;
  const { db } = await connectToDatabase();

  // Use a per-user likes set stored alongside the doc
  const doc = await db.collection("creative").findOne({ _id: new ObjectId(id) });
  if (!doc) return NextResponse.json({ error: "作品不存在" }, { status: 404 });

  const likedBy: string[] = doc.likedBy ?? [];
  const alreadyLiked = likedBy.includes(user.userId);

  if (alreadyLiked) {
    await db.collection("creative").updateOne(
      { _id: new ObjectId(id) },
      { $inc: { likes: -1 }, $pull: { likedBy: user.userId } } as any
    );
    return NextResponse.json({ liked: false, likes: (doc.likes ?? 1) - 1 });
  } else {
    await db.collection("creative").updateOne(
      { _id: new ObjectId(id) },
      { $inc: { likes: 1 }, $push: { likedBy: user.userId } } as any
    );
    return NextResponse.json({ liked: true, likes: (doc.likes ?? 0) + 1 });
  }
}
