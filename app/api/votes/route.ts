import { connectToDatabase } from "@/lib/mongodb";
import { getUserFromRequest } from "@/lib/auth";
import { detectSensitiveWords } from "@/lib/sensitive";
import { isAdminUser, unauth, badRequest, serverError } from "@/lib/api-helpers";
import { NextRequest, NextResponse } from "next/server";

// GET: 获取所有投票
export async function GET(request: NextRequest) {
  try {
    const { db } = await connectToDatabase();
    const { searchParams } = new URL(request.url);
    const authorFilter = searchParams.get("author");
    const statusFilter = searchParams.get("status");
    const adminView = searchParams.get("adminView") === "true";
    const user = getUserFromRequest(request);

    const query: Record<string, unknown> = {};
    if (authorFilter) query.author = authorFilter;

    if (!isAdminUser(user?.userId) || !adminView) {
      // 普通用户只能看到上架的投票
      if (statusFilter) query.status = statusFilter;
      query.isVisible = { $ne: false };
    } else {
      // 管理员可以按状态筛选
      if (statusFilter) query.status = statusFilter;
    }

    const votes = await db
      .collection("votes")
      .find(query)
      .sort({ createdAt: -1 })
      .toArray();

    return NextResponse.json(votes);
  } catch (error) {
    console.error("获取投票失败:", error);
    return serverError("获取投票失败");
  }
}

// POST: 创建新投票（需要登录）
export async function POST(request: NextRequest) {
  const user = getUserFromRequest(request);
  if (!user) return unauth();

  try {
    const { db } = await connectToDatabase();
    const body = await request.json();
    const { title, titleEn, proDescription, proDescriptionEn, conDescription, conDescriptionEn } = body;

    if (!title || !proDescription || !conDescription) {
      return badRequest("缺少必填字段");
    }

    // 检测敏感词
    const textToCheck = `${title} ${proDescription} ${conDescription}`;
    const sensitiveResult = await detectSensitiveWords(textToCheck);

    // 如果检测到敏感词，直接拒绝提交，提示用户修改
    if (sensitiveResult.found) {
      const sensitiveWordList = sensitiveResult.words.map(w => w.word).join("、");
      return NextResponse.json(
        { error: `您的投票包含敏感词，请修改后重新提交。敏感词：${sensitiveWordList}` },
        { status: 400 }
      );
    }

    const newVote = {
      title,
      titleEn: titleEn || "",
      proDescription,
      proDescriptionEn: proDescriptionEn || "",
      conDescription,
      conDescriptionEn: conDescriptionEn || "",
      author: user.username,
      authorId: user.userId,
      status: "active",    // active: 进行中, closed: 已结束
      isVisible: true,     // 直接上架
      proCount: 0,         // 正方票数
      conCount: 0,         // 反方票数
      totalVoters: 0,      // 总投票人数
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await db.collection("votes").insertOne(newVote);

    return NextResponse.json(
      { ...newVote, _id: result.insertedId },
      { status: 201 }
    );
  } catch (error) {
    console.error("创建投票失败:", error);
    return serverError("创建投票失败");
  }
}
