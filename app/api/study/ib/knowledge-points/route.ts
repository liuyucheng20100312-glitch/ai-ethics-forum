import { getUserFromRequest } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { IB_KNOWLEDGE_POINTS_COLLECTION } from "@/lib/ib-knowledge";
import { NextRequest, NextResponse } from "next/server";

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function GET(request: NextRequest) {
  const user = getUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const subjectCode = asString(request.nextUrl.searchParams.get("subjectCode"));
    const keyword = asString(request.nextUrl.searchParams.get("keyword")).toLowerCase();
    const { db } = await connectToDatabase();
    const points = await db
      .collection(IB_KNOWLEDGE_POINTS_COLLECTION)
      .find(subjectCode ? { subjectCode } : {})
      .sort({ code: 1 })
      .limit(200)
      .toArray();

    const filtered = points.filter((point) => {
      if (!keyword) {
        return true;
      }

      const haystack = [asString(point.code), asString(point.nameEn), asString(point.nameCn), asString(point.description)]
        .join(" ")
        .toLowerCase();

      return haystack.includes(keyword);
    });

    return NextResponse.json({
      items: filtered.map((point) => ({
        id: String(point._id),
        subjectCode: point.subjectCode,
        code: point.code,
        parentCode: point.parentCode ?? "",
        level: point.level ?? null,
        nameEn: point.nameEn,
        nameCn: point.nameCn,
        description: point.description ?? "",
        hlSl: point.hlSl ?? "BOTH",
        commandTerms: point.commandTerms ?? [],
        aoTargets: point.aoTargets ?? [],
        prerequisiteCodes: point.prerequisiteCodes ?? [],
      })),
    });
  } catch (error) {
    console.error("Failed to load IB knowledge points:", error);
    return NextResponse.json({ error: "Failed to load IB knowledge points" }, { status: 500 });
  }
}
