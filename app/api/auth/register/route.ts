import { connectToDatabase } from "@/lib/mongodb";
import { signToken } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { verifyCode } from "@/lib/sms";

function displayWidth(s: string): number {
  let w = 0;
  for (const c of s) {
    w += /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff\u3040-\u30ff\uac00-\ud7af]/.test(c) ? 2 : 1;
  }
  return w;
}

export async function POST(request: NextRequest) {
  try {
    const { phone, code, username, password, grade, classId } = await request.json();

    // 参数验证
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
    const verifyResult = await verifyCode(phone, code, "register");
    if (!verifyResult.valid) {
      return NextResponse.json({ error: verifyResult.error }, { status: 400 });
    }

    const { db } = await connectToDatabase();
    const users = db.collection("users");

    // 检查手机号是否已注册
    const existingPhone = await users.findOne({ phone });
    if (existingPhone) {
      return NextResponse.json({ error: "该手机号已被注册" }, { status: 409 });
    }

    // 用户名处理
    const trimmedName = (username ?? "").trim();

    // 如果提供了用户名，进行验证
    if (trimmedName) {
      const RESERVED = ["admin", "guest", "offline_admin", "administrator", "root", "system", "superuser"];
      if (RESERVED.includes(trimmedName.toLowerCase())) {
        return NextResponse.json({ error: "该用户名为系统保留用户名，不可使用" }, { status: 400 });
      }
      if (displayWidth(trimmedName) > 20) {
        return NextResponse.json({ error: "用户名最多10个汉字或20个字母" }, { status: 400 });
      }

      // 检查用户名是否已存在
      const existingUsername = await users.findOne({ username: trimmedName });
      if (existingUsername) {
        return NextResponse.json({ error: "该用户名已被注册" }, { status: 409 });
      }
    }

    // 密码验证
    if (!password || password.length < 6) {
      return NextResponse.json({ error: "密码至少6位" }, { status: 400 });
    }

    // 创建用户
    const passwordHash = await bcrypt.hash(password, 10);
    const newUsername = trimmedName || `用户${phone.slice(-4)}`; // 如果没有用户名，使用手机号后4位生成

    // 检查生成的用户名是否已存在
    let finalUsername = newUsername;
    let counter = 1;
    while (await users.findOne({ username: finalUsername })) {
      finalUsername = `用户${phone.slice(-4)}_${counter}`;
      counter++;
    }

    const result = await users.insertOne({
      username: finalUsername,
      phone,
      passwordHash,
      bio: "对AI伦理充满好奇的探索者",
      avatar: "",
      realName: "",
      grade: grade || "",
      classId: classId || "",
      verified: true,
      createdAt: new Date(),
    });

    const newUserId = result.insertedId.toString();
    const token = signToken({ userId: newUserId, username: finalUsername });

    return NextResponse.json({
      token,
      userId: newUserId,
      username: finalUsername,
      phone,
      verified: true,
      grade: grade || "",
      classId: classId || "",
      isAdmin: false,
    }, { status: 201 });
  } catch (error) {
    console.error("注册失败:", error);
    if ((error as { code?: number }).code === 11000) {
      return NextResponse.json({ error: "手机号或用户名已被占用" }, { status: 409 });
    }
    return NextResponse.json({ error: "注册失败，请稍后再试" }, { status: 500 });
  }
}
