import { getUserFromRequest } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { IB_DISCIPLINES_COLLECTION, IB_SUBJECTS_COLLECTION } from "@/lib/ib-knowledge";
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
    const search = asString(request.nextUrl.searchParams.get("q"));
    const { db } = await connectToDatabase();
    const disciplines = await db.collection(IB_DISCIPLINES_COLLECTION).find({}).sort({ sortOrder: 1 }).toArray();
    const subjects = await db.collection(IB_SUBJECTS_COLLECTION).find({}).toArray();

    const filteredSubjects = subjects.filter((subject) => {
      if (!search) {
        return true;
      }

      const haystack = [
        asString(subject.code),
        asString(subject.nameEn),
        asString(subject.nameCn),
        ...(Array.isArray(subject.aliases) ? subject.aliases.map((item) => asString(item)) : []),
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(search.toLowerCase());
    });

    return NextResponse.json({
      disciplines: disciplines.map((item) => ({
        id: String(item._id),
        code: item.code,
        nameEn: item.nameEn,
        nameCn: item.nameCn,
        sortOrder: item.sortOrder ?? 0,
      })),
      subjects: filteredSubjects.map((item) => ({
        id: String(item._id),
        code: item.code,
        disciplineCode: item.disciplineCode,
        nameEn: item.nameEn,
        nameCn: item.nameCn,
        level: item.level ?? "BOTH",
        aliases: item.aliases ?? [],
      })),
    });
  } catch (error) {
    console.error("Failed to load IB subjects:", error);
    return NextResponse.json({ error: "Failed to load IB subjects" }, { status: 500 });
  }
}
