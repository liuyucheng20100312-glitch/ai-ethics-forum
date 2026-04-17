import { connectToDatabase } from "@/lib/mongodb";
import { getUserFromRequest } from "@/lib/auth";
import { createModerationRecord, detectSensitiveWords } from "@/lib/sensitive";
import { isAdminUser, unauth, forbidden, badRequest, serverError } from "@/lib/api-helpers";
import { NextRequest, NextResponse } from "next/server";

// GET: 获取所有视频
export async function GET(request: NextRequest) {
  try {
    const { db } = await connectToDatabase();
    const { searchParams } = new URL(request.url);
    const adminView = searchParams.get("adminView") === "true";
    const user = getUserFromRequest(request);

    const query: Record<string, unknown> = {};
    // 普通用户只能看到上架的视频
    if (!isAdminUser(user?.userId) || !adminView) {
      query.isVisible = { $ne: false };
    }

    const videos = await db
      .collection("videos")
      .find(query)
      .sort({ createdAt: -1 })
      .toArray();

    return NextResponse.json(videos);
  } catch (error) {
    console.error("获取视频失败:", error);
    return serverError("获取视频失败");
  }
}

// POST: 创建新视频（仅管理员）
export async function POST(request: NextRequest) {
  const user = getUserFromRequest(request);
  if (!user) return unauth();
  if (!isAdminUser(user.userId)) return forbidden();

  try {
    const { db } = await connectToDatabase();
    const body = await request.json();
    const { title, titleEn, uploader, uploaderEn, coverImage, videoUrl, content, contentEn, forcePublish } = body;

    if (!title || !uploader || !coverImage || !videoUrl || !content) {
      return badRequest("缺少必填字段");
    }

    // 检测敏感词
    const textToCheck = `${title} ${uploader} ${content}`;
    const sensitiveResult = await detectSensitiveWords(textToCheck);

    // 如果检测到敏感词，提示管理员
    if (sensitiveResult.found && !forcePublish) {
      const sensitiveWordList = sensitiveResult.words.map(w => w.word).join("、");
      return NextResponse.json(
        {
          error: `视频包含敏感词：${sensitiveWordList}`,
          sensitiveWords: sensitiveResult.words,
          requiresConfirmation: true
        },
        { status: 400 }
      );
    }

    const newVideo = {
      title,
      titleEn: titleEn || "",
      uploader,
      uploaderEn: uploaderEn || "",
      coverImage,
      videoUrl,
      content,
      contentEn: contentEn || "",
      author: user.username,
      authorId: user.userId,
      isVisible: true,         // 直接上架
      viewCount: 0,            // 浏览次数
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await db.collection("videos").insertOne(newVideo);
    const videoId = result.insertedId.toString();

    if (sensitiveResult.found) {
      await createModerationRecord({
        contentType: "video",
        contentId: videoId,
        author: user.username,
        authorId: user.userId,
        content: textToCheck,
        sensitiveWords: sensitiveResult.words,
        status: "pending",
      });
    }

    return NextResponse.json(
      { ...newVideo, _id: result.insertedId },
      { status: 201 }
    );
  } catch (error) {
    console.error("创建视频失败:", error);
    return serverError("创建视频失败");
  }
}
