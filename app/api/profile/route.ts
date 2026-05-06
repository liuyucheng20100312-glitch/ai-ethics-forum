import { connectToDatabase } from "@/lib/mongodb";
import { getUserFromRequest } from "@/lib/auth";
import { findUserByIdentity, updateUserProfileFields } from "@/lib/user-profile-store";
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";

export async function GET(request: NextRequest) {
  const user = getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { db } = await connectToDatabase();
  const doc = await findUserByIdentity(db, user);
  if (!doc) return NextResponse.json({ error: "用户不存在" }, { status: 404 });

  return NextResponse.json({
    userId: String(doc._id),
    username: doc.username,
    nickname: doc.nickname ?? doc.username,
    bio: doc.bio ?? "",
    avatar: doc.avatar ?? "",
    backgroundImage: doc.backgroundImage ?? "",
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

  if (body.currentPassword !== undefined) {
    const doc = await findUserByIdentity(db, user);
    if (!doc) return NextResponse.json({ error: "用户不存在" }, { status: 404 });

    const match = await bcrypt.compare(body.currentPassword, doc.passwordHash as string);
    if (!match) return NextResponse.json({ error: "当前密码错误" }, { status: 400 });
    if (!body.newPassword || body.newPassword.length < 6) {
      return NextResponse.json({ error: "新密码至少 6 位" }, { status: 400 });
    }
    if (body.newPassword !== body.confirmPassword) {
      return NextResponse.json({ error: "两次密码不一致" }, { status: 400 });
    }

    const hash = await bcrypt.hash(body.newPassword, 10);
    const updated = await updateUserProfileFields(db, user, { passwordHash: hash });
    if (!updated) return NextResponse.json({ error: "未找到用户记录" }, { status: 404 });
    return NextResponse.json({ ok: true });
  }

  const update: Record<string, string> = {};
  if (body.nickname !== undefined) update.nickname = String(body.nickname).trim();
  if (body.bio !== undefined) update.bio = String(body.bio);
  if (body.avatar !== undefined) update.avatar = String(body.avatar);
  if (body.backgroundImage !== undefined) update.backgroundImage = String(body.backgroundImage);

  if (Object.keys(update).length === 0) return NextResponse.json({ ok: true });

  const updated = await updateUserProfileFields(db, user, update);
  if (!updated) {
    return NextResponse.json({ error: "未找到用户记录，请重新登录后重试" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
