import { getUserFromRequest } from "@/lib/auth";
import { uploadImage } from "@/lib/image-upload";
import { NextRequest, NextResponse } from "next/server";

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
    const coverUrl = await uploadImage(buffer, file.type, {
      folder: "ai-ethics-forum/podcast-covers",
      transformation: [{ width: 800, height: 800, crop: "fill" }],
    });

    return NextResponse.json({ ok: true, coverUrl });
  } catch (error) {
    console.error("Failed to upload podcast cover:", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
