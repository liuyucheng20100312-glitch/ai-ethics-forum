import { connectToDatabase } from "@/lib/mongodb";
import { getUserFromRequest } from "@/lib/auth";
import { createModerationRecord, detectSensitiveWords } from "@/lib/sensitive";
import { isAdminUser } from "@/lib/api-helpers";
import { NextRequest, NextResponse } from "next/server";

// GET: 获取帖子列表，支持 ?author= 过滤
export async function GET(request: NextRequest) {
  try {
    const { db } = await connectToDatabase();
    const { searchParams } = new URL(request.url);
    const authorFilter = searchParams.get("author");
    const query: Record<string, unknown> = authorFilter ? { author: authorFilter } : {};

    // 仅展示已通过审核或历史未标记状态的帖子
    query.$or = [{ status: "approved" }, { status: { $exists: false } }];

    const posts = await db.collection("posts").find(query).sort({ createdAt: -1 }).toArray();
    return NextResponse.json(posts);
  } catch (error) {
    console.error("获取帖子失败:", error);
    return NextResponse.json({ error: "获取帖子失败" }, { status: 500 });
  }
}

// POST: 创建新帖子（作者由 JWT 自动推断）
export async function POST(request: NextRequest) {
  const user = getUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  try {
    const { db } = await connectToDatabase();
    const body = await request.json();
    const { title, titleEn, category, content, contentEn, linkUrl } = body as {
      title?: string;
      titleEn?: string;
      category?: string;
      content?: string;
      contentEn?: string;
      linkUrl?: string;
      forcePublish?: boolean;
    };
    const forcePublish = body?.forcePublish === true;

    if (!title || !category || !content) {
      return NextResponse.json({ error: "缺少必填字段" }, { status: 400 });
    }

    let validatedLinkUrl = "";
    if (linkUrl && linkUrl.trim()) {
      try {
        const parsed = new URL(linkUrl.trim());
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
          return NextResponse.json({ error: "链接必须是有效的 HTTP 或 HTTPS 地址" }, { status: 400 });
        }
        validatedLinkUrl = linkUrl.trim();
      } catch {
        return NextResponse.json({ error: "链接格式无效" }, { status: 400 });
      }
    }

    const textToCheck = `${title} ${content}`;
    const sensitiveResult = await detectSensitiveWords(textToCheck);
    const isAdmin = isAdminUser(user.userId);
    const requiresReviewAfterConfirmation = sensitiveResult.found && !isAdmin;

    if (sensitiveResult.found && !forcePublish) {
      const wordList = sensitiveResult.words.map((word) => word.word).join("、");
      return NextResponse.json(
        {
          error: isAdmin
            ? `帖子包含敏感词：${wordList}`
            : `帖子包含敏感词：${wordList}。若继续提交，将进入管理员审核，审核通过后才会展示。`,
          sensitiveWords: sensitiveResult.words,
          requiresConfirmation: true,
          requiresReviewAfterConfirmation,
        },
        { status: 400 }
      );
    }

    const now = new Date();
    const postStatus = requiresReviewAfterConfirmation ? "pending" : "approved";
    const newPost = {
      title,
      titleEn: titleEn || "",
      author: user.username,
      authorId: user.userId,
      category,
      content,
      contentEn: contentEn || "",
      linkUrl: validatedLinkUrl,
      replies: 0,
      status: postStatus,
      createdAt: now,
      updatedAt: now,
    };

    const result = await db.collection("posts").insertOne(newPost);

    if (sensitiveResult.found) {
      try {
        await createModerationRecord({
          contentType: "post",
          contentId: result.insertedId.toString(),
          author: user.username,
          authorId: user.userId,
          content: textToCheck,
          sensitiveWords: sensitiveResult.words,
          status: "pending",
        });
      } catch (moderationError) {
        console.error("创建帖子审核记录失败:", moderationError);
      }
    }

    return NextResponse.json({ ...newPost, _id: result.insertedId }, { status: 201 });
  } catch (error) {
    console.error("创建帖子失败:", error);
    return NextResponse.json({ error: "创建帖子失败" }, { status: 500 });
  }
}