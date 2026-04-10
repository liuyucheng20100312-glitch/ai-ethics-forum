import { connectToDatabase } from "@/lib/mongodb";
import { getUserFromRequest } from "@/lib/auth";
import { detectSensitiveWords, createModerationRecord } from "@/lib/sensitive";
import { unauth, badRequest, serverError } from "@/lib/api-helpers";
import { NextRequest, NextResponse } from "next/server";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/**
 * GET: 获取帖子列表，支持 ?author=、?page=、?limit= 参数
 *
 * 返回格式: { posts, total, page, totalPages }
 * （注意：不是裸数组。前端已兼容两种格式。）
 */
export async function GET(request: NextRequest) {
  try {
    const { db } = await connectToDatabase();
    const { searchParams } = new URL(request.url);
    const authorFilter = searchParams.get("author");
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(searchParams.get("limit") || String(DEFAULT_LIMIT), 10)));

    const query: Record<string, unknown> = {};
    if (authorFilter) query.author = authorFilter;

    // 只显示已审核通过的帖子；同时保留没有 status 字段的历史旧帖（视为已审核通过）
    query.$or = [
      { status: "approved" },
      { status: { $exists: false } }, // 兼容引入审核系统前的旧数据
    ];

    const total = await db.collection("posts").countDocuments(query);
    const posts = await db
      .collection("posts")
      .find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .toArray();

    return NextResponse.json({
      posts,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error("获取帖子失败:", error);
    return serverError("获取帖子失败");
  }
}

/**
 * POST: 创建新帖子（需要登录）
 *
 * 安全说明：author/authorId 从 JWT token 中取，不接受客户端传入，
 * 防止用户伪造他人身份发帖。
 */
export async function POST(request: NextRequest) {
  const user = getUserFromRequest(request);
  if (!user) return unauth();

  try {
    const { db } = await connectToDatabase();
    const body = await request.json();
    const { title, titleEn, category, content, contentEn, linkUrl } = body;

    if (!title || !category || !content) {
      return badRequest("缺少必填字段");
    }

    // 验证链接格式（如果提供）
    let validatedLinkUrl: string | undefined;
    if (linkUrl && linkUrl.trim()) {
      try {
        const url = new URL(linkUrl.trim());
        if (url.protocol !== "http:" && url.protocol !== "https:") {
          return badRequest("链接必须是有效的HTTP或HTTPS地址");
        }
        validatedLinkUrl = linkUrl.trim();
      } catch {
        return badRequest("链接格式无效");
      }
    }

    // 检测敏感词
    const textToCheck = `${title} ${content}`;
    const sensitiveResult = await detectSensitiveWords(textToCheck);

    // 有敏感词则待审核，否则直接通过
    const postStatus = sensitiveResult.found ? "pending" : "approved";

    const newPost = {
      title,
      titleEn: titleEn || "",
      // Author is always derived from the verified JWT token, never from the request body
      author: user.username,
      authorId: user.userId,
      category,
      content,
      contentEn: contentEn || "",
      linkUrl: validatedLinkUrl || "",
      replies: 0,
      status: postStatus,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await db.collection("posts").insertOne(newPost);
    const postId = result.insertedId.toString();

    if (sensitiveResult.found) {
      await createModerationRecord({
        contentType: "post",
        contentId: postId,
        author: user.username,
        authorId: user.userId,
        content: textToCheck,
        sensitiveWords: sensitiveResult.words,
        status: "pending",
      });
    }

    return NextResponse.json(
      { ...newPost, _id: result.insertedId },
      { status: 201 }
    );
  } catch (error) {
    console.error("创建帖子失败:", error);
    return serverError("创建帖子失败");
  }
}
