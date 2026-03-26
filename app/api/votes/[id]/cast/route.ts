import { connectToDatabase } from "@/lib/mongodb";
import { getUserFromRequest } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";

// POST: 投票表决
export async function POST(
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

    const { side, reason } = body; // side: "pro" | "con", reason: 投票理由（可选）

    if (!side || (side !== "pro" && side !== "con")) {
      return NextResponse.json(
        { error: "请选择投票立场" },
        { status: 400 }
      );
    }

    // 查找投票
    let vote;
    try {
      vote = await db.collection("votes").findOne({ _id: new ObjectId(id) });
    } catch {
      vote = await db.collection("votes").findOne({ _id: id as never });
    }

    if (!vote) {
      return NextResponse.json({ error: "投票不存在" }, { status: 404 });
    }

    if (vote.status !== "active") {
      return NextResponse.json({ error: "该投票已结束" }, { status: 400 });
    }

    // 检查是否已投票
    const existingVote = await db.collection("vote_records").findOne({
      voteId: id,
      userId: user.userId,
    });

    if (existingVote) {
      return NextResponse.json({ error: "您已投过票" }, { status: 400 });
    }

    // 记录投票
    const voteRecord = {
      voteId: id,
      userId: user.userId,
      username: user.username,
      side,           // "pro" 或 "con"
      reason: reason || "",
      createdAt: new Date(),
    };

    await db.collection("vote_records").insertOne(voteRecord);

    // 更新投票统计
    const updateField = side === "pro" ? "proCount" : "conCount";
    try {
      await db.collection("votes").updateOne(
        { _id: new ObjectId(id) },
        {
          $inc: { [updateField]: 1, totalVoters: 1 },
          $set: { updatedAt: new Date() }
        }
      );
    } catch {
      await db.collection("votes").updateOne(
        { _id: id as never },
        {
          $inc: { [updateField]: 1, totalVoters: 1 },
          $set: { updatedAt: new Date() }
        }
      );
    }

    // 如果有投票理由，同时添加到评论
    if (reason && reason.trim()) {
      await db.collection("vote_comments").insertOne({
        voteId: id,
        userId: user.userId,
        username: user.username,
        side,
        content: reason,
        createdAt: new Date(),
      });
    }

    return NextResponse.json({ ok: true, side });
  } catch (error) {
    console.error("投票失败:", error);
    return NextResponse.json(
      { error: "投票失败" },
      { status: 500 }
    );
  }
}

// GET: 获取当前用户的投票状态
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = getUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ voted: false });
  }

  try {
    const { id } = await params;
    const { db } = await connectToDatabase();

    const voteRecord = await db.collection("vote_records").findOne({
      voteId: id,
      userId: user.userId,
    });

    if (!voteRecord) {
      return NextResponse.json({ voted: false });
    }

    return NextResponse.json({
      voted: true,
      side: voteRecord.side,
      reason: voteRecord.reason,
    });
  } catch (error) {
    console.error("获取投票状态失败:", error);
    return NextResponse.json({ voted: false });
  }
}
