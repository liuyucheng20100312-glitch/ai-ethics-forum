import { connectToDatabase } from "@/lib/mongodb";
import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { ObjectId } from "mongodb";

// 检查管理员权限
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

// GET /api/admin/users/[id] - 获取单个用户详情
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = getUserFromRequest(request);
  if (!user || !isAdmin(user.userId)) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  try {
    const { id } = await params;
    const { db } = await connectToDatabase();

    let foundUser = null;
    const objectId = tryParseObjectId(id);
    if (objectId) {
      foundUser = await db.collection("users").findOne(
        { _id: objectId },
        { projection: { passwordHash: 0 } }
      );
    }
    if (!foundUser) {
      foundUser = await db.collection("users").findOne(
        { _id: id } as Record<string, unknown>,
        { projection: { passwordHash: 0 } }
      );
    }

    if (!foundUser) {
      return NextResponse.json({ error: "用户不存在" }, { status: 404 });
    }

    return NextResponse.json({
      ...foundUser,
      id: foundUser._id?.toString?.() || foundUser._id,
      _id: undefined,
    });
  } catch (error) {
    console.error("获取用户详情失败:", error);
    return NextResponse.json({ error: "获取用户详情失败" }, { status: 500 });
  }
}

// PUT /api/admin/users/[id] - 更新用户
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = getUserFromRequest(request);
  if (!user || !isAdmin(user.userId)) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  try {
    const { id } = await params;
    const body = await request.json();
    const { username, password, bio, realName, classId, verified, disabled, avatar } = body;

    const { db } = await connectToDatabase();

    // 查找用户
    let existingUser: Record<string, unknown> | null = null;
    const objectId = tryParseObjectId(id);
    if (objectId) {
      existingUser = await db.collection("users").findOne({ _id: objectId });
    }
    if (!existingUser) {
      existingUser = await db.collection("users").findOne({ _id: id });
    }
    if (!existingUser) {
      return NextResponse.json({ error: "用户不存在" }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};

    if (username !== undefined) {
      // 检查用户名是否被其他人使用
      const otherUser = await db.collection("users").findOne({ username });
      if (otherUser && (otherUser._id?.toString?.() || otherUser._id) !== id) {
        return NextResponse.json({ error: "用户名已被使用" }, { status: 400 });
      }
      updateData.username = username;
    }

    if (password) {
      const bcrypt = await import("bcryptjs");
      updateData.passwordHash = await bcrypt.hash(password, 10);
    }

    if (bio !== undefined) updateData.bio = bio;
    if (realName !== undefined) updateData.realName = realName;
    if (classId !== undefined) updateData.classId = classId;
    if (verified !== undefined) updateData.verified = verified;
    if (disabled !== undefined) updateData.disabled = disabled;
    if (avatar !== undefined) updateData.avatar = avatar;
    updateData.updatedAt = new Date().toISOString();

    if (objectId) {
      await db.collection("users").updateOne(
        { _id: objectId },
        { $set: updateData }
      );
    } else {
      await db.collection("users").updateOne(
        { _id: id } as Record<string, unknown>,
        { $set: updateData }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("更新用户失败:", error);
    return NextResponse.json({ error: "更新用户失败" }, { status: 500 });
  }
}

// DELETE /api/admin/users/[id] - 删除用户
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = getUserFromRequest(request);
  if (!user || !isAdmin(user.userId)) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  try {
    const { id } = await params;
    const { db } = await connectToDatabase();

    // 查找用户
    let foundUser: Record<string, unknown> | null = null;
    const objectId = tryParseObjectId(id);
    if (objectId) {
      foundUser = await db.collection("users").findOne({ _id: objectId });
    }
    if (!foundUser) {
      foundUser = await db.collection("users").findOne({ _id: id });
    }

    if (!foundUser) {
      return NextResponse.json({ error: "用户不存在" }, { status: 404 });
    }

    // 防止删除管理员自己
    if (foundUser.userId === "offline_admin") {
      return NextResponse.json({ error: "不能删除管理员账户" }, { status: 400 });
    }

    // 删除用户
    if (objectId) {
      await db.collection("users").deleteOne({ _id: objectId });
    } else {
      await db.collection("users").deleteOne({ _id: id } as Record<string, unknown>);
    }

    // 可选：删除用户相关的帖子、回复等
    // await db.collection("posts").deleteMany({ authorId: id });
    // await db.collection("replies").deleteMany({ authorId: id });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("删除用户失败:", error);
    return NextResponse.json({ error: "删除用户失败" }, { status: 500 });
  }
}
