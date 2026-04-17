import { connectDB } from "@/lib/mongodb";
import { getUserFromRequest } from "@/lib/auth";
import { detectSensitiveWords } from "@/lib/sensitive";
import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";

// Helper: try to create ObjectId, return null if invalid format
function tryParseObjectId(id: string): ObjectId | null {
  try {
    if (/^[a-fA-F0-9]{24}$/.test(id)) {
      return new ObjectId(id);
    }
    return null;
  } catch {
    return null;
  }
}

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
      author: author || "匿名用户",
      status: "approved",
      createdAt: new Date(),
    };

    const result = await repliesCollection.insertOne(reply);

    // 更新帖子的回复数
    // Try ObjectId first, then fallback to string _id
    const objectId = tryParseObjectId(postId);
    let updateResult = { matchedCount: 0 };
    if (objectId) {
      updateResult = await postsCollection.updateOne(
        { _id: objectId },
        { $inc: { replies: 1 } }
      );
    }
    if (updateResult.matchedCount === 0) {
      await postsCollection.updateOne(
        { _id: postId } as any,
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
