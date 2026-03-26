import { connectToDatabase } from "@/lib/mongodb";
import { getUserFromRequest } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";

// 检查是否是管理员
function isAdmin(userId: string | undefined): boolean {
  return userId === "offline_admin";
}

// GET: 获取单个视频详情
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { db } = await connectToDatabase();

    let video;
    try {
      video = await db.collection("videos").findOne({ _id: new ObjectId(id) });
    } catch {
      video = await db.collection("videos").findOne({ _id: id as never });
    }

    if (!video) {
      return NextResponse.json({ error: "视频不存在" }, { status: 404 });
    }

    // 增加浏览次数
    try {
      await db.collection("videos").updateOne(
        { _id: new ObjectId(id) },
        { $inc: { viewCount: 1 } }
      );
    } catch {
      await db.collection("videos").updateOne(
        { _id: id as never },
        { $inc: { viewCount: 1 } }
      );
    }

    return NextResponse.json(video);
  } catch (error) {
    console.error("获取视频详情失败:", error);
    return NextResponse.json(
      { error: "获取视频详情失败" },
      { status: 500 }
    );
  }
}

// PUT: 更新视频（仅管理员）
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = getUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  if (!isAdmin(user.userId)) {
    return NextResponse.json({ error: "无权限修改视频" }, { status: 403 });
  }

  try {
    const { id } = await params;
    const { db } = await connectToDatabase();
    const body = await request.json();

    let video;
    try {
      video = await db.collection("videos").findOne({ _id: new ObjectId(id) });
    } catch {
      video = await db.collection("videos").findOne({ _id: id as never });
    }

    if (!video) {
      return NextResponse.json({ error: "视频不存在" }, { status: 404 });
    }

    const updateData: any = {
      updatedAt: new Date(),
    };

    // 可更新的字段
    if (body.title) updateData.title = body.title;
    if (body.titleEn !== undefined) updateData.titleEn = body.titleEn;
    if (body.uploader) updateData.uploader = body.uploader;
    if (body.uploaderEn !== undefined) updateData.uploaderEn = body.uploaderEn;
    if (body.coverImage) updateData.coverImage = body.coverImage;
    if (body.videoUrl) updateData.videoUrl = body.videoUrl;
    if (body.content) updateData.content = body.content;
    if (body.contentEn !== undefined) updateData.contentEn = body.contentEn;
    if (body.isVisible !== undefined) updateData.isVisible = body.isVisible;

    try {
      await db.collection("videos").updateOne(
        { _id: new ObjectId(id) },
        { $set: updateData }
      );
    } catch {
      await db.collection("videos").updateOne(
        { _id: id as never },
        { $set: updateData }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("更新视频失败:", error);
    return NextResponse.json(
      { error: "更新视频失败" },
      { status: 500 }
    );
  }
}

// DELETE: 删除视频（仅管理员）
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = getUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  if (!isAdmin(user.userId)) {
    return NextResponse.json({ error: "无权限删除视频" }, { status: 403 });
  }

  try {
    const { id } = await params;
    const { db } = await connectToDatabase();

    let video;
    try {
      video = await db.collection("videos").findOne({ _id: new ObjectId(id) });
    } catch {
      video = await db.collection("videos").findOne({ _id: id as never });
    }

    if (!video) {
      return NextResponse.json({ error: "视频不存在" }, { status: 404 });
    }

    try {
      await db.collection("videos").deleteOne({ _id: new ObjectId(id) });
    } catch {
      await db.collection("videos").deleteOne({ _id: id as never });
    }

    // 同时删除相关的评论
    await db.collection("video_comments").deleteMany({ videoId: id });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("删除视频失败:", error);
    return NextResponse.json(
      { error: "删除视频失败" },
      { status: 500 }
    );
  }
}
