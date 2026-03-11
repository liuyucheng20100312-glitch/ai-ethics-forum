import { connectToDatabase } from "@/lib/mongodb";
import { getUserFromRequest } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";

function tryObjectId(id: string) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { ObjectId } = require("mongodb");
    return new ObjectId(id);
  } catch {
    return id;
  }
}

export async function GET(request: NextRequest) {
  const user = getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { db } = await connectToDatabase();
  let doc = await db.collection("users").findOne({ _id: tryObjectId(user.userId) as never });
  // Fallback: match by username if _id lookup fails
  if (!doc) {
    doc = await db.collection("users").findOne({ username: user.username } as never);
  }
  if (!doc) return NextResponse.json({ error: "用户不存在" }, { status: 404 });

  return NextResponse.json({
    userId: String(doc._id),
    username: doc.username,
    nickname: doc.nickname ?? doc.username,
    bio: doc.bio ?? "",
    avatar: doc.avatar ?? "",
    realName: doc.realName ?? "",
    classId: doc.classId ?? "",
    verified: doc.verified ?? false,
  });
}

export async function PUT(request: NextRequest) {
  const user = getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const body = await request.json();
  const { db } = await connectToDatabase();
  const users = db.collection("users");

  const userIdFilter = { _id: tryObjectId(user.userId) as never };

  if (body.currentPassword !== undefined) {
    const doc = await users.findOne(userIdFilter);
    if (!doc) return NextResponse.json({ error: "用户不存在" }, { status: 404 });
    const match = await bcrypt.compare(body.currentPassword, doc.passwordHash as string);
    if (!match) return NextResponse.json({ error: "当前密码错误" }, { status: 400 });
    if (!body.newPassword || body.newPassword.length < 6)
      return NextResponse.json({ error: "新密码至少6位" }, { status: 400 });
    if (body.newPassword !== body.confirmPassword)
      return NextResponse.json({ error: "两次密码不一致" }, { status: 400 });
    const hash = await bcrypt.hash(body.newPassword, 10);
    await users.updateOne(userIdFilter, { $set: { passwordHash: hash } });
    return NextResponse.json({ ok: true });
  }

  const update: Record<string, string> = {};
  if (body.nickname !== undefined) update.nickname = body.nickname.trim();
  if (body.bio !== undefined) update.bio = body.bio;
  if (body.avatar !== undefined) update.avatar = body.avatar;

  let result = await users.updateOne(userIdFilter, { $set: update });
  if (result.matchedCount === 0) {
    // Fallback: match by username
    await users.updateOne({ username: user.username } as never, { $set: update });
  }
  return NextResponse.json({ ok: true });
}
