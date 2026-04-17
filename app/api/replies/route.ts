import { connectDB } from "@/lib/mongodb";
import { getUserFromRequest } from "@/lib/auth";
import { detectSensitiveWords } from "@/lib/sensitive";
import { unauth, badRequest, serverError, tryParseObjectId } from "@/lib/api-helpers";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const postId = request.nextUrl.searchParams.get("postId");
    if (!postId) return badRequest("postId 参数缺失");

    const db = await connectDB();
    // 不显示被拒绝的回复
    const replies = await db
      .collection("replies")
      .find({ postId, status: { $ne: "rejected" } })
      .sort({ createdAt: -1 })
      .toArray();

    return NextResponse.json(replies);
  } catch {
    return serverError("获取回复失败");
  }
}

export async function POST(request: NextRequest) {
  const user = getUserFromRequest(request);
  if (!user) return unauth();

  try {
    const body = await request.json();
    const { postId, content } = body;

    if (!postId || !content) return badRequest("缺少必要字段");

    const db = await connectDB();

    // 检测敏感词
    const sensitiveResult = await detectSensitiveWords(content);

    // 如果检测到敏感词，直接拒绝提交，提示用户修改
    if (sensitiveResult.found) {
      const sensitiveWordList = sensitiveResult.words.map(w => w.word).join("、");
      return NextResponse.json(
        { error: `您的回复包含敏感词，请修改后重新提交。敏感词：${sensitiveWordList}` },
        { status: 400 }
      );
    }

    const reply = {
      postId,
      content,
      // Author is always derived from the verified JWT token
      author: user.username,
      authorId: user.userId,
      status: "approved",
      createdAt: new Date(),
    };

    const result = await db.collection("replies").insertOne(reply);

    // 只有审核通过的回复才计入回复数
    // Use tryParseObjectId to correctly match MongoDB ObjectId _id
    const objectId = tryParseObjectId(postId);
    if (objectId) {
      await db.collection("posts").updateOne(
        { _id: objectId },
        { $inc: { replies: 1 } }
      );
    } else {
      // Fallback for local-db string IDs
      await db.collection("posts").updateOne(
        { _id: postId } as Record<string, unknown>,
        { $inc: { replies: 1 } }
      );
    }

    return NextResponse.json(
      { _id: result.insertedId, ...reply },
      { status: 201 }
    );
  } catch {
    return serverError("创建回复失败");
  }
}
