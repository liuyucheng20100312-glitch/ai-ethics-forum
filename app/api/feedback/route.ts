import { connectToDatabase } from "@/lib/mongodb";
import { getUserFromRequest } from "@/lib/auth";
import { isAdminUser, unauth, forbidden, badRequest, serverError } from "@/lib/api-helpers";
import { NextRequest, NextResponse } from "next/server";

// GET: 获取所有反馈（仅管理员）
export async function GET(request: NextRequest) {
  const user = getUserFromRequest(request);
  if (!user) return unauth();
  if (!isAdminUser(user.userId)) return forbidden();

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
    return serverError("获取反馈失败");
  }
}

// POST: 提交新反馈（所有登录用户）
export async function POST(request: NextRequest) {
  const user = getUserFromRequest(request);
  if (!user) return unauth();

  try {
    const { db } = await connectToDatabase();
    const { type, content, contact } = await request.json();

    if (!content || !content.trim()) return badRequest("请填写反馈内容");

    const newFeedback = {
      type: type || "suggestion", // suggestion | bug | other
      content: content.trim(),
      contact: contact?.trim() || "",
      authorId: user.userId,
      authorName: user.username,
      status: "pending", // pending | read | resolved
      createdAt: new Date(),
    };

    await db.collection("feedbacks").insertOne(newFeedback);

    return NextResponse.json({ message: "反馈提交成功" }, { status: 201 });
  } catch (error) {
    console.error("提交反馈失败:", error);
    return serverError("提交反馈失败");
  }
}
