import { connectToDatabase } from "@/lib/mongodb";
import { getUserFromRequest } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";

// 检查是否是管理员
function isAdmin(userId: string | undefined): boolean {
  return userId === "offline_admin";
}

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

// GET: 获取单个帖子详情
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = getUserFromRequest(request);
  if (!user || !isAdmin(user.userId)) {
    return NextResponse.json({ error: "无权限访问" }, { status: 403 });
  }

  try {
    const { id } = await params;
    const { db } = await connectToDatabase();

    let post = null;
    const objectId = tryParseObjectId(id);
    if (objectId) {
      post = await db.collection("posts").findOne({ _id: objectId });
    }
    if (!post) {
      post = await db.collection("posts").findOne({ _id: id });
    }

    if (!post) {
      return NextResponse.json({ error: "帖子不存在" }, { status: 404 });
    }

    // 获取回复数
    const replyCount = await db.collection("replies").countDocuments({ postId: id });

    return NextResponse.json({ ...post, replyCount });
  } catch (error) {
    console.error("获取帖子详情失败:", error);
    return NextResponse.json({ error: "获取帖子详情失败" }, { status: 500 });
  }
}

// PUT: 更新帖子状态（上架/下架/通过/拒绝）
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = getUserFromRequest(request);
  if (!user || !isAdmin(user.userId)) {
    return NextResponse.json({ error: "无权限操作" }, { status: 403 });
  }

  try {
    const { id } = await params;
    const { db } = await connectToDatabase();
    const body = await request.json();

    const { status, adminNote } = body;

    // 验证状态值
    const validStatuses = ["approved", "pending", "rejected", "hidden"];
    if (!validStatuses.includes(status)) {
      return NextResponse.json({ error: "无效的状态值" }, { status: 400 });
    }

    // 查找帖子
    let post = null;
    const objectId = tryParseObjectId(id);
    if (objectId) {
      post = await db.collection("posts").findOne({ _id: objectId });
    }
    if (!post) {
      post = await db.collection("posts").findOne({ _id: id });
    }

    if (!post) {
      return NextResponse.json({ error: "帖子不存在" }, { status: 404 });
    }

    // 更新帖子状态
    const updateData: any = {
      status,
      updatedAt: new Date(),
      reviewedBy: user.username,
      reviewedAt: new Date(),
    };

    if (adminNote) {
      updateData.adminNote = adminNote;
    }

    if (status === "approved") {
      updateData.approvedAt = new Date();
    } else if (status === "rejected") {
      updateData.rejectedAt = new Date();
    } else if (status === "hidden") {
      updateData.hiddenAt = new Date();
    }

    // 更新帖子
    if (objectId) {
      await db.collection("posts").updateOne(
        { _id: objectId },
        { $set: updateData }
      );
    } else {
      await db.collection("posts").updateOne(
        { _id: id } as any,
        { $set: updateData }
      );
    }

    return NextResponse.json({ ok: true, status });
  } catch (error) {
    console.error("更新帖子状态失败:", error);
    return NextResponse.json({ error: "更新帖子状态失败" }, { status: 500 });
  }
}

// DELETE: 删除帖子
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = getUserFromRequest(request);
  if (!user || !isAdmin(user.userId)) {
    return NextResponse.json({ error: "无权限操作" }, { status: 403 });
  }

  try {
    const { id } = await params;
    const { db } = await connectToDatabase();

    // 查找帖子
    let post = null;
    const objectId = tryParseObjectId(id);
    if (objectId) {
      post = await db.collection("posts").findOne({ _id: objectId });
    }
    if (!post) {
      post = await db.collection("posts").findOne({ _id: id });
    }

    if (!post) {
      return NextResponse.json({ error: "帖子不存在" }, { status: 404 });
    }

    // 删除帖子
    if (objectId) {
      await db.collection("posts").deleteOne({ _id: objectId });
    } else {
      await db.collection("posts").deleteOne({ _id: id } as any);
    }

    // 删除相关回复
    await db.collection("replies").deleteMany({ postId: id });

    // 删除相关审核记录（如果有）
    await db.collection("moderation_records").deleteMany({
      contentId: id,
      contentType: "post"
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("删除帖子失败:", error);
    return NextResponse.json({ error: "删除帖子失败" }, { status: 500 });
  }
}
