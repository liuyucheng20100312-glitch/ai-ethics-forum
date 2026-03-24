import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";

// 投票发起频率限制
const STUDENT_LIMIT_DAYS = 7;

export async function POST(req: NextRequest) {
  try {
    const { title, description, options } = await req.json();
    const user = getUserFromRequest(req);
    if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

    const { db } = await connectToDatabase();
    
    // Check if the user is an admin or offline_admin
    const isOfflineAdmin = user.userId === "offline_admin";
    
    let isDbAdmin = false;
    if (!isOfflineAdmin && user.userId !== "guest") {
         const actualUser = await db.collection("users").findOne({ username: user.username } as never);
         if (actualUser && actualUser.isAdmin) {
             isDbAdmin = true;
         }
    }

    const finalIsAdmin = isOfflineAdmin || isDbAdmin;

    // 管理员不限，学生每7天只能发起一次
    if (!finalIsAdmin) {
      const last = await db.collection("vote_topics").findOne({ author: user.username }, { sort: { createdAt: -1 } });
      if (last && Date.now() - new Date(last.createdAt).getTime() < STUDENT_LIMIT_DAYS * 24 * 3600 * 1000) {
        return NextResponse.json({ error: "学生每周仅可发起一次投票讨论" }, { status: 403 });
      }
    }

    // 创建投票主题
    const topic = {
      title,
      description: description || "",
      options: options.map((opt: string) => ({ name: opt, votes: [], opinions: [] })),
      author: user.username,
      createdAt: new Date(),
    };
    
    const result = await db.collection("vote_topics").insertOne(topic);
    return NextResponse.json({ ok: true, id: result.insertedId });
  } catch (error) {
    return NextResponse.json({ error: "Server Error" }, { status: 500 });
  }
}

// GET: 获取所有投票主题
export async function GET() {
  try {
    const { db } = await connectToDatabase();
    const topics = await db.collection("vote_topics").find({}).sort({ createdAt: -1 }).toArray();
    return NextResponse.json(topics);
  } catch (error) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
