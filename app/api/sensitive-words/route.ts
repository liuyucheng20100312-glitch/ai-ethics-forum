import { connectToDatabase } from "@/lib/mongodb";
import { getUserFromRequest } from "@/lib/auth";
import { clearSensitiveWordsCache } from "@/lib/sensitive";
import { isAdminUser, unauth, forbidden, badRequest, serverError } from "@/lib/api-helpers";
import { NextRequest, NextResponse } from "next/server";

// GET: 获取所有敏感词（仅管理员）
export async function GET(request: NextRequest) {
  const user = getUserFromRequest(request);
  if (!user) return unauth();
  if (!isAdminUser(user.userId)) return forbidden();

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
    return serverError("获取敏感词失败");
  }
}

// POST: 添加敏感词（仅管理员）
export async function POST(request: NextRequest) {
  const user = getUserFromRequest(request);
  if (!user) return unauth();
  if (!isAdminUser(user.userId)) return forbidden();

  try {
    const { db } = await connectToDatabase();
    const body = await request.json();

    const { word, category, severity } = body;

    if (!word || !word.trim()) return badRequest("敏感词不能为空");

    // 检查是否已存在
    const existing = await db.collection("sensitive_words").findOne({
      word: word.trim().toLowerCase(),
    });

    if (existing) return badRequest("该敏感词已存在");

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
    return serverError("添加敏感词失败");
  }
}

// DELETE: 批量删除敏感词（仅管理员）
export async function DELETE(request: NextRequest) {
  const user = getUserFromRequest(request);
  if (!user) return unauth();
  if (!isAdminUser(user.userId)) return forbidden();

  try {
    const { db } = await connectToDatabase();
    const { ids } = await request.json();

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return badRequest("请选择要删除的敏感词");
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
    return serverError("删除敏感词失败");
  }
}

// PUT: 批量导入敏感词（仅管理员）
export async function PUT(request: NextRequest) {
  const user = getUserFromRequest(request);
  if (!user) return unauth();
  if (!isAdminUser(user.userId)) return forbidden();

  try {
    const { db } = await connectToDatabase();
    const { words, category, severity } = await request.json();

    if (!words || !Array.isArray(words) || words.length === 0) {
      return badRequest("请提供敏感词列表");
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
    return serverError("批量导入失败");
  }
}
