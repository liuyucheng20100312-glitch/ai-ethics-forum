import { connectToDatabase } from "@/lib/mongodb";
import { getUserFromRequest } from "@/lib/auth";
import { ObjectId } from "mongodb";
import { NextRequest, NextResponse } from "next/server";

function tryParseObjectId(id: string): ObjectId | null {
  try {
    if (/^[a-fA-F0-9]{24}$/.test(id)) return new ObjectId(id);
    return null;
  } catch {
    return null;
  }
}

function isAdmin(userId: string | undefined) {
  return userId === "offline_admin";
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const { db } = await connectToDatabase();
    const user = getUserFromRequest(request);

    const objectId = tryParseObjectId(id);
    let album = null;

    if (objectId) {
      album = await db.collection("podcastAlbums").findOne({ _id: objectId });
    }
    if (!album) {
      album = await db.collection("podcastAlbums").findOne({ _id: id });
    }

    if (!album) {
      return NextResponse.json({ error: "Album not found" }, { status: 404 });
    }
    if (album.status !== "approved" && !isAdmin(user?.userId)) {
      return NextResponse.json({ error: "Album not found" }, { status: 404 });
    }

    return NextResponse.json(album);
  } catch (error) {
    console.error("Failed to load podcast album:", error);
    return NextResponse.json({ error: "Failed to load podcast album" }, { status: 500 });
  }
}
