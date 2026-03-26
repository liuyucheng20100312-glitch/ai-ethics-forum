import { connectToDatabase } from "@/lib/mongodb";
import { getUserFromRequest } from "@/lib/auth";
import { analyzeSurveyStatistics } from "@/lib/bailian";
import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";

// 检查是否是管理员
function isAdmin(userId: string | undefined): boolean {
  return userId === "offline_admin";
}

// GET: 获取问卷统计分析
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = getUserFromRequest(request);
  if (!user || !isAdmin(user.userId)) {
    return NextResponse.json({ error: "无权限查看分析" }, { status: 403 });
  }

  try {
    const { id } = await params;
    const { db } = await connectToDatabase();

    let survey;
    try {
      survey = await db.collection("surveys").findOne({ _id: new ObjectId(id) });
    } catch {
      survey = await db.collection("surveys").findOne({ _id: id as never });
    }

    if (!survey) {
      return NextResponse.json({ error: "问卷不存在" }, { status: 404 });
    }

    // 获取所有回答
    const responses = await db
      .collection("survey_responses")
      .find({ surveyId: id })
      .toArray();

    // 计算统计数据
    const questionStats = survey.questions.map((q: any, index: number) => {
      const optionCounts: Record<string, number> = {};
      const textAnswers: string[] = [];

      if (q.type === "single" || q.type === "multiple") {
        q.options?.forEach((opt: string) => {
          optionCounts[opt] = 0;
        });

        responses.forEach((resp: any) => {
          const answer = resp.answers?.find((a: any) => a.questionIndex === index);
          if (answer) {
            if (q.type === "single") {
              if (optionCounts[answer.answer] !== undefined) {
                optionCounts[answer.answer]++;
              }
            } else if (q.type === "multiple" && Array.isArray(answer.answer)) {
              answer.answer.forEach((ans: string) => {
                if (optionCounts[ans] !== undefined) {
                  optionCounts[ans]++;
                }
              });
            }
          }
        });
      } else if (q.type === "text") {
        responses.forEach((resp: any) => {
          const answer = resp.answers?.find((a: any) => a.questionIndex === index);
          if (answer?.answer && typeof answer.answer === "string") {
            textAnswers.push(answer.answer);
          }
        });
      }

      return {
        questionIndex: index,
        questionText: q.text,
        questionType: q.type,
        optionCounts,
        textAnswers: textAnswers.slice(0, 100), // 最多返回100条文本答案
        total: responses.length,
      };
    });

    // AI分析整体统计
    let aiSummary = "";
    try {
      const questionsForAI = survey.questions.map((q: any, index: number) => ({
        index,
        text: q.text,
        options: q.options || [],
      }));

      aiSummary = await analyzeSurveyStatistics(
        survey.title,
        questionsForAI,
        questionStats.map((qs: any) => ({
          optionCounts: qs.optionCounts,
          total: qs.total,
        }))
      );
    } catch (e) {
      console.error("AI统计摘要生成失败:", e);
    }

    return NextResponse.json({
      surveyId: id,
      surveyTitle: survey.title,
      totalResponses: responses.length,
      questionStats,
      aiSummary,
      responses: responses.map((r: any) => ({
        username: r.username,
        submittedAt: r.createdAt,
        answers: r.answers,
        additionalComment: r.additionalComment,
        aiAnalysis: r.aiAnalysis,
      })),
    });
  } catch (error) {
    console.error("获取统计分析失败:", error);
    return NextResponse.json({ error: "获取统计分析失败" }, { status: 500 });
  }
}
