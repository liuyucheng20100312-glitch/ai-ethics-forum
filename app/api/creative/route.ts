import { connectToDatabase } from "@/lib/mongodb";
import { getUserFromRequest } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { v2 as cloudinary } from "cloudinary";
import path from "path";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// GET /api/creative – all creative posts
export async function GET() {
  const { db } = await connectToDatabase();
  const posts = await db
    .collection("creative")
    .find({})
    .sort({ createdAt: -1 })
    .toArray();
  return NextResponse.json(posts);
}

// POST /api/creative – submit a new creative work (multipart/form-data)
export async function POST(request: NextRequest) {
  const user = getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  let tool = "";
  let description = "";
  let fileUrl = "";
  let fileType: "image" | "video" | "audio" | "none" = "none";
  let fileName = "";

  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    tool = (formData.get("tool") as string) ?? "";
    description = (formData.get("description") as string) ?? "";
    const file = formData.get("file") as File | null;

    if (file && file.size > 0) {
      // 50 MB limit
      if (file.size > 50 * 1024 * 1024) {
        return NextResponse.json({ error: "文件大小不能超过 50 MB" }, { status: 400 });
      }

      const ext = path.extname(file.name).toLowerCase();
      if ([".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg"].includes(ext)) fileType = "image";
      else if ([".mp4", ".webm", ".mov", ".avi"].includes(ext)) fileType = "video";
      else if ([".mp3", ".wav", ".ogg", ".m4a", ".flac"].includes(ext)) fileType = "audio";
      else return NextResponse.json({ error: "不支持的文件类型" }, { status: 400 });

      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);

      const uploadResult = await new Promise<{ secure_url: string }>((resolve, reject) => {
        cloudinary.uploader.upload_stream(
          {
            resource_type: fileType === "image" ? "image" : "video",
            folder: "ai-ethics-forum/creative",
            use_filename: false,
          },
          (error, result) => {
            if (error || !result) reject(error ?? new Error("Upload failed"));
            else resolve(result as { secure_url: string });
          }
        ).end(buffer);
      });

      fileUrl = uploadResult.secure_url;
      fileName = file.name;
    }
  } else {
    const body = await request.json();
    tool = body.tool ?? "";
    description = body.description ?? "";
  }

  if (!tool.trim()) return NextResponse.json({ error: "请填写使用的 AI 工具" }, { status: 400 });
  if (!description.trim()) return NextResponse.json({ error: "请填写使用成果展示" }, { status: 400 });

  const { db } = await connectToDatabase();
  const doc = {
    author: user.username,
    tool: tool.trim(),
    description: description.trim(),
    fileUrl,
    fileType,
    fileName,
    likes: 0,
    createdAt: new Date().toISOString(),
  };
  const result = await db.collection("creative").insertOne(doc);
  return NextResponse.json({ ...doc, _id: result.insertedId }, { status: 201 });
}
