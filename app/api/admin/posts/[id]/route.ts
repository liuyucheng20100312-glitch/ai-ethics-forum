import { connectToDatabase } from "@/lib/mongodb";
import { getUserFromRequest } from "@/lib/auth";
import { isAdminUser, tryParseObjectId, unauth, forbidden, notFound, badRequest, serverError } from "@/lib/api-helpers";
import { NextRequest, NextResponse } from "next/server";

// GET: 获取单个帖子详情（仅管理员）
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = getUserFromRequest(request);
  if (!user) return unauth();
  if (!isAdminUser(user.userId)) return forbidden();

  try {
    const { id } = await params;
    const { db } = await connectToDatabase();

    // Try ObjectId first, then fallback to string _id (for local-db data)
    const objectId = tryParseObjectId(id);
    const post =
      (objectId ? await db.collection("posts").findOne({ _id: objectId }) : null) ??
      (await db.collection("posts").findOne({ _id: id } as Record<string, unknown>));

    if (!post) return notFound("帖子不存在");

    const replyCount = await db.collection("replies").countDocuments({ postId: id });

    return NextResponse.json({ ...post, replyCount });
  } catch (error) {
    console.error("获取帖子详情失败:", error);
    return serverError("获取帖子详情失败");
  }
}

// PUT: 更新帖子状态（上架/下架/通过/拒绝）
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = getUserFromRequest(request);
  if (!user) return unauth();
  if (!isAdminUser(user.userId)) return forbidden();

  try {
    const { id } = await params;
    const { db } = await connectToDatabase();
    const { status, adminNote } = await request.json();

    const validStatuses = ["approved", "pending", "rejected", "hidden"];
    if (!validStatuses.includes(status)) return badRequest("无效的状态值");

    // Try ObjectId first, then fallback to string _id
    const objectId = tryParseObjectId(id);
    const post =
      (objectId ? await db.collection("posts").findOne({ _id: objectId }) : null) ??
      (await db.collection("posts").findOne({ _id: id } as Record<string, unknown>));

    if (!post) return notFound("帖子不存在");

    const updateData: Record<string, unknown> = {
      status,
      updatedAt: new Date(),
      reviewedBy: user.username,
      reviewedAt: new Date(),
    };
    if (adminNote) updateData.adminNote = adminNote;
    if (status === "approved") updateData.approvedAt = new Date();
    else if (status === "rejected") updateData.rejectedAt = new Date();
    else if (status === "hidden") updateData.hiddenAt = new Date();

    const filter = objectId
      ? { _id: objectId }
      : ({ _id: id } as Record<string, unknown>);
    await db.collection("posts").updateOne(filter, { $set: updateData });

    return NextResponse.json({ ok: true, status });
  } catch (error) {
    console.error("更新帖子状态失败:", error);
    return serverError("更新帖子状态失败");
  }
}

// DELETE: 删除帖子及其关联回复和审核记录
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = getUserFromRequest(request);
  if (!user) return unauth();
  if (!isAdminUser(user.userId)) return forbidden();

  try {
    const { id } = await params;
    const { db } = await connectToDatabase();

    const objectId = tryParseObjectId(id);
    const post =
      (objectId ? await db.collection("posts").findOne({ _id: objectId }) : null) ??
      (await db.collection("posts").findOne({ _id: id } as Record<string, unknown>));

    if (!post) return notFound("帖子不存在");

    const filter = objectId
      ? { _id: objectId }
      : ({ _id: id } as Record<string, unknown>);

    await Promise.all([
      db.collection("posts").deleteOne(filter),
      db.collection("replies").deleteMany({ postId: id }),
      db.collection("moderation_records").deleteMany({ contentId: id, contentType: "post" }),
    ]);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("删除帖子失败:", error);
    return serverError("删除帖子失败");
  }
}
