import { connectToDatabase } from "@/lib/mongodb";
import { getUserFromRequest } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";

// 检查是否是管理员
function isAdmin(userId: string | undefined): boolean {
  return userId === "offline_admin";
}

// GET: 获取所有帖子（管理员用，包含所有状态）
export async function GET(request: NextRequest) {
  const user = getUserFromRequest(request);
  if (!user || !isAdmin(user.userId)) {
    return NextResponse.json({ error: "无权限访问" }, { status: 403 });
  }

  try {
    const { db } = await connectToDatabase();
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const category = searchParams.get("category");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");

    const query: any = {};
    if (status && status !== "all") {
      query.status = status;
    }
    if (category && category !== "all") {
      query.category = category;
    }

    const total = await db.collection("posts").countDocuments(query);
    const totalPages = Math.ceil(total / limit);

    const posts = await db
      .collection("posts")
      .find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .toArray();

    // 获取统计信息
    const stats = {
      total: await db.collection("posts").countDocuments(),
      approved: await db.collection("posts").countDocuments({ status: "approved" }),
      pending: await db.collection("posts").countDocuments({ status: "pending" }),
      rejected: await db.collection("posts").countDocuments({ status: "rejected" }),
      hidden: await db.collection("posts").countDocuments({ status: "hidden" }),
    };

    return NextResponse.json({
      posts,
      total,
      totalPages,
      currentPage: page,
      stats,
    });
  } catch (error) {
    console.error("获取帖子列表失败:", error);
    return NextResponse.json({ error: "获取帖子列表失败" }, { status: 500 });
  }
}
