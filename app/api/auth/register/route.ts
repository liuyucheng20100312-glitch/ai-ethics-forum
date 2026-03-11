import { connectToDatabase } from "@/lib/mongodb";
import { signToken } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";

function displayWidth(s: string): number {
  let w = 0;
  for (const c of s) {
    w += /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff\u3040-\u30ff\uac00-\ud7af]/.test(c) ? 2 : 1;
  }
  return w;
}

export async function POST(request: NextRequest) {
  try {
    const { username, password } = await request.json();
    const trimmedName = (username ?? "").trim();

    if (!trimmedName) {
      return NextResponse.json({ error: "用户名不能为空" }, { status: 400 });
    }
    const RESERVED = ["admin", "guest", "offline_admin", "administrator", "root", "system", "superuser"];
    if (RESERVED.includes(trimmedName.toLowerCase())) {
      return NextResponse.json({ error: "该用户名为系统保留用户名，不可使用" }, { status: 400 });
    }
    if (displayWidth(trimmedName) > 20) {
      return NextResponse.json({ error: "用户名最多10个汉字或20个字母" }, { status: 400 });
    }
    if (!password || password.length < 6) {
      return NextResponse.json({ error: "密码至少6位" }, { status: 400 });
    }

    const { db } = await connectToDatabase();
    const users = db.collection("users");
    const students = db.collection("students");

    // 白名单检查：只有在学生名单中的用户名才能注册
    const student = await students.findOne({ username: trimmedName }) as {
      username: string; realName: string; classId: string;
    } | null;
    if (!student) {
      return NextResponse.json({ error: "该用户名不在校园学生名单中，请使用学号格式用户名注册（如 G11abc）" }, { status: 403 });
    }

    const existing = await users.findOne({ username: trimmedName });
    if (existing) {
      return NextResponse.json({ error: "该用户名已被注册" }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const result = await users.insertOne({
      username: trimmedName,
      passwordHash,
      bio: "对AI伦理充满好奇的探索者",
      avatar: "",
      realName: student.realName,
      classId: student.classId,
      verified: true,
      createdAt: new Date(),
    });

    const token = signToken({ userId: result.insertedId.toString(), username: trimmedName });
    return NextResponse.json({ token, username: trimmedName }, { status: 201 });
  } catch (error) {
    console.error("注册失败:", error);
    if ((error as { code?: number }).code === 11000) {
      return NextResponse.json({ error: "用户名已被占用" }, { status: 409 });
    }
    return NextResponse.json({ error: "注册失败，请稍后再试" }, { status: 500 });
  }
}
