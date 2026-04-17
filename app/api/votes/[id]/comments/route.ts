import { connectToDatabase } from "@/lib/mongodb";
import { getUserFromRequest } from "@/lib/auth";
import { detectSensitiveWords } from "@/lib/sensitive";
import { NextRequest, NextResponse } from "next/server";

// GET: 获取投票的所有评论
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { db } = await connectToDatabase();

    // 不显示被拒绝的评论
    const comments = await db
      .collection("vote_comments")
      .find({ voteId: id, status: { $ne: "rejected" } })
      .sort({ createdAt: -1 })
      .toArray();

    return NextResponse.json(comments);
  } catch (error) {
    console.error("获取评论失败:", error);
    return NextResponse.json(
      { error: "获取评论失败" },
      { status: 500 }
    );
  }
}

// POST: 添加评论（投票后可以发表更多评论）
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = getUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const { db } = await connectToDatabase();
    const body = await request.json();

    const { side, content } = body; // side: "pro" | "con" | null（中立评论）

    if (!content || !content.trim()) {
      return NextResponse.json(
        { error: "评论内容不能为空" },
        { status: 400 }
      );
    }

    // 检查是否已投票（获取用户投票记录）
    const voteRecord = await db.collection("vote_records").findOne({
      voteId: id,
      userId: user.userId,
    });

    // 如果没有投票记录，需要先投票才能评论
    if (!voteRecord) {
      return NextResponse.json(
        { error: "请先投票再发表评论" },
        { status: 400 }
      );
    }

    // 检测敏感词
    const sensitiveResult = await detectSensitiveWords(content);

    // 如果检测到敏感词，直接拒绝提交，提示用户修改
    if (sensitiveResult.found) {
      const sensitiveWordList = sensitiveResult.words.map(w => w.word).join("、");
      return NextResponse.json(
        { error: `您的评论包含敏感词，请修改后重新提交。敏感词：${sensitiveWordList}` },
        { status: 400 }
      );
    }

    const comment = {
      voteId: id,
      userId: user.userId,
      username: user.username,
      side: side || voteRecord.side, // 如果没有指定side，使用投票的立场
      content: content.trim(),
      status: "approved",
      createdAt: new Date(),
    };

    const result = await db.collection("vote_comments").insertOne(comment);

    return NextResponse.json(
      { ...comment, _id: result.insertedId },
      { status: 201 }
    );
  } catch (error) {
    console.error("添加评论失败:", error);
    return NextResponse.json(
      { error: "添加评论失败" },
      { status: 500 }
    );
  }
}
