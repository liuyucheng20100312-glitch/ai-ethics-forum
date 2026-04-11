import { connectToDatabase } from "@/lib/mongodb";
import { getUserFromRequest } from "@/lib/auth";
import { isAdminUser, unauth, forbidden, serverError } from "@/lib/api-helpers";
import { NextRequest, NextResponse } from "next/server";

type EpisodeInput = {
  title: string;
  coverImage: string;
  playUrl: string;
  publishedAt?: string;
  duration?: string;
  description?: string;
};

function validateHttpUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http/https URLs are allowed");
  }
  return value.trim();
}

function normalizeEpisodes(value: unknown): EpisodeInput[] {
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

export async function GET(request: NextRequest) {
  const user = getUserFromRequest(request);
  if (!user) return unauth();
  if (!isAdminUser(user.userId)) {
    return forbidden();
  }

  try {
    const { db } = await connectToDatabase();
    const albums = await db
      .collection("podcastAlbums")
      .find({})
      .sort({ updatedAt: -1, createdAt: -1 })
      .toArray();

    return NextResponse.json(albums);
  } catch (error) {
    console.error("Failed to load admin podcast albums:", error);
    return NextResponse.json({ error: "Failed to load admin podcast albums" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const user = getUserFromRequest(request);
  if (!user) return unauth();
  if (!isAdminUser(user.userId)) {
    return forbidden();
  }

  try {
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

    const album = {
      title,
      host,
      coverImage,
      description,
      status,
      episodes: normalizeEpisodes(body.episodes),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const result = await db.collection("podcastAlbums").insertOne(album);
    return NextResponse.json({ ...album, _id: result.insertedId }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create album";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
