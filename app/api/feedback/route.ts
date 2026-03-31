import { connectToDatabase } from "@/lib/mongodb";
import { getUserFromRequest } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

// GET: 获取所有反馈（仅管理员）
export async function GET(request: NextRequest) {
  const user = getUserFromRequest(request);

  // 检查是否是管理员
  if (!user || user.userId !== "offline_admin") {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  try {
    const { db } = await connectToDatabase();
    const feedbacks = await db
      .collection("feedbacks")
      .find({})
      .sort({ createdAt: -1 })
      .toArray();

    return NextResponse.json(feedbacks);
  } catch (error) {
    console.error("获取反馈失败:", error);
    return NextResponse.json(
      { error: "获取反馈失败" },
      { status: 500 }
    );
  }
}

// POST: 提交新反馈（所有登录用户）
export async function POST(request: NextRequest) {
  const user = getUserFromRequest(request);

  if (!user) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  try {
    const { db } = await connectToDatabase();
    const body = await request.json();

    const { type, content, contact } = body;

    if (!content || !content.trim()) {
      return NextResponse.json(
        { error: "请填写反馈内容" },
        { status: 400 }
      );
    }

    const newFeedback = {
      type: type || "suggestion", // suggestion, bug, other
      content: content.trim(),
      contact: contact?.trim() || "",
      authorId: user.userId,
      authorName: user.username || "匿名用户",
      status: "pending", // pending, read, resolved
      createdAt: new Date(),
    };

    await db.collection("feedbacks").insertOne(newFeedback);

    return NextResponse.json(
      { message: "反馈提交成功" },
      { status: 201 }
    );
  } catch (error) {
    console.error("提交反馈失败:", error);
    return NextResponse.json(
      { error: "提交反馈失败" },
      { status: 500 }
    );
  }
}
