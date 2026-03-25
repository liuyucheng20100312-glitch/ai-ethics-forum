import { connectToDatabase } from "@/lib/mongodb";
import { getUserFromRequest } from "@/lib/auth";
import { updateModerationStatus, ModerationStatus } from "@/lib/sensitive";
import { NextRequest, NextResponse } from "next/server";

// 检查是否是管理员
function isAdmin(userId: string | undefined): boolean {
  return userId === "offline_admin";
}

// GET: 获取单个审核记录详情
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = getUserFromRequest(request);
  if (!user || !isAdmin(user.userId)) {
    return NextResponse.json({ error: "无权限访问" }, { status: 403 });
  }

  try {
    const { id } = await params;
    const { db } = await connectToDatabase();

    const record = await db.collection("moderation_records").findOne({ contentId: id });
    if (!record) {
      return NextResponse.json({ error: "记录不存在" }, { status: 404 });
    }

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
    return NextResponse.json({ error: "获取审核详情失败" }, { status: 500 });
  }
}

// PUT: 审核操作（通过/拒绝）
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = getUserFromRequest(request);
  if (!user || !isAdmin(user.userId)) {
    return NextResponse.json({ error: "无权限操作" }, { status: 403 });
  }

  try {
    const { id } = await params;
    const { db } = await connectToDatabase();
    const body = await request.json();

    const { status, reviewNote } = body;

    if (!["approved", "rejected"].includes(status)) {
      return NextResponse.json({ error: "无效的审核状态" }, { status: 400 });
    }

    // 获取审核记录
    const record = await db.collection("moderation_records").findOne({ contentId: id });
    if (!record) {
      return NextResponse.json({ error: "记录不存在" }, { status: 404 });
    }

    // 更新审核记录
    await updateModerationStatus(id, status as ModerationStatus, user.username, reviewNote);

    // 如果拒绝，将原内容标记为已拒绝
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
      // 如果通过，确保内容可见
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
    return NextResponse.json({ error: "审核操作失败" }, { status: 500 });
  }
}

// DELETE: 删除内容
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = getUserFromRequest(request);
  if (!user || !isAdmin(user.userId)) {
    return NextResponse.json({ error: "无权限操作" }, { status: 403 });
  }

  try {
    const { id } = await params;
    const { db } = await connectToDatabase();

    // 获取审核记录
    const record = await db.collection("moderation_records").findOne({ contentId: id });
    if (!record) {
      return NextResponse.json({ error: "记录不存在" }, { status: 404 });
    }

    // 删除原始内容
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

    // 删除审核记录
    await db.collection("moderation_records").deleteOne({ contentId: id });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("删除内容失败:", error);
    return NextResponse.json({ error: "删除内容失败" }, { status: 500 });
  }
}
