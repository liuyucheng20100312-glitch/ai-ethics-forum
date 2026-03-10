"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../context/AuthContext";

export default function PodcastPage() {
  const { isGuest, authFetch } = useAuth();
  const [bookmarked, setBookmarked] = useState<Set<string>>(new Set());

  const podcasts = [
    {
      id: "podcast-ai-ethics-ready",
      title: "AI伦理：我们准备好了吗？",
      host: "张明 & 李华",
      duration: "48分钟",
      date: "2026-02-20",
      description: "探讨AI技术快速发展背景下，社会伦理规范是否跟得上技术步伐。",
      tags: ["伦理", "社会"],
    },
    {
      id: "podcast-llm-bias",
      title: "大模型的偏见问题",
      host: "王芳",
      duration: "35分钟",
      date: "2026-02-15",
      description: "深入分析训练数据中的偏见如何影响AI模型的输出结果。",
      tags: ["偏见", "大模型"],
    },
    {
      id: "podcast-campus-ai",
      title: "校园里的AI：机遇与挑战",
      host: "刘强 & 陈静",
      duration: "52分钟",
      date: "2026-02-10",
      description: "高校教师与学生共同讨论AI工具在教育场景中的应用边界。",
      tags: ["教育", "校园"],
    },
    {
      id: "podcast-ai-copyright",
      title: "AI创作版权归谁？",
      host: "赵雷",
      duration: "41分钟",
      date: "2026-02-05",
      description: "从法律和道德两个视角分析AI生成内容的版权归属问题。",
      tags: ["版权", "创作"],
    },
  ];

  const loadBookmarks = useCallback(async () => {
    if (isGuest) return;
    try {
      const res = await authFetch("/api/bookmarks");
      const data = await res.json();
      if (Array.isArray(data))
        setBookmarked(new Set(data.filter((b: any) => b.itemType === "podcast").map((b: any) => b.itemId)));
    } catch {}
  }, [isGuest, authFetch]);

  useEffect(() => { loadBookmarks(); }, [loadBookmarks]);

  async function toggleBookmark(p: (typeof podcasts)[0]) {
    if (isGuest) return;
    const isMarked = bookmarked.has(p.id);
    setBookmarked((prev) => { const s = new Set(prev); isMarked ? s.delete(p.id) : s.add(p.id); return s; });
    try {
      if (isMarked) {
        await authFetch(`/api/bookmarks/${encodeURIComponent(p.id)}?type=podcast`, { method: "DELETE" });
      } else {
        await authFetch("/api/bookmarks", { method: "POST", body: JSON.stringify({
          itemId: p.id, itemType: "podcast", title: p.title,
          subtitle: `${p.host} · ${p.duration}`, emoji: "🎧",
        })});
      }
    } catch {
      setBookmarked((prev) => { const s = new Set(prev); isMarked ? s.add(p.id) : s.delete(p.id); return s; });
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">播客专区</h1>
        <p className="text-gray-500 mt-1">收听关于 AI 伦理的深度对话</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {podcasts.map((p) => (
          <div key={p.id} className="bg-white border border-gray-100 rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between mb-3">
              <div className="w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center text-2xl shrink-0">
                🎙️
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400">{p.date}</span>
                {!isGuest && (
                  <button
                    onClick={() => toggleBookmark(p)}
                    title={bookmarked.has(p.id) ? "取消收藏" : "收藏"}
                    className={`text-xl leading-none transition-colors ${
                      bookmarked.has(p.id) ? "text-yellow-500" : "text-gray-300 hover:text-yellow-400"
                    }`}
                  >
                    {bookmarked.has(p.id) ? "★" : "☆"}
                  </button>
                )}
              </div>
            </div>
            <h3 className="font-semibold text-gray-900 mb-1">{p.title}</h3>
            <p className="text-sm text-gray-500 mb-3">{p.description}</p>
            <div className="flex items-center justify-between">
              <div className="flex gap-2">
                {p.tags.map((tag, j) => (
                  <span key={j} className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">{tag}</span>
                ))}
              </div>
              <div className="flex items-center gap-3 text-sm text-gray-400">
                <span>👤 {p.host}</span>
                <span>⏱ {p.duration}</span>
              </div>
            </div>
            <button className="mt-4 w-full bg-indigo-600 text-white text-sm font-medium py-2 rounded-lg hover:bg-indigo-700 transition-colors">
              ▶ 收听
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
