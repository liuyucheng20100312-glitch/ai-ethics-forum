import { connectToDatabase } from "@/lib/mongodb";
import { getUserFromRequest } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

// DELETE /api/follows/[username]  – unfollow a user
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  const user = getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { username } = await params;
  const { db } = await connectToDatabase();
  await db.collection("follows").deleteOne({ followerId: user.userId, followingUsername: username });
  return NextResponse.json({ ok: true });
}
