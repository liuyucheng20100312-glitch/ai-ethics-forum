import { connectToDatabase } from "@/lib/mongodb";
import { getUserFromRequest } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";

// 检查是否是管理员
function isAdmin(userId: string | undefined): boolean {
  return userId === "offline_admin";
}

// GET: 获取单个问卷详情
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { db } = await connectToDatabase();

    let survey;
    try {
      survey = await db.collection("surveys").findOne({ _id: new ObjectId(id) });
    } catch {
      survey = await db.collection("surveys").findOne({ _id: id });
    }

    if (!survey) {
      return NextResponse.json({ error: "问卷不存在" }, { status: 404 });
    }

    // 获取统计信息
    const responses = await db
      .collection("survey_responses")
      .find({ surveyId: id })
      .toArray();

    // 计算每个问题的选项统计
    const questionStats = survey.questions.map((q: any, index: number) => {
      const optionCounts: Record<string, number> = {};

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
      }

      return {
        questionIndex: index,
        optionCounts,
        total: responses.length,
      };
    });

    return NextResponse.json({ ...survey, questionStats, responseCount: responses.length });
  } catch (error) {
    console.error("获取问卷详情失败:", error);
    return NextResponse.json({ error: "获取问卷详情失败" }, { status: 500 });
  }
}

// PUT: 更新问卷（仅管理员）
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = getUserFromRequest(request);
  if (!user || !isAdmin(user.userId)) {
    return NextResponse.json({ error: "无权限修改问卷" }, { status: 403 });
  }

  try {
    const { id } = await params;
    const { db } = await connectToDatabase();
    const body = await request.json();

    let survey;
    try {
      survey = await db.collection("surveys").findOne({ _id: new ObjectId(id) });
    } catch {
      survey = await db.collection("surveys").findOne({ _id: id });
    }

    if (!survey) {
      return NextResponse.json({ error: "问卷不存在" }, { status: 404 });
    }

    const updateData: any = {
      updatedAt: new Date(),
    };

    // 可更新的字段
    if (body.title) updateData.title = body.title;
    if (body.titleEn !== undefined) updateData.titleEn = body.titleEn;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.descriptionEn !== undefined) updateData.descriptionEn = body.descriptionEn;
    if (body.questions) {
      updateData.questions = body.questions.map((q: any, index: number) => ({
        index,
        text: q.text,
        textEn: q.textEn || "",
        type: q.type || "single",
        section: q.section || "",
        options: q.options || [],
        optionsEn: q.optionsEn || [],
        required: q.required !== false,
      }));
    }
    if (body.sections) updateData.sections = body.sections;
    if (body.status) {
      updateData.status = body.status;
      if (body.status === "published" && !survey.publishedAt) {
        updateData.publishedAt = new Date();
      }
    }
    if (body.isVisible !== undefined) updateData.isVisible = body.isVisible;

    try {
      await db.collection("surveys").updateOne(
        { _id: new ObjectId(id) },
        { $set: updateData }
      );
    } catch {
      await db.collection("surveys").updateOne(
        { _id: id },
        { $set: updateData }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("更新问卷失败:", error);
    return NextResponse.json({ error: "更新问卷失败" }, { status: 500 });
  }
}

// DELETE: 删除问卷（仅管理员）
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = getUserFromRequest(request);
  if (!user || !isAdmin(user.userId)) {
    return NextResponse.json({ error: "无权限删除问卷" }, { status: 403 });
  }

  try {
    const { id } = await params;
    const { db } = await connectToDatabase();

    try {
      await db.collection("surveys").deleteOne({ _id: new ObjectId(id) });
    } catch {
      await db.collection("surveys").deleteOne({ _id: id });
    }

    // 同时删除相关的回答
    await db.collection("survey_responses").deleteMany({ surveyId: id });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("删除问卷失败:", error);
    return NextResponse.json({ error: "删除问卷失败" }, { status: 500 });
  }
}
