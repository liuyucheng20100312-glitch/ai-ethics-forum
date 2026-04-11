import { connectToDatabase } from "@/lib/mongodb";
import { getUserFromRequest } from "@/lib/auth";
import { isAdminUser, tryParseObjectId, notFound, serverError } from "@/lib/api-helpers";
import { NextRequest, NextResponse } from "next/server";

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

    if (!album) return notFound("Album not found");

    // Non-admin users cannot see hidden albums
    if (album.status !== "approved" && !isAdminUser(user?.userId)) {
      return notFound("Album not found");
    }

    return NextResponse.json(album);
  } catch (error) {
    console.error("Failed to load podcast album:", error);
    return serverError("Failed to load podcast album");
  }
}
