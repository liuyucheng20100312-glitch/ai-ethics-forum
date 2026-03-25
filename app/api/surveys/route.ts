import { connectToDatabase } from "@/lib/mongodb";
import { getUserFromRequest } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";

// 检查是否是管理员
function isAdmin(userId: string | undefined): boolean {
  return userId === "offline_admin";
}

// GET: 获取所有问卷
export async function GET(request: NextRequest) {
  try {
    const { db } = await connectToDatabase();
    const { searchParams } = new URL(request.url);
    const statusFilter = searchParams.get("status");
    const adminView = searchParams.get("adminView") === "true";
    const user = getUserFromRequest(request);

    const query: any = {};
    if (statusFilter) query.status = statusFilter;

    // 非管理员只能看到已发布的问卷
    if (!isAdmin(user?.userId) || !adminView) {
      query.status = { $in: ["published", "closed"] };
      query.isVisible = { $ne: false };
    }

    const surveys = await db
      .collection("surveys")
      .find(query)
      .project({
        // 列表不需要返回所有题目详情
        title: 1,
        titleEn: 1,
        description: 1,
        descriptionEn: 1,
        author: 1,
        status: 1,
        isVisible: 1,
        responseCount: 1,
        createdAt: 1,
        updatedAt: 1,
        publishedAt: 1,
      })
      .sort({ createdAt: -1 })
      .toArray();

    return NextResponse.json(surveys);
  } catch (error) {
    console.error("获取问卷失败:", error);
    return NextResponse.json({ error: "获取问卷失败" }, { status: 500 });
  }
}

// POST: 创建新问卷（仅管理员）
export async function POST(request: NextRequest) {
  const user = getUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  if (!isAdmin(user.userId)) {
    return NextResponse.json({ error: "无权限创建问卷" }, { status: 403 });
  }

  try {
    const { db } = await connectToDatabase();
    const body = await request.json();

    const { title, titleEn, description, descriptionEn, questions, sections } = body;

    if (!title || !questions || !Array.isArray(questions) || questions.length === 0) {
      return NextResponse.json({ error: "缺少必填字段" }, { status: 400 });
    }

    const newSurvey = {
      title,
      titleEn: titleEn || "",
      description: description || "",
      descriptionEn: descriptionEn || "",
      questions: questions.map((q: any, index: number) => ({
        index,
        text: q.text,
        textEn: q.textEn || "",
        type: q.type || "single", // single, multiple, text
        section: q.section || "",
        options: q.options || [],
        optionsEn: q.optionsEn || [],
        required: q.required !== false,
      })),
      sections: sections || [],
      author: user.username,
      authorId: user.userId,
      status: "draft", // draft, published, closed
      isVisible: true,
      responseCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      publishedAt: null,
    };

    const result = await db.collection("surveys").insertOne(newSurvey);

    return NextResponse.json({ ...newSurvey, _id: result.insertedId }, { status: 201 });
  } catch (error) {
    console.error("创建问卷失败:", error);
    return NextResponse.json({ error: "创建问卷失败" }, { status: 500 });
  }
}
