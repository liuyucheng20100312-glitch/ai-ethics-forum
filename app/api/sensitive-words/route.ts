import { connectToDatabase } from "@/lib/mongodb";
import { getUserFromRequest } from "@/lib/auth";
import { clearSensitiveWordsCache } from "@/lib/sensitive";
import { NextRequest, NextResponse } from "next/server";

// 检查是否是管理员
function isAdmin(userId: string | undefined): boolean {
  return userId === "offline_admin";
}

// GET: 获取所有敏感词
export async function GET(request: NextRequest) {
  const user = getUserFromRequest(request);
  if (!user || !isAdmin(user.userId)) {
    return NextResponse.json({ error: "无权限访问" }, { status: 403 });
  }

  try {
    const { db } = await connectToDatabase();
    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category");

    const query = category ? { category } : {};
    const words = await db
      .collection("sensitive_words")
      .find(query)
      .sort({ category: 1, createdAt: -1 })
      .toArray();

    return NextResponse.json(words);
  } catch (error) {
    console.error("获取敏感词失败:", error);
    return NextResponse.json({ error: "获取敏感词失败" }, { status: 500 });
  }
}

// POST: 添加敏感词
export async function POST(request: NextRequest) {
  const user = getUserFromRequest(request);
  if (!user || !isAdmin(user.userId)) {
    return NextResponse.json({ error: "无权限操作" }, { status: 403 });
  }

  try {
    const { db } = await connectToDatabase();
    const body = await request.json();

    const { word, category, severity } = body;

    if (!word || !word.trim()) {
      return NextResponse.json({ error: "敏感词不能为空" }, { status: 400 });
    }

    // 检查是否已存在
    const existing = await db.collection("sensitive_words").findOne({
      word: word.trim().toLowerCase(),
    });

    if (existing) {
      return NextResponse.json({ error: "该敏感词已存在" }, { status: 400 });
    }

    const newWord = {
      word: word.trim(),
      category: category || "other",
      severity: severity || "medium",
      createdAt: new Date(),
      createdBy: user.username,
    };

    const result = await db.collection("sensitive_words").insertOne(newWord);

    // 清除缓存
    clearSensitiveWordsCache();

    return NextResponse.json({ ...newWord, _id: result.insertedId }, { status: 201 });
  } catch (error) {
    console.error("添加敏感词失败:", error);
    return NextResponse.json({ error: "添加敏感词失败" }, { status: 500 });
  }
}

// DELETE: 批量删除敏感词
export async function DELETE(request: NextRequest) {
  const user = getUserFromRequest(request);
  if (!user || !isAdmin(user.userId)) {
    return NextResponse.json({ error: "无权限操作" }, { status: 403 });
  }

  try {
    const { db } = await connectToDatabase();
    const body = await request.json();
    const { ids } = body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: "请选择要删除的敏感词" }, { status: 400 });
    }

    const { ObjectId } = await import("mongodb");
    const objectIds = ids.map((id: string) => new ObjectId(id));

    await db.collection("sensitive_words").deleteMany({
      _id: { $in: objectIds },
    });

    // 清除缓存
    clearSensitiveWordsCache();

    return NextResponse.json({ ok: true, deletedCount: ids.length });
  } catch (error) {
    console.error("删除敏感词失败:", error);
    return NextResponse.json({ error: "删除敏感词失败" }, { status: 500 });
  }
}

// PUT: 批量导入敏感词
export async function PUT(request: NextRequest) {
  const user = getUserFromRequest(request);
  if (!user || !isAdmin(user.userId)) {
    return NextResponse.json({ error: "无权限操作" }, { status: 403 });
  }

  try {
    const { db } = await connectToDatabase();
    const body = await request.json();
    const { words, category, severity } = body;

    if (!words || !Array.isArray(words) || words.length === 0) {
      return NextResponse.json({ error: "请提供敏感词列表" }, { status: 400 });
    }

    let addedCount = 0;
    let skippedCount = 0;

    for (const word of words) {
      const trimmedWord = word.trim();
      if (!trimmedWord) continue;

      // 检查是否已存在
      const existing = await db.collection("sensitive_words").findOne({
        word: trimmedWord.toLowerCase(),
      });

      if (existing) {
        skippedCount++;
        continue;
      }

      await db.collection("sensitive_words").insertOne({
        word: trimmedWord,
        category: category || "other",
        severity: severity || "medium",
        createdAt: new Date(),
        createdBy: user.username,
      });
      addedCount++;
    }

    // 清除缓存
    clearSensitiveWordsCache();

    return NextResponse.json({
      ok: true,
      addedCount,
      skippedCount,
    });
  } catch (error) {
    console.error("批量导入失败:", error);
    return NextResponse.json({ error: "批量导入失败" }, { status: 500 });
  }
}
