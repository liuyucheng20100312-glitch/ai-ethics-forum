import { connectToDatabase } from "@/lib/mongodb";
import { getUserFromRequest } from "@/lib/auth";
import { analyzeSurveyAnswers } from "@/lib/bailian";
import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";

// POST: 提交问卷答案
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

    const { answers, additionalComment } = body;

    if (!answers || !Array.isArray(answers)) {
      return NextResponse.json({ error: "答案格式错误" }, { status: 400 });
    }

    // 查找问卷
    let survey;
    try {
      survey = await db.collection("surveys").findOne({ _id: new ObjectId(id) });
    } catch {
      survey = await db.collection("surveys").findOne({ _id: id as never });
    }

    if (!survey) {
      return NextResponse.json({ error: "问卷不存在" }, { status: 404 });
    }

    if (survey.status !== "published") {
      return NextResponse.json({ error: "问卷未发布或已结束" }, { status: 400 });
    }

    if (survey.isVisible === false) {
      return NextResponse.json({ error: "问卷已下架" }, { status: 400 });
    }

    // 检查是否已提交过
    const existingResponse = await db.collection("survey_responses").findOne({
      surveyId: id,
      userId: user.userId,
    });

    if (existingResponse) {
      return NextResponse.json({ error: "您已提交过此问卷" }, { status: 400 });
    }

    // 格式化答案用于AI分析
    const formattedAnswers = answers.map((a: any) => ({
      questionIndex: a.questionIndex,
      question: survey.questions[a.questionIndex]?.text || "",
      answer: a.answer,
      answerOption: a.answerOption,
    }));

    // 调用AI分析
    let aiAnalysis = null;
    try {
      aiAnalysis = await analyzeSurveyAnswers(survey.title, formattedAnswers);
    } catch (e) {
      console.error("AI分析失败:", e);
    }

    // 保存回答
    const response = {
      surveyId: id,
      userId: user.userId,
      username: user.username,
      answers,
      additionalComment: additionalComment || "",
      aiAnalysis,
      createdAt: new Date(),
    };

    await db.collection("survey_responses").insertOne(response);

    // 更新问卷回答数
    try {
      await db.collection("surveys").updateOne(
        { _id: new ObjectId(id) },
        { $inc: { responseCount: 1 } }
      );
    } catch {
      await db.collection("surveys").updateOne(
        { _id: id as never },
        { $inc: { responseCount: 1 } }
      );
    }

    return NextResponse.json({
      ok: true,
      aiAnalysis: aiAnalysis || {
        summary: "感谢您的参与！您的回答已记录。",
        insights: [],
        suggestions: [],
      },
    });
  } catch (error) {
    console.error("提交问卷失败:", error);
    return NextResponse.json({ error: "提交问卷失败" }, { status: 500 });
  }
}

// GET: 获取当前用户的提交状态
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = getUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ submitted: false });
  }

  try {
    const { id } = await params;
    const { db } = await connectToDatabase();

    const response = await db.collection("survey_responses").findOne({
      surveyId: id,
      userId: user.userId,
    });

    if (!response) {
      return NextResponse.json({ submitted: false });
    }

    return NextResponse.json({
      submitted: true,
      submittedAt: response.createdAt,
      aiAnalysis: response.aiAnalysis,
    });
  } catch (error) {
    console.error("获取提交状态失败:", error);
    return NextResponse.json({ submitted: false });
  }
}
