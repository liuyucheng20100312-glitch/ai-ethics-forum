import { connectToDatabase } from "@/lib/mongodb";
import { getUserFromRequest } from "@/lib/auth";
import { updateModerationStatus, ModerationStatus } from "@/lib/sensitive";
import { isAdminUser, unauth, forbidden, notFound, badRequest, serverError } from "@/lib/api-helpers";
import { NextRequest, NextResponse } from "next/server";

// GET: 获取单个审核记录详情（仅管理员）
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

    const record = await db.collection("moderation_records").findOne({ contentId: id });
    if (!record) return notFound("记录不存在");

    // 根据内容类型获取原始内容
    let originalContent = null;
    switch (record.contentType) {
      case "post":
        originalContent = await db.collection("posts").findOne({ _id: record.contentId });
        break;
      case "reply":
        originalContent = await db.collection("replies").findOne({ _id: record.contentId });
        break;
      case "vote_comment":
        originalContent = await db.collection("vote_comments").findOne({ _id: record.contentId });
        break;
      case "vote":
        originalContent = await db.collection("votes").findOne({ _id: record.contentId });
        break;
    }

    return NextResponse.json({ ...record, originalContent });
  } catch (error) {
    console.error("获取审核详情失败:", error);
    return serverError("获取审核详情失败");
  }
}

// PUT: 审核操作（通过/拒绝）
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
    const { status, reviewNote } = await request.json();

    if (!["approved", "rejected"].includes(status)) {
      return badRequest("无效的审核状态");
    }

    const record = await db.collection("moderation_records").findOne({ contentId: id });
    if (!record) return notFound("记录不存在");

    await updateModerationStatus(id, status as ModerationStatus, user.username, reviewNote);

    if (status === "rejected") {
      switch (record.contentType) {
        case "post":
          await db.collection("posts").updateOne(
            { _id: record.contentId },
            { $set: { status: "rejected", rejectedAt: new Date() } }
          );
          break;
        case "reply":
          await db.collection("replies").updateOne(
            { _id: record.contentId },
            { $set: { status: "rejected", rejectedAt: new Date() } }
          );
          break;
        case "vote_comment":
          await db.collection("vote_comments").updateOne(
            { _id: record.contentId },
            { $set: { status: "rejected", rejectedAt: new Date() } }
          );
          break;
        case "vote":
          await db.collection("votes").updateOne(
            { _id: record.contentId },
            { $set: { isVisible: false, rejectedAt: new Date() } }
          );
          break;
      }
    } else {
      // 审核通过 — 确保内容可见
      switch (record.contentType) {
        case "post":
          await db.collection("posts").updateOne(
            { _id: record.contentId },
            { $set: { status: "approved", approvedAt: new Date() } }
          );
          break;
        case "reply":
          await db.collection("replies").updateOne(
            { _id: record.contentId },
            { $set: { status: "approved", approvedAt: new Date() } }
          );
          break;
        case "vote_comment":
          await db.collection("vote_comments").updateOne(
            { _id: record.contentId },
            { $set: { status: "approved", approvedAt: new Date() } }
          );
          break;
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("审核操作失败:", error);
    return serverError("审核操作失败");
  }
}

// DELETE: 删除内容
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

    const record = await db.collection("moderation_records").findOne({ contentId: id });
    if (!record) return notFound("记录不存在");

    switch (record.contentType) {
      case "post":
        await db.collection("posts").deleteOne({ _id: record.contentId });
        break;
      case "reply":
        await db.collection("replies").deleteOne({ _id: record.contentId });
        break;
      case "vote_comment":
        await db.collection("vote_comments").deleteOne({ _id: record.contentId });
        break;
      case "vote":
        await db.collection("votes").deleteOne({ _id: record.contentId });
        break;
    }

    await db.collection("moderation_records").deleteOne({ contentId: id });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("删除内容失败:", error);
    return serverError("删除内容失败");
  }
}
