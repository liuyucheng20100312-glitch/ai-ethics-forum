import { connectToDatabase } from "@/lib/mongodb";
import { NextRequest, NextResponse } from "next/server";

// GET /api/users/[username] - 获取用户公开资料
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  try {
    const { username } = await params;
    const { db } = await connectToDatabase();

    const user = await db.collection("users").findOne(
      { username },
      { projection: { password: 0 } }
    );

    if (!user) {
      return NextResponse.json({ error: "用户不存在" }, { status: 404 });
    }

    return NextResponse.json({
      username: user.username,
      bio: user.bio || "",
      avatar: user.avatar || "",
      verified: user.verified || false,
      realName: user.realName,
      classId: user.classId,
      isAdmin: user.userId === "offline_admin",
    });
  } catch (error) {
    console.error("获取用户资料失败:", error);
    return NextResponse.json({ error: "获取用户资料失败" }, { status: 500 });
  }
}
