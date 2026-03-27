import { connectDB } from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { NextRequest, NextResponse } from "next/server";

// Helper: try to create ObjectId, return null if invalid format
function tryParseObjectId(id: string): ObjectId | null {
  try {
    if (/^[a-fA-F0-9]{24}$/.test(id)) {
      return new ObjectId(id);
    }
    return null;
  } catch {
    return null;
  }
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const db = await connectDB();
    const postsCollection = db.collection("posts");

    // Try ObjectId first, then fallback to string _id (for migrated data)
    let post = null;
    const objectId = tryParseObjectId(id);
    if (objectId) {
      post = await postsCollection.findOne({ _id: objectId });
    }
    if (!post) {
      // Fallback: search by string _id (supports migrated localdb data)
      post = await postsCollection.findOne({ _id: id });
    }

    if (!post) {
      return NextResponse.json({ error: "帖子不存在" }, { status: 404 });
    }

    return NextResponse.json(post);
  } catch (error) {
    return NextResponse.json(
      { error: "获取帖子失败" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const update: Record<string, string> = {};
    if (typeof body.titleEn === "string") update.titleEn = body.titleEn;
    if (typeof body.contentEn === "string") update.contentEn = body.contentEn;

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    const db = await connectDB();

    // Try ObjectId first, then fallback to string _id
    let result = { matchedCount: 0, modifiedCount: 0 };
    const objectId = tryParseObjectId(id);
    if (objectId) {
      result = await db.collection("posts").updateOne(
        { _id: objectId },
        { $set: { ...update, updatedAt: new Date().toISOString() } }
      );
    }
    if (result.matchedCount === 0) {
      result = await db.collection("posts").updateOne(
        { _id: id } as any,
        { $set: { ...update, updatedAt: new Date().toISOString() } }
      );
    }

    if (result.matchedCount === 0) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}