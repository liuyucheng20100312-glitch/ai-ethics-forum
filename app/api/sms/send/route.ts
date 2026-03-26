import { NextRequest, NextResponse } from "next/server";
import { sendVerificationCode } from "@/lib/sms";
import { connectToDatabase } from "@/lib/mongodb";

/**
 * 发送验证码 API
 * POST /api/sms/send
 * Body: { phone: string, scene: "register" | "login" }
 */
export async function POST(request: NextRequest) {
  try {
    const { phone, scene } = await request.json();

    // 参数验证
    if (!phone) {
      return NextResponse.json({ error: "手机号不能为空" }, { status: 400 });
    }

    // 手机号格式验证（中国大陆手机号）
    const phoneRegex = /^1[3-9]\d{9}$/;
    if (!phoneRegex.test(phone)) {
      return NextResponse.json({ error: "手机号格式不正确" }, { status: 400 });
    }

    if (!scene || !["register", "login"].includes(scene)) {
      return NextResponse.json({ error: "场景参数错误" }, { status: 400 });
    }

    // 如果是注册场景，检查手机号是否已被注册
    if (scene === "register") {
      const { db } = await connectToDatabase();
      const existingUser = await db.collection("users").findOne({ phone });
      if (existingUser) {
        return NextResponse.json({ error: "该手机号已被注册" }, { status: 400 });
      }
    }

    // 发送验证码
    const result = await sendVerificationCode(phone, scene);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error, remainingSeconds: result.remainingSeconds },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, message: "验证码发送成功" });
  } catch (error) {
    console.error("发送验证码失败:", error);
    return NextResponse.json({ error: "发送验证码失败，请稍后再试" }, { status: 500 });
  }
}
