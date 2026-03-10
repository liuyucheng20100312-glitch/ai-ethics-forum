import { connectToDatabase } from "@/lib/mongodb";
import { getUserFromRequest } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

// DELETE /api/bookmarks/[itemId]?type=news|podcast|tool
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ itemId: string }> }
) {
  const user = getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { itemId } = await params;
  const itemType = new URL(request.url).searchParams.get("type") ?? undefined;

  const { db } = await connectToDatabase();
  const filter: Record<string, string> = { userId: user.userId, itemId: decodeURIComponent(itemId) };
  if (itemType) filter.itemType = itemType;

  await db.collection("bookmarks").deleteOne(filter);
  return NextResponse.json({ ok: true });
}
