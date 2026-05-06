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
    const file = formData.get("avatar") as File | null;

    if (!file || file.size === 0) {
      return NextResponse.json({ error: "请选择图片" }, { status: 400 });
    }
    if (file.size > 2 * 1024 * 1024) {
      return NextResponse.json({ error: "图片不能超过 2MB" }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const avatarUrl = await uploadImage(buffer, file.type, {
      folder: "ai-ethics-forum/avatars",
      transformation: [{ width: 200, height: 200, crop: "fill", gravity: "face" }],
    });

    const { db } = await connectToDatabase();
    const updated = await updateUserProfileFields(db, user, { avatar: avatarUrl });
    if (!updated) {
      return NextResponse.json({ error: "未找到用户记录，请重新登录后重试" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, avatar: avatarUrl });
  } catch (error) {
    console.error("头像上传失败:", error);
    return NextResponse.json({ error: "上传失败，请重试" }, { status: 500 });
  }
}
