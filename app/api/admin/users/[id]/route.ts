import { connectToDatabase } from "@/lib/mongodb";
import { getUserFromRequest } from "@/lib/auth";
import { isAdminUser, tryParseObjectId, unauth, forbidden, notFound, badRequest, serverError } from "@/lib/api-helpers";
import { NextRequest, NextResponse } from "next/server";

// GET /api/admin/users/[id] - 获取单个用户详情
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = getUserFromRequest(request);
  if (!user) return unauth();
  if (!isAdminUser(user.userId)) return forbidden();

  try {
    const { id } = await params;
    const { db } = await connectToDatabase();

    // 数据库中存在两种 _id 格式：
    //   - MongoDB ObjectId（正式部署，24位十六进制）
    //   - 字符串 ID（本地 JSON 备用数据库）
    // 先尝试 ObjectId，找不到再用字符串 fallback。
    const objectId = tryParseObjectId(id);
    const foundUser =
      (objectId
        ? await db.collection("users").findOne({ _id: objectId }, { projection: { passwordHash: 0 } })
        : null) ??
      (await db.collection("users").findOne(
        { _id: id } as Record<string, unknown>,
        { projection: { passwordHash: 0 } }
      ));

    if (!foundUser) return notFound("用户不存在");

    return NextResponse.json({
      ...foundUser,
      id: foundUser._id?.toString?.() ?? String(foundUser._id),
      _id: undefined,
    });
  } catch (error) {
    console.error("获取用户详情失败:", error);
    return serverError("获取用户详情失败");
  }
}

// PUT /api/admin/users/[id] - 更新用户信息
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = getUserFromRequest(request);
  if (!user) return unauth();
  if (!isAdminUser(user.userId)) return forbidden();

  try {
    const { id } = await params;
    const body = await request.json();
    const { username, password, bio, realName, classId, verified, disabled, avatar } = body;

    const { db } = await connectToDatabase();

    const objectId = tryParseObjectId(id);
    const existingUser =
      (objectId ? await db.collection("users").findOne({ _id: objectId }) : null) ??
      (await db.collection("users").findOne({ _id: id } as Record<string, unknown>));

    if (!existingUser) return notFound("用户不存在");

    const updateData: Record<string, unknown> = {};

    if (username !== undefined) {
      // Ensure the new username isn't already taken by a different user
      const otherUser = await db.collection("users").findOne({ username });
      const otherId = otherUser?._id?.toString?.() ?? String(otherUser?._id);
      if (otherUser && otherId !== id) return badRequest("用户名已被使用");
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
    updateData.updatedAt = new Date();

    const filter = objectId
      ? { _id: objectId }
      : ({ _id: id } as Record<string, unknown>);
    await db.collection("users").updateOne(filter, { $set: updateData });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("更新用户失败:", error);
    return serverError("更新用户失败");
  }
}

// DELETE /api/admin/users/[id] - 删除用户
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = getUserFromRequest(request);
  if (!user) return unauth();
  if (!isAdminUser(user.userId)) return forbidden();

  try {
    const { id } = await params;
    const { db } = await connectToDatabase();

    const objectId = tryParseObjectId(id);
    const foundUser =
      (objectId ? await db.collection("users").findOne({ _id: objectId }) : null) ??
      (await db.collection("users").findOne({ _id: id } as Record<string, unknown>));

    if (!foundUser) return notFound("用户不存在");

    // Guard against accidentally deleting the built-in admin entry
    if (String(foundUser._id) === "offline_admin") {
      return badRequest("不能删除管理员账户");
    }

    const filter = objectId
      ? { _id: objectId }
      : ({ _id: id } as Record<string, unknown>);
    await db.collection("users").deleteOne(filter);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("删除用户失败:", error);
    return serverError("删除用户失败");
  }
}
