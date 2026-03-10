import { connectToDatabase } from "@/lib/mongodb";
import { signToken } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";

const OFFLINE_ADMIN_USERNAME = "admin";
const OFFLINE_ADMIN_PASSWORD = "admin123456";
const GUEST_USERNAME = "guest";

export async function POST(request: NextRequest) {
  try {
    const { username, password } = await request.json();
    if (!username) {
      return NextResponse.json({ error: "用户名不能为空" }, { status: 400 });
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
      return NextResponse.json({ token, username: OFFLINE_ADMIN_USERNAME, bio: "管理员", avatar: "" });
    }

    // connectToDatabase() never throws — falls back to local JSON DB automatically
    const { db } = await connectToDatabase();

    const user = await db.collection("users").findOne({ username: username.trim() });
    if (!user) {
      return NextResponse.json({ error: "用户名或密码错误" }, { status: 401 });
    }

    if (!user.passwordHash) {
      return NextResponse.json({ error: "该账号密码异常，请重新注册" }, { status: 401 });
    }

    const match = await bcrypt.compare(password, user.passwordHash as string);
    if (!match) {
      return NextResponse.json({ error: "用户名或密码错误" }, { status: 401 });
    }

    const token = signToken({ userId: String(user._id), username: user.username as string });
    return NextResponse.json({
      token,
      username: user.username,
      bio: user.bio ?? "",
      avatar: user.avatar ?? "",
    });
  } catch (error) {
    console.error("登录失败:", error);
    return NextResponse.json({ error: "登录失败，请稍后再试" }, { status: 500 });
  }
}
