/**
 * 敏感词检测工具
 */

import { connectToDatabase } from "./mongodb";

export interface SensitiveWord {
  _id: string;
  word: string;
  category: string;
  severity: "low" | "medium" | "high";
  createdAt: Date;
}

// 缓存敏感词列表
let cachedWords: SensitiveWord[] = [];
let cacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5分钟缓存

/**
 * 获取所有敏感词
 */
export async function getSensitiveWords(): Promise<SensitiveWord[]> {
  const now = Date.now();

  // 使用缓存
  if (cachedWords.length > 0 && now - cacheTime < CACHE_TTL) {
    return cachedWords;
  }

  try {
    const { db } = await connectToDatabase();
    const words = await db.collection("sensitive_words").find({}).toArray();
    cachedWords = words.map((w: any) => ({
      _id: w._id.toString(),
      word: w.word,
      category: w.category,
      severity: w.severity,
      createdAt: w.createdAt,
    }));
    cacheTime = now;
    return cachedWords;
  } catch (error) {
    console.error("获取敏感词失败:", error);
    return [];
  }
}

/**
 * 清除缓存
 */
export function clearSensitiveWordsCache() {
  cachedWords = [];
  cacheTime = 0;
}

/**
 * 检测文本中的敏感词
 * @returns 返回检测到的敏感词列表
 */
export async function detectSensitiveWords(text: string): Promise<{
  found: boolean;
  words: Array<{ word: string; category: string; severity: string }>;
  hasHighSeverity: boolean;
}> {
  if (!text || typeof text !== "string") {
    return { found: false, words: [], hasHighSeverity: false };
  }

  const sensitiveWords = await getSensitiveWords();
  const foundWords: Array<{ word: string; category: string; severity: string }> = [];
  let hasHighSeverity = false;

  // 转换为小写进行检测（中文不区分大小写）
  const lowerText = text.toLowerCase();

  for (const sw of sensitiveWords) {
    const lowerWord = sw.word.toLowerCase();
    if (lowerText.includes(lowerWord)) {
      foundWords.push({
        word: sw.word,
        category: sw.category,
        severity: sw.severity,
      });
      if (sw.severity === "high") {
        hasHighSeverity = true;
      }
    }
  }

  return {
    found: foundWords.length > 0,
    words: foundWords,
    hasHighSeverity,
  };
}

/**
 * 替换敏感词为 ***
 */
export function maskSensitiveWords(text: string, words: Array<{ word: string }>): string {
  if (!text) return text;

  let result = text;
  for (const w of words) {
    const regex = new RegExp(w.word, "gi");
    result = result.replace(regex, "*".repeat(w.word.length));
  }
  return result;
}

/**
 * 审核状态
 */
export type ModerationStatus = "approved" | "pending" | "rejected";

/**
 * 内容类型
 */
export type ContentType = "post" | "reply" | "vote_comment" | "survey_response" | "vote";

/**
 * 创建审核记录
 */
export async function createModerationRecord(params: {
  contentType: ContentType;
  contentId: string;
  author: string;
  authorId: string;
  content: string;
  sensitiveWords: Array<{ word: string; category: string; severity: string }>;
  status: ModerationStatus;
}) {
  const { db } = await connectToDatabase();

  const record = {
    contentType: params.contentType,
    contentId: params.contentId,
    author: params.author,
    authorId: params.authorId,
    content: params.content,
    sensitiveWords: params.sensitiveWords,
    status: params.status,
    reviewedBy: null,
    reviewedAt: null,
    reviewNote: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const result = await db.collection("moderation_records").insertOne(record);
  return { ...record, _id: result.insertedId };
}

/**
 * 更新审核状态
 */
export async function updateModerationStatus(
  contentId: string,
  status: ModerationStatus,
  reviewedBy: string,
  reviewNote?: string
) {
  const { db } = await connectToDatabase();

  await db.collection("moderation_records").updateOne(
    { contentId },
    {
      $set: {
        status,
        reviewedBy,
        reviewedAt: new Date(),
        reviewNote: reviewNote || null,
        updatedAt: new Date(),
      },
    }
  );
}
