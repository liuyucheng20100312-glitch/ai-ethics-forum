import { connectDB } from "@/lib/mongodb";
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

    const replies = await repliesCollection
      .find({ postId })
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
  try {
    const body = await request.json();
    const { postId, content, author } = body;

    if (!postId || !content) {
      return NextResponse.json(
        { error: "缺少必要字��" },
        { status: 400 }
      );
    }

    const db = await connectDB();
    const repliesCollection = db.collection("replies");
    const postsCollection = db.collection("posts");

    const reply = {
      postId,
      content,
      author: author || "匿名用户",
      createdAt: new Date(),
    };

    const result = await repliesCollection.insertOne(reply);

    // 更新帖子的回复数
    await postsCollection.updateOne(
      { _id: postId },
      { $inc: { replies: 1 } }
    );

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