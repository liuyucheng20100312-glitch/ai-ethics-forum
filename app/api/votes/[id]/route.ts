import { connectToDatabase } from "@/lib/mongodb";
import { getUserFromRequest } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";

// 检查是否是管理员
function isAdmin(userId: string | undefined): boolean {
  return userId === "offline_admin";
}

// GET: 获取单个投票详情
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { db } = await connectToDatabase();

    let vote;
    try {
      vote = await db.collection("votes").findOne({ _id: new ObjectId(id) });
    } catch {
      vote = await db.collection("votes").findOne({ _id: id });
    }

    if (!vote) {
      return NextResponse.json({ error: "投票不存在" }, { status: 404 });
    }

    // 获取该投票的所有评论
    const comments = await db
      .collection("vote_comments")
      .find({ voteId: id })
      .sort({ createdAt: -1 })
      .toArray();

    return NextResponse.json({ ...vote, comments });
  } catch (error) {
    console.error("获取投票详情失败:", error);
    return NextResponse.json(
      { error: "获取投票详情失败" },
      { status: 500 }
    );
  }
}

// PUT: 更新投票（作者可修改内容，管理员可上下架/关闭）
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = getUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const { db } = await connectToDatabase();
    const body = await request.json();

    let vote;
    try {
      vote = await db.collection("votes").findOne({ _id: new ObjectId(id) });
    } catch {
      vote = await db.collection("votes").findOne({ _id: id });
    }

    if (!vote) {
      return NextResponse.json({ error: "投票不存在" }, { status: 404 });
    }

    const isAuthor = vote.authorId === user.userId;
    const isUserAdmin = isAdmin(user.userId);

    // 只有作者或管理员可以修改
    if (!isAuthor && !isUserAdmin) {
      return NextResponse.json({ error: "无权限修改此投票" }, { status: 403 });
    }

    const updateData: any = {
      updatedAt: new Date(),
    };

    // 作者可以修改内容
    if (isAuthor) {
      if (body.title) updateData.title = body.title;
      if (body.titleEn !== undefined) updateData.titleEn = body.titleEn;
      if (body.proDescription) updateData.proDescription = body.proDescription;
      if (body.proDescriptionEn !== undefined) updateData.proDescriptionEn = body.proDescriptionEn;
      if (body.conDescription) updateData.conDescription = body.conDescription;
      if (body.conDescriptionEn !== undefined) updateData.conDescriptionEn = body.conDescriptionEn;
      if (body.status) updateData.status = body.status;
    }

    // 管理员可以上下架、关闭投票
    if (isUserAdmin) {
      if (body.isVisible !== undefined) updateData.isVisible = body.isVisible;
      if (body.status) updateData.status = body.status;
    }

    try {
      await db.collection("votes").updateOne(
        { _id: new ObjectId(id) },
        { $set: updateData }
      );
    } catch {
      await db.collection("votes").updateOne(
        { _id: id },
        { $set: updateData }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("更新投票失败:", error);
    return NextResponse.json(
      { error: "更新投票失败" },
      { status: 500 }
    );
  }
}

// DELETE: 删除投票（作者和管理员都可以删除）
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = getUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const { db } = await connectToDatabase();

    let vote;
    try {
      vote = await db.collection("votes").findOne({ _id: new ObjectId(id) });
    } catch {
      vote = await db.collection("votes").findOne({ _id: id });
    }

    if (!vote) {
      return NextResponse.json({ error: "投票不存在" }, { status: 404 });
    }

    const isAuthor = vote.authorId === user.userId;
    const isUserAdmin = isAdmin(user.userId);

    // 作者和管理员都可以删除
    if (!isAuthor && !isUserAdmin) {
      return NextResponse.json({ error: "无权限删除此投票" }, { status: 403 });
    }

    try {
      await db.collection("votes").deleteOne({ _id: new ObjectId(id) });
    } catch {
      await db.collection("votes").deleteOne({ _id: id });
    }

    // 同时删除相关的投票记录和评论
    await db.collection("vote_records").deleteMany({ voteId: id });
    await db.collection("vote_comments").deleteMany({ voteId: id });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("删除投票失败:", error);
    return NextResponse.json(
      { error: "删除投票失败" },
      { status: 500 }
    );
  }
}
