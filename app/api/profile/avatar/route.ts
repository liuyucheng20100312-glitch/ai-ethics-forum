import { connectToDatabase } from "@/lib/mongodb";
import { getUserFromRequest } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

function tryObjectId(id: string) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { ObjectId } = require("mongodb");
    return new ObjectId(id);
  } catch {
    return id;
  }
}

export async function POST(request: NextRequest) {
  const user = getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  try {
    const formData = await request.formData();
    const file = formData.get("avatar") as File | null;

    if (!file || file.size === 0) {
      return NextResponse.json({ error: "请选择图片" }, { status: 400 });
    }
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: "图片不能超过 5MB" }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const uploadResult = await new Promise<{ secure_url: string }>((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        {
          resource_type: "image",
          folder: "ai-ethics-forum/avatars",
          transformation: [{ width: 200, height: 200, crop: "fill", gravity: "face" }],
        },
        (error, result) => {
          if (error || !result) reject(error ?? new Error("上传失败"));
          else resolve(result as { secure_url: string });
        }
      ).end(buffer);
    });

    const avatarUrl = uploadResult.secure_url;

    // Save URL to database
    const { db } = await connectToDatabase();
    const userIdFilter = { _id: tryObjectId(user.userId) as never };
    await db.collection("users").updateOne(userIdFilter, { $set: { avatar: avatarUrl } });

    return NextResponse.json({ ok: true, avatar: avatarUrl });
  } catch (e) {
    console.error("头像上传失败:", e);
    return NextResponse.json({ error: "上传失败，请重试" }, { status: 500 });
  }
}
