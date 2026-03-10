"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../context/AuthContext";

const categories = ["全部", "政策法规", "学术研究", "行业动态", "校园新闻"];

const news = [
  // ── 2026年3月 ──────────────────────────────────────────────
  {
    id: "openai-gpt5-agent-march-2026",
    title: "OpenAI发布GPT-5 Agent：可自主完成多步骤任务",
    category: "行业动态",
    date: "2026-03-08",
    source: "OpenAI Blog",
    summary: "GPT-5 Agent具备浏览器操作、代码执行、文件管理等自主能力，引发学界对AI自主行动边界与责任归属的广泛讨论。",
  },
  {
    id: "china-ai-education-standard-2026",
    title: "教育部发布中小学AI素养教育标准（征求意见稿）",
    category: "政策法规",
    date: "2026-03-06",
    source: "教育部",
    summary: "标准将AI伦理纳入K-12必修内容，要求学生理解算法偏见、数据隐私与AI创作版权等核心概念。",
  },
  {
    id: "deepseek-r2-safety-2026",
    title: "DeepSeek R2发布后安全评估：开源大模型的双刃剑风险",
    category: "学术研究",
    date: "2026-03-05",
    source: "AI安全研究院",
    summary: "多家机构对开源模型的红队测试显示，无护栏的开源版本可被低成本微调用于有害内容生成，监管挑战日益突出。",
  },
  {
    id: "eu-ai-act-enforcement-march-2026",
    title: "欧盟AI法案首批执法案例公布，三家企业因高风险AI违规被罚",
    category: "政策法规",
    date: "2026-03-03",
    source: "欧盟AI办公室",
    summary: "执法重点包括人脸识别滥用和招聘AI的歧视性结果，最高罚款达全球年营业额6%。",
  },
  {
    id: "gcgs-ai-debate-march-2026",
    title: "广东碧桂园学校举办「AI时代的学术诚信」主题辩论赛",
    category: "校园新闻",
    date: "2026-03-01",
    source: "学校资讯",
    summary: "本届辩题为「AI辅助写作是否属于学术不端」，正反双方围绕工具属性与创作主体展开激烈辩论，最终以平局收场。",
  },
  // ── 2026年2月 ──────────────────────────────────────────────
  {
    id: "eu-ai-act-2026",
    title: "欧盟AI法案正式生效，全球AI监管进入新阶段",
    category: "政策法规",
    date: "2026-02-25",
    source: "AI伦理观察",
    summary: "欧盟《人工智能法案》于本月正式生效，对高风险AI应用提出严格监管要求，影响全球科技企业的AI部署策略。",
  },
  {
    id: "stanford-gpt5-medical",
    title: "斯坦福报告：GPT-5在医疗诊断中的伦理风险",
    category: "学术研究",
    date: "2026-02-22",
    source: "斯坦福HAI",
    summary: "最新研究报告揭示大型语言模型在医疗场景中可能带来的诊断偏差与隐私泄露风险。",
  },
  {
    id: "university-ai-guidelines",
    title: "各大高校开始推行AI使用规范指导方针",
    category: "校园新闻",
    date: "2026-02-20",
    source: "教育资讯",
    summary: "国内多所高校相继发布学术写作中AI工具使用规范，明确边界以应对学术诚信挑战。",
  },
  {
    id: "deepmind-safety-whitepaper",
    title: "谷歌DeepMind发布AI安全白皮书",
    category: "行业动态",
    date: "2026-02-18",
    source: "DeepMind",
    summary: "白皮书详细阐述了对齐研究、可解释性和红队测试等关键安全技术的最新进展。",
  },
  {
    id: "china-genai-regulation-2026",
    title: "中国发布《生成式人工智能服务管理暂行办法》修订版",
    category: "政策法规",
    date: "2026-02-15",
    source: "网信办",
    summary: "修订版进一步细化了对生成内容的标注要求及平台的审核责任。",
  },
  {
    id: "mit-gender-bias-ai",
    title: "MIT研究：AI系统中的性别偏见持续存在",
    category: "学术研究",
    date: "2026-02-12",
    source: "MIT Media Lab",
    summary: "针对50个主流AI应用的研究发现，在招聘、信贷等高风险场景中性别偏见问题依然突出。",
  },
];

export default function NewsPage() {
  const { isGuest, authFetch } = useAuth();
  const [selected, setSelected] = useState("全部");
  const [bookmarked, setBookmarked] = useState<Set<string>>(new Set());

  const filtered = selected === "全部" ? news : news.filter((n) => n.category === selected);

  const loadBookmarks = useCallback(async () => {
    if (isGuest) return;
    try {
      const res = await authFetch("/api/bookmarks");
      const data = await res.json();
      if (Array.isArray(data))
        setBookmarked(new Set(data.filter((b: any) => b.itemType === "news").map((b: any) => b.itemId)));
    } catch {}
  }, [isGuest, authFetch]);

  useEffect(() => { loadBookmarks(); }, [loadBookmarks]);

  async function toggleBookmark(item: (typeof news)[0]) {
    if (isGuest) return;
    const isMarked = bookmarked.has(item.id);
    setBookmarked((prev) => { const s = new Set(prev); isMarked ? s.delete(item.id) : s.add(item.id); return s; });
    try {
      if (isMarked) {
        await authFetch(`/api/bookmarks/${encodeURIComponent(item.id)}?type=news`, { method: "DELETE" });
      } else {
        await authFetch("/api/bookmarks", { method: "POST", body: JSON.stringify({
          itemId: item.id, itemType: "news", title: item.title,
          subtitle: `${item.source} · ${item.date}`, emoji: "📰",
        })});
      }
    } catch {
      setBookmarked((prev) => { const s = new Set(prev); isMarked ? s.add(item.id) : s.delete(item.id); return s; });
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">新闻专区</h1>
        <p className="text-gray-500 mt-1">AI 伦理领域最新动态</p>
      </div>

      {/* 分类 */}
      <div className="flex gap-2 flex-wrap">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setSelected(cat)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              selected === cat
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* 新闻列表 */}
      <div className="space-y-4">
        {filtered.map((item) => (
          <div key={item.id} className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full">{item.category}</span>
                  <span className="text-xs text-gray-400">{item.source}</span>
                </div>
                <h3 className="font-semibold text-gray-900 mb-1">{item.title}</h3>
                <p className="text-sm text-gray-500">{item.summary}</p>
              </div>
              <div className="flex flex-col items-end gap-2 shrink-0">
                <span className="text-xs text-gray-400">{item.date}</span>
                {!isGuest && (
                  <button
                    onClick={() => toggleBookmark(item)}
                    title={bookmarked.has(item.id) ? "取消收藏" : "收藏"}
                    className={`text-xl leading-none transition-colors ${
                      bookmarked.has(item.id) ? "text-yellow-500" : "text-gray-300 hover:text-yellow-400"
                    }`}
                  >
                    {bookmarked.has(item.id) ? "★" : "☆"}
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
