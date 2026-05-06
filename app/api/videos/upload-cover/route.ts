import { getUserFromRequest } from "@/lib/auth";
import { uploadImage } from "@/lib/image-upload";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const user = getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  if (user.userId !== "offline_admin") {
    return NextResponse.json({ error: "无权限上传" }, { status: 403 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("cover") as File | null;

    if (!file || file.size === 0) {
      return NextResponse.json({ error: "请选择图片" }, { status: 400 });
    }
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: "图片不能超过 5MB" }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const coverUrl = await uploadImage(buffer, file.type, {
      folder: "ai-ethics-forum/video-covers",
      transformation: [{ width: 640, height: 360, crop: "fill" }],
    });

    return NextResponse.json({ ok: true, coverUrl });
  } catch (error) {
    console.error("视频封面上传失败:", error);
    return NextResponse.json({ error: "上传失败，请重试" }, { status: 500 });
  }
}
