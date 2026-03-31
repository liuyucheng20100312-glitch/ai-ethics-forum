import { connectToDatabase } from "@/lib/mongodb";
import { getUserFromRequest } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";

// PATCH: 更新反馈状态（仅管理员）
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = getUserFromRequest(request);

  // 检查是否是管理员
  if (!user || user.userId !== "offline_admin") {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  try {
    const { db } = await connectToDatabase();
    const { id } = await params;
    const body = await request.json();
    const { status } = body;

    if (!["pending", "read", "resolved"].includes(status)) {
      return NextResponse.json({ error: "无效的状态" }, { status: 400 });
    }

    const result = await db.collection("feedbacks").updateOne(
      { _id: new ObjectId(id) },
      { $set: { status, updatedAt: new Date() } }
    );

    if (result.matchedCount === 0) {
      return NextResponse.json({ error: "反馈不存在" }, { status: 404 });
    }

    return NextResponse.json({ message: "状态更新成功" });
  } catch (error) {
    console.error("更新反馈失败:", error);
    return NextResponse.json(
      { error: "更新反馈失败" },
      { status: 500 }
    );
  }
}

// DELETE: 删除反馈（仅管理员）
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = getUserFromRequest(request);

  // 检查是否是管理员
  if (!user || user.userId !== "offline_admin") {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  try {
    const { db } = await connectToDatabase();
    const { id } = await params;

    const result = await db.collection("feedbacks").deleteOne({
      _id: new ObjectId(id),
    });

    if (result.deletedCount === 0) {
      return NextResponse.json({ error: "反馈不存在" }, { status: 404 });
    }

    return NextResponse.json({ message: "删除成功" });
  } catch (error) {
    console.error("删除反馈失败:", error);
    return NextResponse.json(
      { error: "删除反馈失败" },
      { status: 500 }
    );
  }
}
