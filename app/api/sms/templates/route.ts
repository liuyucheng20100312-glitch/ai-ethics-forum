import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { getUserFromRequest } from "@/lib/auth";
import { ObjectId } from "mongodb";

/**
 * 获取短信模板列表
 * GET /api/sms/templates
 */
export async function GET(request: NextRequest) {
  try {
    // 验证管理员权限
    const user = getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    const { db } = await connectToDatabase();

    // 检查是否是管理员
    const userDoc = await db.collection("users").findOne({ username: user.username });
    const isAdmin = userDoc?.isAdmin === true || user.userId === "offline_admin";

    if (!isAdmin) {
      return NextResponse.json({ error: "无权限访问" }, { status: 403 });
    }

    const templates = await db.collection("sms_templates").find({}).sort({ createdAt: -1 }).toArray();

    return NextResponse.json({ templates });
  } catch (error) {
    console.error("获取短信模板失败:", error);
    return NextResponse.json({ error: "获取短信模板失败" }, { status: 500 });
  }
}

/**
 * 创建短信模板
 * POST /api/sms/templates
 * Body: { code: string, name: string, content: string }
 */
export async function POST(request: NextRequest) {
  try {
    // 验证管理员权限
    const user = getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    const { db } = await connectToDatabase();

    // 检查是否是管理员
    const userDoc = await db.collection("users").findOne({ username: user.username });
    const isAdmin = userDoc?.isAdmin === true || user.userId === "offline_admin";

    if (!isAdmin) {
      return NextResponse.json({ error: "无权限访问" }, { status: 403 });
    }

    const { code, name, content } = await request.json();

    if (!code || !name || !content) {
      return NextResponse.json({ error: "参数不完整" }, { status: 400 });
    }

    // 检查模板编码是否已存在
    const existing = await db.collection("sms_templates").findOne({ code: code.toUpperCase() });
    if (existing) {
      return NextResponse.json({ error: "模板编码已存在" }, { status: 400 });
    }

    // 验证模板内容是否包含 {code} 占位符
    if (!content.includes("{code}")) {
      return NextResponse.json({ error: "模板内容必须包含 {code} 占位符" }, { status: 400 });
    }

    const result = await db.collection("sms_templates").insertOne({
      code: code.toUpperCase(),
      name,
      content,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return NextResponse.json({
      success: true,
      template: {
        _id: result.insertedId,
        code: code.toUpperCase(),
        name,
        content,
        isActive: true,
      },
    }, { status: 201 });
  } catch (error) {
    console.error("创建短信模板失败:", error);
    return NextResponse.json({ error: "创建短信模板失败" }, { status: 500 });
  }
}

/**
 * 更新短信模板
 * PUT /api/sms/templates
 * Body: { id: string, name?: string, content?: string, isActive?: boolean }
 */
export async function PUT(request: NextRequest) {
  try {
    // 验证管理员权限
    const user = getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    const { db } = await connectToDatabase();

    // 检查是否是管理员
    const userDoc = await db.collection("users").findOne({ username: user.username });
    const isAdmin = userDoc?.isAdmin === true || user.userId === "offline_admin";

    if (!isAdmin) {
      return NextResponse.json({ error: "无权限访问" }, { status: 403 });
    }

    const { id, name, content, isActive } = await request.json();

    if (!id) {
      return NextResponse.json({ error: "模板ID不能为空" }, { status: 400 });
    }

    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (name) updateData.name = name;
    if (content) {
      if (!content.includes("{code}")) {
        return NextResponse.json({ error: "模板内容必须包含 {code} 占位符" }, { status: 400 });
      }
      updateData.content = content;
    }
    if (typeof isActive === "boolean") updateData.isActive = isActive;

    const result = await db.collection("sms_templates").updateOne(
      { _id: new ObjectId(id) },
      { $set: updateData }
    );

    if (result.matchedCount === 0) {
      return NextResponse.json({ error: "模板不存在" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("更新短信模板失败:", error);
    return NextResponse.json({ error: "更新短信模板失败" }, { status: 500 });
  }
}

/**
 * 删除短信模板
 * DELETE /api/sms/templates?id=xxx
 */
export async function DELETE(request: NextRequest) {
  try {
    // 验证管理员权限
    const user = getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    const { db } = await connectToDatabase();

    // 检查是否是管理员
    const userDoc = await db.collection("users").findOne({ username: user.username });
    const isAdmin = userDoc?.isAdmin === true || user.userId === "offline_admin";

    if (!isAdmin) {
      return NextResponse.json({ error: "无权限访问" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "模板ID不能为空" }, { status: 400 });
    }

    const result = await db.collection("sms_templates").deleteOne({ _id: new ObjectId(id) });

    if (result.deletedCount === 0) {
      return NextResponse.json({ error: "模板不存在" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("删除短信模板失败:", error);
    return NextResponse.json({ error: "删除短信模板失败" }, { status: 500 });
  }
}
