import { connectToDatabase } from "@/lib/mongodb";
import { getUserFromRequest } from "@/lib/auth";
import { uploadImage } from "@/lib/image-upload";
import { updateUserProfileFields } from "@/lib/user-profile-store";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const user = getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  try {
    const formData = await request.formData();
    const file = formData.get("background") as File | null;

    if (!file || file.size === 0) {
      return NextResponse.json({ error: "请选择背景图" }, { status: 400 });
    }
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: "背景图不能超过 5MB" }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const backgroundImage = await uploadImage(buffer, file.type, {
      folder: "ai-ethics-forum/profile-backgrounds",
      transformation: [{ width: 1600, height: 900, crop: "fill" }],
    });

    const { db } = await connectToDatabase();
    const updated = await updateUserProfileFields(db, user, { backgroundImage });
    if (!updated) {
      return NextResponse.json({ error: "未找到用户记录，请重新登录后重试" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, backgroundImage });
  } catch (error) {
    console.error("背景图上传失败:", error);
    return NextResponse.json({ error: "上传失败，请重试" }, { status: 500 });
  }
}
