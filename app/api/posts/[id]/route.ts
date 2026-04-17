import { connectDB } from "@/lib/mongodb";
import { getUserFromRequest } from "@/lib/auth";
import { ObjectId } from "mongodb";
import { NextRequest, NextResponse } from "next/server";

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

// 检查是否是管理员
function isAdmin(userId: string | undefined): boolean {
  return userId === "offline_admin";
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const db = await connectDB();
    const postsCollection = db.collection("posts");

    // Try ObjectId first, then fallback to string _id (for migrated data)
    let post = null;
    const objectId = tryParseObjectId(id);
    if (objectId) {
      post = await postsCollection.findOne({ _id: objectId });
    }
    if (!post) {
      // Fallback: search by string _id (supports migrated localdb data)
      post = await postsCollection.findOne({ _id: id });
    }

    if (!post) {
      return NextResponse.json({ error: "帖子不存在" }, { status: 404 });
    }

    return NextResponse.json(post);
  } catch (error) {
    return NextResponse.json(
      { error: "获取帖子失败" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const update: Record<string, string> = {};
    if (typeof body.titleEn === "string") update.titleEn = body.titleEn;
    if (typeof body.contentEn === "string") update.contentEn = body.contentEn;

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    const db = await connectDB();

    // Try ObjectId first, then fallback to string _id
    let result = { matchedCount: 0, modifiedCount: 0 };
    const objectId = tryParseObjectId(id);
    if (objectId) {
      result = await db.collection("posts").updateOne(
        { _id: objectId },
        { $set: { ...update, updatedAt: new Date().toISOString() } }
      );
    }
    if (result.matchedCount === 0) {
      result = await db.collection("posts").updateOne(
        { _id: id } as any,
        { $set: { ...update, updatedAt: new Date().toISOString() } }
      );
    }

    if (result.matchedCount === 0) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}

// DELETE: 删除帖子（作者可删自己的，管理员可删所有）
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const user = getUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    const db = await connectDB();
    const postsCollection = db.collection("posts");

    // 查找帖子
    let post = null;
    const objectId = tryParseObjectId(id);
    if (objectId) {
      post = await postsCollection.findOne({ _id: objectId });
    }
    if (!post) {
      post = await postsCollection.findOne({ _id: id });
    }

    if (!post) {
      return NextResponse.json({ error: "帖子不存在" }, { status: 404 });
    }

    // 权限检查：作者或管理员可删除
    const isOwner = post.author === user.username;
    const admin = isAdmin(user.userId);
    if (!isOwner && !admin) {
      return NextResponse.json({ error: "无权限删除此帖子" }, { status: 403 });
    }

    // 删除帖子
    if (objectId) {
      await postsCollection.deleteOne({ _id: objectId });
    } else {
      await postsCollection.deleteOne({ _id: id } as any);
    }

    // 删除相关回复
    await db.collection("replies").deleteMany({ postId: id });

    // 删除相关点赞
    await db.collection("likes").deleteMany({ postId: id });

    // 删除相关审核记录
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