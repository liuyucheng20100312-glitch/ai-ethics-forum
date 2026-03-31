import { connectToDatabase } from "@/lib/mongodb";
import { getUserFromRequest } from "@/lib/auth";
import { ObjectId } from "mongodb";
import { NextRequest, NextResponse } from "next/server";

function isAdmin(userId: string | undefined) {
  return userId === "offline_admin";
}

function tryParseObjectId(id: string): ObjectId | null {
  try {
    if (/^[a-fA-F0-9]{24}$/.test(id)) return new ObjectId(id);
    return null;
  } catch {
    return null;
  }
}

function validateHttpUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http/https URLs are allowed");
  }
  return value.trim();
}

function normalizeEpisodes(value: unknown) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("At least one episode is required");
  }

  return value.map((item, index) => {
    const episode = (item ?? {}) as Record<string, unknown>;
    const title = String(episode.title ?? "").trim();
    const coverImage = String(episode.coverImage ?? "").trim();
    const playUrl = String(episode.playUrl ?? "").trim();

    if (!title || !coverImage || !playUrl) {
      throw new Error(`Episode ${index + 1} is incomplete`);
    }

    return {
      title,
      coverImage,
      playUrl: validateHttpUrl(playUrl),
      publishedAt: String(episode.publishedAt ?? "").trim(),
      duration: String(episode.duration ?? "").trim(),
      description: String(episode.description ?? "").trim(),
    };
  });
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const user = getUserFromRequest(request);
  if (!user || !isAdmin(user.userId)) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  try {
    const { id } = await context.params;
    const { db } = await connectToDatabase();
    const body = await request.json();

    const title = String(body.title ?? "").trim();
    const host = String(body.host ?? "").trim();
    const coverImage = String(body.coverImage ?? "").trim();
    const description = String(body.description ?? "").trim();
    const status = body.status === "hidden" ? "hidden" : "approved";

    if (!title || !host || !coverImage || !description) {
      return NextResponse.json({ error: "Missing required album fields" }, { status: 400 });
    }

    const update = {
      title,
      host,
      coverImage,
      description,
      status,
      episodes: normalizeEpisodes(body.episodes),
      updatedAt: new Date().toISOString(),
    };

    const objectId = tryParseObjectId(id);
    let result = { matchedCount: 0, modifiedCount: 0 };
    if (objectId) {
      result = await db.collection("podcastAlbums").updateOne({ _id: objectId }, { $set: update });
    }
    if (result.matchedCount === 0) {
      result = await db.collection("podcastAlbums").updateOne({ _id: id } as any, { $set: update });
    }

    if (result.matchedCount === 0) {
      return NextResponse.json({ error: "Album not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update album";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const user = getUserFromRequest(request);
  if (!user || !isAdmin(user.userId)) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  try {
    const { id } = await context.params;
    const { db } = await connectToDatabase();
    const objectId = tryParseObjectId(id);

    let result = { deletedCount: 0 };
    if (objectId) {
      result = await db.collection("podcastAlbums").deleteOne({ _id: objectId });
    }
    if (result.deletedCount === 0) {
      result = await db.collection("podcastAlbums").deleteOne({ _id: id } as any);
    }

    if (result.deletedCount === 0) {
      return NextResponse.json({ error: "Album not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Failed to delete album:", error);
    return NextResponse.json({ error: "Failed to delete album" }, { status: 500 });
  }
}
