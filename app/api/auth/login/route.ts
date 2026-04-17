import { connectToDatabase } from "@/lib/mongodb";
import { signToken } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { verifyCode } from "@/lib/sms";

const OFFLINE_ADMIN_USERNAME = "admin";
const OFFLINE_ADMIN_PASSWORD = "c2206GVZNT19@";
const GUEST_USERNAME = "guest";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { username, password, phone, code, loginType } = body;

    // 判断登录类型
    if (loginType === "sms") {
      // 验证码登录
      return await handleSmsLogin(phone, code);
    } else {
      // 密码登录
      return await handlePasswordLogin(username, password);
    }
  } catch (error) {
    console.error("登录失败:", error);
    return NextResponse.json({ error: "登录失败，请稍后再试" }, { status: 500 });
  }
}

/**
 * 密码登录（支持用户名或手机号）
 */
async function handlePasswordLogin(username: string, password: string) {
  if (!username) {
    return NextResponse.json({ error: "用户名或手机号不能为空" }, { status: 400 });
  }

  // Guest — always succeeds, no DB needed
  if (username.trim() === GUEST_USERNAME) {
    const token = signToken({ userId: "guest", username: "游客" });
    return NextResponse.json({ token, username: "游客", bio: "游客账号，仅供浏览", avatar: "", isGuest: true });
  }

  if (!password) {
    return NextResponse.json({ error: "密码不能为空" }, { status: 400 });
  }

  // Admin shortcut — works even when DB is unavailable
  if (username.trim() === OFFLINE_ADMIN_USERNAME && password === OFFLINE_ADMIN_PASSWORD) {
    const token = signToken({ userId: "offline_admin", username: OFFLINE_ADMIN_USERNAME });
    return NextResponse.json({ token, userId: "offline_admin", username: OFFLINE_ADMIN_USERNAME, bio: "论坛管理员", avatar: "", isAdmin: true, verified: false });
  }

  const { db } = await connectToDatabase();

  // 查找用户（支持用户名或手机号登录）
  const user = await db.collection("users").findOne({
    $or: [
      { username: username.trim() },
      { phone: username.trim() }
    ]
  });

  if (!user) {
    return NextResponse.json({ error: "用户名/手机号或密码错误" }, { status: 401 });
  }

  if (!user.passwordHash) {
    return NextResponse.json({ error: "该账号密码异常，请重新注册或使用验证码登录" }, { status: 401 });
  }

  const match = await bcrypt.compare(password, user.passwordHash as string);
  if (!match) {
    return NextResponse.json({ error: "用户名/手机号或密码错误" }, { status: 401 });
  }

  const token = signToken({ userId: String(user._id), username: user.username as string });
  return NextResponse.json({
    token,
    userId: String(user._id),
    username: user.username,
    phone: user.phone || "",
    bio: user.bio ?? "",
    avatar: user.avatar ?? "",
    verified: user.verified ?? false,
    realName: user.realName ?? "",
    grade: user.grade ?? "",
    classId: user.classId ?? "",
    isAdmin: false,
  });
}

/**
 * 验证码登录
 */
async function handleSmsLogin(phone: string, code: string) {
  if (!phone) {
    return NextResponse.json({ error: "手机号不能为空" }, { status: 400 });
  }

  // 手机号格式验证
  const phoneRegex = /^1[3-9]\d{9}$/;
  if (!phoneRegex.test(phone)) {
    return NextResponse.json({ error: "手机号格式不正确" }, { status: 400 });
  }

  if (!code) {
    return NextResponse.json({ error: "验证码不能为空" }, { status: 400 });
  }

  // 验证短信验证码
  const verifyResult = await verifyCode(phone, code, "login");
  if (!verifyResult.valid) {
    return NextResponse.json({ error: verifyResult.error }, { status: 400 });
  }

  const { db } = await connectToDatabase();

  // 查找用户
  const user = await db.collection("users").findOne({ phone });

  if (!user) {
    return NextResponse.json({ error: "该手机号未注册" }, { status: 401 });
  }

  const token = signToken({ userId: String(user._id), username: user.username as string });
  return NextResponse.json({
    token,
    userId: String(user._id),
    username: user.username,
    phone: user.phone || "",
    bio: user.bio ?? "",
    avatar: user.avatar ?? "",
    verified: user.verified ?? false,
    realName: user.realName ?? "",
    grade: user.grade ?? "",
    classId: user.classId ?? "",
    isAdmin: false,
  });
}
