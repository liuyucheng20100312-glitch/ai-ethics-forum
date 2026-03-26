import { connectToDatabase } from "@/lib/mongodb";
import { NextRequest, NextResponse } from "next/server";

// GET /api/users/[username]/follows - 获取用户的关注/粉丝列表
// Query param: type=following (关注的人) or type=followers (粉丝)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  try {
    const { username } = await params;
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") || "following";

    const { db } = await connectToDatabase();

    if (type === "followers") {
      // 获取关注该用户的人（粉丝）
      const followers = await db
        .collection("follows")
        .find({ followingUsername: username })
        .sort({ followedAt: -1 })
        .toArray();
      return NextResponse.json(followers);
    } else {
      // 获取该用户关注的人
      const following = await db
        .collection("follows")
        .find({ followerUsername: username })
        .sort({ followedAt: -1 })
        .toArray();
      return NextResponse.json(following);
    }
  } catch (error) {
    console.error("获取关注列表失败:", error);
    return NextResponse.json({ error: "获取关注列表失败" }, { status: 500 });
  }
}
