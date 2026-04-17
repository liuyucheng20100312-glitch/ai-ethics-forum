import { connectToDatabase } from "@/lib/mongodb";
import { getUserFromRequest } from "@/lib/auth";
import { detectSensitiveWords } from "@/lib/sensitive";
import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";

// GET: 获取所有帖子，支持 ?author= 过滤
export async function GET(request: NextRequest) {
  try {
    const { db } = await connectToDatabase();
    const { searchParams } = new URL(request.url);
    const authorFilter = searchParams.get("author");
    const query: any = authorFilter ? { author: authorFilter } : {};

    // 不显示被拒绝、待审核和已下架的帖子
    // 显示：1) status为approved的帖子 2) 没有status字段的旧帖子（视为已审核）
    query.$or = [
      { status: "approved" },
      { status: { $exists: false } }
    ];

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
  const user = getUserFromRequest(request);

  try {
    const { db } = await connectToDatabase();
    const body = await request.json();

    const { title, titleEn, author, category, content, contentEn, linkUrl } = body;

    // 验证必填字段
    if (!title || !author || !category || !content) {
      return NextResponse.json(
        { error: "缺少必填字段" },
        { status: 400 }
      );
    }

    // 验证链接格式（如果提供）
    let validatedLinkUrl: string | undefined;
    if (linkUrl && linkUrl.trim()) {
      try {
        const url = new URL(linkUrl.trim());
        if (url.protocol !== "http:" && url.protocol !== "https:") {
          return NextResponse.json(
            { error: "链接必须是有效的HTTP或HTTPS地址" },
            { status: 400 }
          );
        }
        validatedLinkUrl = linkUrl.trim();
      } catch {
        return NextResponse.json(
          { error: "链接格式无效" },
          { status: 400 }
        );
      }
    }

    // 检测敏感词
    const textToCheck = `${title} ${content}`;
    const sensitiveResult = await detectSensitiveWords(textToCheck);

    // 如果检测到敏感词，直接拒绝提交，提示用户修改
    if (sensitiveResult.found) {
      const sensitiveWordList = sensitiveResult.words.map(w => w.word).join("、");
      return NextResponse.json(
        { error: `您的帖子包含敏感词，请修改后重新提交。敏感词：${sensitiveWordList}` },
        { status: 400 }
      );
    }

    const newPost = {
      title,
      titleEn: titleEn || "",
      author,
      category,
      content,
      contentEn: contentEn || "",
      linkUrl: validatedLinkUrl || "",
      replies: 0,
      status: "approved",
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
