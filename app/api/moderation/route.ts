import { connectToDatabase } from "@/lib/mongodb";
import { getUserFromRequest } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

// 检查是否是管理员
function isAdmin(userId: string | undefined): boolean {
  return userId === "offline_admin";
}

// GET: 获取审核列表
export async function GET(request: NextRequest) {
  const user = getUserFromRequest(request);
  if (!user || !isAdmin(user.userId)) {
    return NextResponse.json({ error: "无权限访问" }, { status: 403 });
  }

  try {
    const { db } = await connectToDatabase();
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || "pending";
    const contentType = searchParams.get("contentType");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");

    const query: any = { status };
    if (contentType) query.contentType = contentType;

    const total = await db.collection("moderation_records").countDocuments(query);
    const records = await db
      .collection("moderation_records")
      .find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .toArray();

    return NextResponse.json({
      records,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error("获取审核列表失败:", error);
    return NextResponse.json({ error: "获取审核列表失败" }, { status: 500 });
  }
}
