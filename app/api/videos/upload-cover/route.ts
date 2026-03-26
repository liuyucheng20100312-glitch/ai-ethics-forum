import { connectToDatabase } from "@/lib/mongodb";
import { getUserFromRequest } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

function tryObjectId(id: string) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { ObjectId } = require("mongodb");
    return new ObjectId(id);
  } catch {
    return id;
  }
}

async function uploadToCloudinary(buffer: Buffer, mimeType: string): Promise<string> {
  const { v2: cloudinary } = await import("cloudinary");
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload_stream(
      {
        resource_type: "image",
        folder: "ai-ethics-forum/video-covers",
        transformation: [{ width: 640, height: 360, crop: "fill" }],
      },
      (error, result) => {
        if (error || !result) reject(error ?? new Error("Cloudinary upload failed"));
        else resolve((result as { secure_url: string }).secure_url);
      }
    ).end(buffer);
  });
  void mimeType;
}

export async function POST(request: NextRequest) {
  const user = getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  // 只有管理员可以上传视频封面
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

    let coverUrl: string;

    const hasCloudinary =
      process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET;

    if (hasCloudinary) {
      // Upload to Cloudinary → permanent CDN URL
      coverUrl = await uploadToCloudinary(buffer, file.type);
    } else {
      // Fallback: store as base64 data URL directly in MongoDB Atlas
      const base64 = buffer.toString("base64");
      coverUrl = `data:${file.type};base64,${base64}`;
    }

    return NextResponse.json({ ok: true, coverUrl });
  } catch (e) {
    console.error("封面上传失败:", e);
    return NextResponse.json({ error: "上传失败，请重试" }, { status: 500 });
  }
}
