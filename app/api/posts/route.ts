import { connectToDatabase } from "@/lib/mongodb";
import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";

// GET: 获取所有帖子，支持 ?author= 过滤
export async function GET(request: NextRequest) {
  try {
    const { db } = await connectToDatabase();
    const { searchParams } = new URL(request.url);
    const authorFilter = searchParams.get("author");
    const query = authorFilter ? { author: authorFilter } : {};

    const posts = await db
      .collection("posts")
      .find(query)
      .sort({ createdAt: -1 })
      .toArray();

    return NextResponse.json(posts);
  } catch (error) {
    console.error("获取帖子失败:", error);
    return NextResponse.json(
      { error: "获取帖子失败" },
      { status: 500 }
    );
  }
}

// POST: 创建新帖子
export async function POST(request: NextRequest) {
  try {
    const { db } = await connectToDatabase();
    const body = await request.json();

    const { title, author, category, content } = body;

    // 验证必填字段
    if (!title || !author || !category || !content) {
      return NextResponse.json(
        { error: "缺少必填字段" },
        { status: 400 }
      );
    }

    const newPost = {
      title,
      author,
      category,
      content,
      replies: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await db.collection("posts").insertOne(newPost);

    return NextResponse.json(
      { ...newPost, _id: result.insertedId },
      { status: 201 }
    );
  } catch (error) {
    console.error("创建帖子失败:", error);
    return NextResponse.json(
      { error: "创建帖子失败" },
      { status: 500 }
    );
  }
}