import { connectToDatabase } from "@/lib/mongodb";
import { getUserFromRequest } from "@/lib/auth";
import { isAdminUser, unauth, forbidden, serverError } from "@/lib/api-helpers";
import { NextRequest, NextResponse } from "next/server";

// GET: 获取所有帖子（管理员用，包含所有状态）
export async function GET(request: NextRequest) {
  const user = getUserFromRequest(request);
  if (!user) return unauth();
  if (!isAdminUser(user.userId)) return forbidden();

  try {
    const { db } = await connectToDatabase();
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const category = searchParams.get("category");
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.max(1, parseInt(searchParams.get("limit") || "20", 10));

    const query: Record<string, unknown> = {};
    if (status && status !== "all") query.status = status;
    if (category && category !== "all") query.category = category;

    // 用 Promise.all 并行发起列表查询 + 各状态计数，避免 5 次串行往返。
    // 注意：不能用 aggregate($group) 因为本地 JSON 备用数据库不支持该操作。
    const [posts, total, approvedCount, pendingCount, rejectedCount, hiddenCount] =
      await Promise.all([
        db
          .collection("posts")
          .find(query)
          .sort({ createdAt: -1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .toArray(),
        db.collection("posts").countDocuments(query),
        db.collection("posts").countDocuments({ status: "approved" }),
        db.collection("posts").countDocuments({ status: "pending" }),
        db.collection("posts").countDocuments({ status: "rejected" }),
        db.collection("posts").countDocuments({ status: "hidden" }),
      ]);

    const stats = {
      total: approvedCount + pendingCount + rejectedCount + hiddenCount,
      approved: approvedCount,
      pending: pendingCount,
      rejected: rejectedCount,
      hidden: hiddenCount,
    };

    return NextResponse.json({
      posts,
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      stats,
    });
  } catch (error) {
    console.error("获取帖子列表失败:", error);
    return serverError("获取帖子列表失败");
  }
}
