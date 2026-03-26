import { connectToDatabase } from "@/lib/mongodb";
import { getUserFromRequest } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

// GET /api/follows  – list of users the current user follows
// Query param: type=following (default) or type=followers
export async function GET(request: NextRequest) {
  const user = getUserFromRequest(request);
  if (!user) return NextResponse.json([], { status: 200 });

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") || "following";

  const { db } = await connectToDatabase();

  if (type === "followers") {
    // 获取关注我的人（粉丝）
    const followers = await db
      .collection("follows")
      .find({ followingUsername: user.username })
      .sort({ followedAt: -1 })
      .toArray();
    return NextResponse.json(followers);
  } else {
    // 获取我关注的人
    const follows = await db
      .collection("follows")
      .find({ followerId: user.userId })
      .sort({ followedAt: -1 })
      .toArray();
    return NextResponse.json(follows);
  }
}

// POST /api/follows  – follow a user  { username }
export async function POST(request: NextRequest) {
  const user = getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const body = await request.json();
  const { username } = body as { username?: string };
  if (!username) return NextResponse.json({ error: "缺少 username" }, { status: 400 });
  if (username === user.username) return NextResponse.json({ error: "不能关注自己" }, { status: 400 });

  const { db } = await connectToDatabase();
  const existing = await db.collection("follows").findOne({ followerId: user.userId, followingUsername: username });
  if (existing) return NextResponse.json({ ok: true, alreadyFollowing: true });

  await db.collection("follows").insertOne({
    followerId: user.userId,
    followerUsername: user.username,
    followingUsername: username,
    followedAt: new Date().toISOString(),
  });
  return NextResponse.json({ ok: true });
}
