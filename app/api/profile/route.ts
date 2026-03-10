import { connectToDatabase } from "@/lib/mongodb";
import { getUserFromRequest } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import bcrypt from "bcryptjs";

// GET /api/profile - get own profile
export async function GET(request: NextRequest) {
  const user = getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { db } = await connectToDatabase();
  const doc = await db.collection("users").findOne({ _id: new ObjectId(user.userId) });
  if (!doc) return NextResponse.json({ error: "用户不存在" }, { status: 404 });

  return NextResponse.json({
    userId: String(doc._id),
    username: doc.username,
    bio: doc.bio ?? "",
    avatar: doc.avatar ?? "",
  });
}

// PUT /api/profile - update profile or change password
export async function PUT(request: NextRequest) {
  const user = getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const body = await request.json();
  const { db } = await connectToDatabase();
  const users = db.collection("users");

  // Password change
  if (body.currentPassword !== undefined) {
    const doc = await users.findOne({ _id: new ObjectId(user.userId) });
    if (!doc) return NextResponse.json({ error: "用户不存在" }, { status: 404 });
    const match = await bcrypt.compare(body.currentPassword, doc.passwordHash);
    if (!match) return NextResponse.json({ error: "当前密码错误" }, { status: 400 });
    if (!body.newPassword || body.newPassword.length < 6)
      return NextResponse.json({ error: "新密码至少6位" }, { status: 400 });
    if (body.newPassword !== body.confirmPassword)
      return NextResponse.json({ error: "两次密码不一致" }, { status: 400 });
    const hash = await bcrypt.hash(body.newPassword, 10);
    await users.updateOne({ _id: new ObjectId(user.userId) }, { $set: { passwordHash: hash } });
    return NextResponse.json({ ok: true });
  }

  // Profile update
  const update: Record<string, string> = {};
  if (body.username !== undefined) {
    // check uniqueness (skip if same)
    const existing = await users.findOne({ username: body.username.trim(), _id: { $ne: new ObjectId(user.userId) } });
    if (existing) return NextResponse.json({ error: "用户名已被占用" }, { status: 409 });
    update.username = body.username.trim();
  }
  if (body.bio !== undefined) update.bio = body.bio;
  if (body.avatar !== undefined) update.avatar = body.avatar;

  await users.updateOne({ _id: new ObjectId(user.userId) }, { $set: update });
  return NextResponse.json({ ok: true });
}
