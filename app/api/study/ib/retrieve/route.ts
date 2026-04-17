import { getUserFromRequest } from "@/lib/auth";
import { buildIbKnowledgeContext } from "@/lib/ib-knowledge";
import { connectToDatabase } from "@/lib/mongodb";
import { NextRequest, NextResponse } from "next/server";

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: NextRequest) {
  const user = getUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const subjectText = asString(body.subjectText);
    const level = asString(body.level);
    const queryTerms = Array.isArray(body.queryTerms)
      ? body.queryTerms.filter((item): item is string => typeof item === "string")
      : [];

    if (!subjectText) {
      return NextResponse.json({ error: "subjectText is required" }, { status: 400 });
    }

    const { db } = await connectToDatabase();
    const context = await buildIbKnowledgeContext(db, {
      subjectText,
      level,
      queryTerms,
    });

    return NextResponse.json({
      context,
    });
  } catch (error) {
    console.error("Failed to retrieve IB context:", error);
    return NextResponse.json({ error: "Failed to retrieve IB context" }, { status: 500 });
  }
}
