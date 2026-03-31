import { connectToDatabase } from "@/lib/mongodb";
import { getUserFromRequest } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const { db } = await connectToDatabase();
    const { searchParams } = new URL(request.url);
    const user = getUserFromRequest(request);
    const includeHidden = searchParams.get("includeHidden") === "true" && user?.userId === "offline_admin";
    const query = includeHidden ? {} : { status: "approved" };

    const albums = await db
      .collection("podcastAlbums")
      .find(query)
      .sort({ updatedAt: -1, createdAt: -1 })
      .toArray();

    return NextResponse.json(albums);
  } catch (error) {
    console.error("Failed to load podcast albums:", error);
    return NextResponse.json({ error: "Failed to load podcast albums" }, { status: 500 });
  }
}
