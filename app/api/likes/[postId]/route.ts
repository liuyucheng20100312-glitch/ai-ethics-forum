import { connectToDatabase } from "@/lib/mongodb";
import { getUserFromRequest } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

// DELETE /api/likes/[postId]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ postId: string }> }
) {
  const user = getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { postId } = await params;
  const { db } = await connectToDatabase();
  await db.collection("likes").deleteOne({ userId: user.userId, postId });
  return NextResponse.json({ ok: true });
}
