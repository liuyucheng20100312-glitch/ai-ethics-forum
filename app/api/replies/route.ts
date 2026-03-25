import { connectDB } from "@/lib/mongodb";
import { getUserFromRequest } from "@/lib/auth";
import { detectSensitiveWords, createModerationRecord } from "@/lib/sensitive";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const postId = searchParams.get("postId");

    if (!postId) {
      return NextResponse.json(
        { error: "postId 参数缺失" },
        { status: 400 }
      );
    }

    const db = await connectDB();
    const repliesCollection = db.collection("replies");

    // 不显示被拒绝的回复
    const replies = await repliesCollection
      .find({ postId, status: { $ne: "rejected" } })
      .sort({ createdAt: -1 })
      .toArray();

    return NextResponse.json(replies);
  } catch (error) {
    return NextResponse.json(
      { error: "获取回复失败" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const user = getUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { postId, content, author } = body;

    if (!postId || !content) {
      return NextResponse.json(
        { error: "缺少必要字段" },
        { status: 400 }
      );
    }

    const db = await connectDB();
    const repliesCollection = db.collection("replies");
    const postsCollection = db.collection("posts");

    // 检测敏感词
    const sensitiveResult = await detectSensitiveWords(content);

    // 决定审核状态
    const replyStatus = sensitiveResult.found ? "pending" : "approved";

    const reply = {
      postId,
      content,
      author: author || "匿名用户",
      status: replyStatus,
      createdAt: new Date(),
    };

    const result = await repliesCollection.insertOne(reply);
    const replyId = result.insertedId.toString();

    // 如果有敏感词，创建审核记录
    if (sensitiveResult.found) {
      await createModerationRecord({
        contentType: "reply",
        contentId: replyId,
        author: author || "匿名用户",
        authorId: user.userId,
        content: content,
        sensitiveWords: sensitiveResult.words,
        status: "pending",
      });
    }

    // 更新帖子的回复数（只有审核通过的才计入）
    if (replyStatus === "approved") {
      await postsCollection.updateOne(
        { _id: postId },
        { $inc: { replies: 1 } }
      );
    }

    return NextResponse.json(
      { _id: result.insertedId, ...reply },
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: "创建回复失败" },
      { status: 500 }
    );
  }
}
