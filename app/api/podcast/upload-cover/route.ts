import { getUserFromRequest } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

async function uploadToCloudinary(buffer: Buffer): Promise<string> {
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
        folder: "ai-ethics-forum/podcast-covers",
        transformation: [{ width: 800, height: 800, crop: "fill" }],
      },
      (error, result) => {
        if (error || !result) reject(error ?? new Error("Upload failed"));
        else resolve((result as { secure_url: string }).secure_url);
      }
    ).end(buffer);
  });
}

export async function POST(request: NextRequest) {
  const user = getUserFromRequest(request);
  if (!user || user.userId !== "offline_admin") {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("cover") as File | null;
    if (!file || file.size === 0) {
      return NextResponse.json({ error: "Please choose an image" }, { status: 400 });
    }
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: "Image must be smaller than 5MB" }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const hasCloudinary =
      process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET;

    const coverUrl = hasCloudinary
      ? await uploadToCloudinary(buffer)
      : `data:${file.type};base64,${buffer.toString("base64")}`;

    return NextResponse.json({ ok: true, coverUrl });
  } catch (error) {
    console.error("Failed to upload podcast cover:", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
