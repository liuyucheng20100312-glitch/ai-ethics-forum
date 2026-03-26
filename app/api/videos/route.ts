import { connectToDatabase } from "@/lib/mongodb";
import { getUserFromRequest } from "@/lib/auth";
import { detectSensitiveWords, createModerationRecord } from "@/lib/sensitive";
import { NextRequest, NextResponse } from "next/server";

// 检查是否是管理员
function isAdmin(userId: string | undefined): boolean {
  return userId === "offline_admin";
}

// GET: 获取所有视频
export async function GET(request: NextRequest) {
  try {
    const { db } = await connectToDatabase();
    const { searchParams } = new URL(request.url);
    const adminView = searchParams.get("adminView") === "true";
    const user = getUserFromRequest(request);

    const query: any = {};
    // 普通用户只能看到上架的视频，管理员可以看到所有
    if (!isAdmin(user?.userId) || !adminView) {
      query.isVisible = { $ne: false }; // 默认上架，只有显式设为false才是下架
    }

    const videos = await db
      .collection("videos")
      .find(query)
      .sort({ createdAt: -1 })
      .toArray();

    return NextResponse.json(videos);
  } catch (error) {
    console.error("获取视频失败:", error);
    return NextResponse.json(
      { error: "获取视频失败" },
      { status: 500 }
    );
  }
}

// POST: 创建新视频（仅管理员）
export async function POST(request: NextRequest) {
  const user = getUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  // 只有管理员可以发布视频
  if (!isAdmin(user.userId)) {
    return NextResponse.json({ error: "无权限发布视频" }, { status: 403 });
  }

  try {
    const { db } = await connectToDatabase();
    const body = await request.json();

    const { title, titleEn, uploader, uploaderEn, coverImage, videoUrl, content, contentEn } = body;

    // 验证必填字段
    if (!title || !uploader || !coverImage || !videoUrl || !content) {
      return NextResponse.json(
        { error: "缺少必填字段" },
        { status: 400 }
      );
    }

    // 检测敏感词
    const textToCheck = `${title} ${uploader} ${content}`;
    const sensitiveResult = await detectSensitiveWords(textToCheck);

    // 决定审核状态：有敏感词则待审核（隐藏），否则直接上架
    const isVisible = !sensitiveResult.found;

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
      isVisible,           // 是否上架
      viewCount: 0,        // 浏览次数
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await db.collection("videos").insertOne(newVideo);
    const videoId = result.insertedId.toString();

    // 如果有敏感词，创建审核记录
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
    return NextResponse.json(
      { error: "创建视频失败" },
      { status: 500 }
    );
  }
}
