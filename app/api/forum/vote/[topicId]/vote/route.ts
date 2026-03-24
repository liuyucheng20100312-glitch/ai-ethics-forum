import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { ObjectId } from "mongodb";

export async function POST(req: NextRequest, { params }: { params: Promise<{ topicId: string }> | { topicId: string } }) {
  try {
    const resolvedParams = await params;
    const topicId = resolvedParams.topicId;
    const { optionIdx, opinion } = await req.json();
    const user = getUserFromRequest(req);
    if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

    const { db } = await connectToDatabase();
    
    let objectId;
    let topic;
    try {
      objectId = new ObjectId(topicId);
      topic = await db.collection("vote_topics").findOne({ _id: objectId });
    } catch {
      // In case the ID is stored as string
      topic = null;
    }

    if (!topic) {
       topic = await db.collection("vote_topics").findOne({ _id: topicId as any });
    }

    if (!topic) return NextResponse.json({ error: "主题不存在: " + topicId }, { status: 404 });

    // 检查是否已经投过票
    let hasVoted = false;
    for (const opt of topic.options) {
      if (opt.votes.includes(user.username)) {
        hasVoted = true;
        break;
      }
    }

    if (hasVoted) {
      return NextResponse.json({ error: "您已经在此主题中投过票" }, { status: 403 });
    }

    // 更新投票与观点
    const update = {
      $push: {
        [`options.${optionIdx}.votes`]: user.username,
        [`options.${optionIdx}.opinions`]: opinion ? { user: user.username, text: opinion, createdAt: new Date() } : null,
      },
    };
    
    await db.collection("vote_topics").updateOne({ _id: (topic as any)._id }, update as any);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: "Server Error" }, { status: 500 });
  }
}
