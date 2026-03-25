"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../context/AuthContext";

const categories = ["全部", "AI课程", "AI对话", "AI绘画", "AI音乐", "AI写作", "AI漫剧", "AI视频", "AI编程"];

// 收藏量数据每月更新，国产优先排列
// 最近更新：2026年3月
const tools = [
  // ── 免费AI课程 ────────────────────────────────────────────
  {
    name: "吴恩达 AI For Everyone",
    category: "AI课程",
    description: "DeepLearning.AI出品，全球最受欢迎的AI科普课程，无需编程基础，讲解AI如何改变各行各业与伦理挑战，有中文字幕。",
    url: "https://www.coursera.org/learn/ai-for-everyone",
    emoji: "🎓",
    domestic: false,
    bookmarkCount: 500,
    likes: 0,
    collected: false,
  },
  {
    name: "吴恩达 AI Ethics（AI伦理专项课）",
    category: "AI课程",
    description: "专注AI伦理议题，涵盖公平性、偏见、透明度与问责制，适合直接关联本论坛主题的深度学习，免费旁听。",
    url: "https://www.coursera.org/learn/ethics-in-ai",
    emoji: "⚖️",
    domestic: false,
    bookmarkCount: 320,
    likes: 0,
    collected: false,
  },
  {
    name: "微软 AI-900 备考课",
    category: "AI课程",
    description: "微软官方免费AI基础课程，涵盖机器学习、计算机视觉、自然语言处理等核心概念，完成可获微软证书。",
    url: "https://learn.microsoft.com/zh-cn/training/paths/get-started-with-artificial-intelligence-on-azure/",
    emoji: "🪟",
    domestic: false,
    bookmarkCount: 410,
    likes: 0,
    collected: false,
  },
  {
    name: "谷歌 Machine Learning Crash Course",
    category: "AI课程",
    description: "谷歌官方免费机器学习速成课，有中文版，包含大量交互练习，适合有一定数学基础的同学入门。",
    url: "https://developers.google.com/machine-learning/crash-course?hl=zh-cn",
    emoji: "🔵",
    domestic: false,
    bookmarkCount: 380,
    likes: 0,
    collected: false,
  },
  {
    name: "慕课网 AI伦理与治理",
    category: "AI课程",
    description: "国内高校联合开设的AI伦理公开课，讲解算法公正、数据权利与AI治理框架，全中文，免费学习。",
    url: "https://www.icourse163.org",
    emoji: "🏫",
    domestic: true,
    bookmarkCount: 290,
    likes: 0,
    collected: false,
  },
  {
    name: "哈佛 CS50's AI with Python",
    category: "AI课程",
    description: "哈佛大学开放课程，用Python讲解搜索、知识表示、机器学习等AI核心算法，全球最受欢迎的编程类AI课之一，免费。",
    url: "https://cs50.harvard.edu/ai/",
    emoji: "🏛️",
    domestic: false,
    bookmarkCount: 460,
    likes: 0,
    collected: false,
  },
  {
    name: "Fast.ai 深度学习实战",
    category: "AI课程",
    description: "由顶级AI研究者主讲，自顶向下教学法，直接上手实战项目，完全免费且持续更新，适合有编程基础的学习者。",
    url: "https://www.fast.ai",
    emoji: "⚡",
    domestic: false,
    bookmarkCount: 340,
    likes: 0,
    collected: false,
  },
  {
    name: "DeepSeek",
    category: "AI对话",
    description: "深度求索推出的开源大语言模型，在推理和代码任务上媲美顶级闭源模型，中英双语能力突出。",
    url: "https://chat.deepseek.com",
    emoji: "🔍",
    domestic: true,
    bookmarkCount: 320,
    likes: 0,
    collected: false,
  },
  {
    name: "通义千问",
    category: "AI对话",
    description: "阿里巴巴推出的大语言模型助手，支持长文本理解、多轮对话、代码生成与文档分析。",
    url: "https://qwen.aliyun.com",
    emoji: "🤖",
    domestic: true,
    bookmarkCount: 280,
    likes: 0,
    collected: false,
  },
  {
    name: "文心一言",
    category: "AI对话",
    description: "百度推出的知识增强大语言模型，擅长中文语境下的创作、问答与信息检索。",
    url: "https://yiyan.baidu.com",
    emoji: "💬",
    domestic: true,
    bookmarkCount: 240,
    likes: 0,
    collected: false,
  },
  {
    name: "豆包",
    category: "AI对话",
    description: "字节跳动推出的 AI 对话助手，具备文字、图片理解能力，日常问答体验流畅。",
    url: "https://www.doubao.com",
    emoji: "🫘",
    domestic: true,
    bookmarkCount: 260,
    likes: 0,
    collected: false,
  },
  {
    name: "Kimi",
    category: "AI对话",
    description: "月之暗面推出的长文本 AI 助手，支持上传 200 万字文档进行理解与摘要。",
    url: "https://kimi.moonshot.cn",
    emoji: "🌙",
    domestic: true,
    bookmarkCount: 220,
    likes: 0,
    collected: false,
  },
  {
    name: "可灵 AI",
    category: "AI视频",
    description: "快手推出的 AI 视频生成大模型，支持长达 3 分钟视频生成，运动自然、画质细腻。",
    url: "https://klingai.kuaishou.com",
    emoji: "🎞️",
    domestic: true,
    bookmarkCount: 200,
    likes: 0,
    collected: false,
  },
  {
    name: "Seedance 2.0",
    category: "AI视频",
    description: "字节跳动推出的新一代 AI 视频生成模型，支持高分辨率、长时长视频创作，动态效果逼真。",
    url: "https://seedance.bytedance.com",
    emoji: "🌱",
    domestic: true,
    bookmarkCount: 190,
    likes: 0,
    collected: false,
  },
  {
    name: "即梦 AI",
    category: "AI绘画",
    description: "字节跳动旗下 AI 绘画与视频生成平台，文生图效果精细，支持人物一致性控制。",
    url: "https://jimeng.jianying.com",
    emoji: "🌅",
    domestic: true,
    bookmarkCount: 180,
    likes: 0,
    collected: false,
  },
  {
    name: "海螺 AI",
    category: "AI视频",
    description: "MiniMax 推出的 AI 视频生成工具，运动流畅、细节还原度高，支持图生视频。",
    url: "https://hailuoai.video",
    emoji: "🎥",
    domestic: true,
    bookmarkCount: 160,
    likes: 0,
    collected: false,
  },
  {
    name: "Vidu",
    category: "AI视频",
    description: "生数科技推出的 AI 视频生成工具，主打高一致性角色动效，支持参考图生视频。",
    url: "https://www.vidu.cn",
    emoji: "📹",
    domestic: true,
    bookmarkCount: 150,
    likes: 0,
    collected: false,
  },
  {
    name: "文心一格",
    category: "AI绘画",
    description: "百度 AI 绘画平台，支持中国风、插画、写实等多种风格，深度理解中文描述。",
    url: "https://yige.baidu.com",
    emoji: "🖌️",
    domestic: true,
    bookmarkCount: 140,
    likes: 0,
    collected: false,
  },
  {
    name: "通义灵码",
    category: "AI编程",
    description: "阿里云推出的 AI 编程助手，支持 VS Code / JetBrains，提供代码补全与代码解释。",
    url: "https://tongyi.aliyun.com/lingma",
    emoji: "⚡",
    domestic: true,
    bookmarkCount: 130,
    likes: 0,
    collected: false,
  },
  // ── 海外工具 ──────────────────────────────────────────────
  {
    name: "ChatGPT",
    category: "AI对话",
    description: "OpenAI 推出的对话式 AI，是全球使用最广泛的大语言模型，支持多模态输入输出。",
    url: "https://chat.openai.com",
    emoji: "💡",
    domestic: false,
    bookmarkCount: 300,
    likes: 0,
    collected: false,
  },
  {
    name: "Midjourney",
    category: "AI绘画",
    description: "业界领先的AI图像生成工具，支持多种艺术风格，生成效果精美。",
    url: "https://midjourney.com",
    emoji: "🎨",
    domestic: false,
    bookmarkCount: 250,
    likes: 0,
    collected: false,
  },
  {
    name: "Claude",
    category: "AI写作",
    description: "Anthropic出品的AI助手，擅长长文本写作、分析与代码生成，安全性设计领先。",
    url: "https://claude.ai",
    emoji: "✍️",
    domestic: false,
    bookmarkCount: 220,
    likes: 0,
    collected: false,
  },
  {
    name: "Sora",
    category: "AI视频",
    description: "OpenAI 推出的文生视频模型，可生成高质量长视频，物理世界模拟能力突出。",
    url: "https://openai.com/sora",
    emoji: "🌌",
    domestic: false,
    bookmarkCount: 200,
    likes: 0,
    collected: false,
  },
  {
    name: "Runway Gen-3",
    category: "AI视频",
    description: "先进的AI视频生成与编辑平台，支持文字转视频、图片转视频。",
    url: "https://runwayml.com",
    emoji: "🎬",
    domestic: false,
    bookmarkCount: 180,
    likes: 0,
    collected: false,
  },
  {
    name: "GitHub Copilot",
    category: "AI编程",
    description: "由GitHub与OpenAI联合推出的AI编程助手，支持主流IDE，代码补全精准高效。",
    url: "https://github.com/features/copilot",
    emoji: "💻",
    domestic: false,
    bookmarkCount: 170,
    likes: 0,
    collected: false,
  },
  {
    name: "Gemini",
    category: "AI对话",
    description: "谷歌推出的多模态大语言模型，深度集成 Google 搜索与 Workspace，推理能力强。",
    url: "https://gemini.google.com",
    emoji: "♊",
    domestic: false,
    bookmarkCount: 160,
    likes: 0,
    collected: false,
  },
  {
    name: "Suno AI",
    category: "AI音乐",
    description: "输入歌词或描述即可生成完整歌曲，支持多种音乐风格，质量接近专业水准。",
    url: "https://suno.ai",
    emoji: "🎵",
    domestic: false,
    bookmarkCount: 155,
    likes: 0,
    collected: false,
  },
  {
    name: "Udio",
    category: "AI音乐",
    description: "高质量AI音乐创作平台，生成的音乐具有极强的真实感，支持多轨编辑。",
    url: "https://udio.com",
    emoji: "🎶",
    domestic: false,
    bookmarkCount: 140,
    likes: 0,
    collected: false,
  },
  {
    name: "Stable Diffusion",
    category: "AI绘画",
    description: "开源AI绘画模型，可本地部署，高度可定制，支持ControlNet等扩展。",
    url: "https://stability.ai",
    emoji: "🖼️",
    domestic: false,
    bookmarkCount: 130,
    likes: 0,
    collected: false,
  },
  {
    name: "Webtoon AI",
    category: "AI漫剧",
    description: "专为漫画创作设计的AI工具，可生成连贯的漫画分镜与对话气泡，风格多样。",
    url: "https://www.webtoons.com",
    emoji: "📖",
    domestic: false,
    bookmarkCount: 80,
    likes: 0,
    collected: false,
  },
];

export default function ToolsPage() {
  const { isGuest, authFetch } = useAuth();
  const [selected, setSelected] = useState("全部");
  const [likes, setLikes] = useState<{ [key: string]: number }>(
    Object.fromEntries(tools.map((t) => [t.name, t.likes]))
  );
  const [collected, setCollected] = useState<{ [key: string]: boolean }>(
    Object.fromEntries(tools.map((t) => [t.name, false]))
  );

  const loadBookmarks = useCallback(async () => {
    if (isGuest) return;
    try {
      const res = await authFetch("/api/bookmarks");
      const data = await res.json();
      if (Array.isArray(data)) {
        const toolBookmarks = new Set(data.filter((b: any) => b.itemType === "tool").map((b: any) => b.itemId as string));
        setCollected(Object.fromEntries(tools.map((t) => [t.name, toolBookmarks.has(t.name)])));
      }
    } catch {}
  }, [isGuest, authFetch]);

  useEffect(() => { loadBookmarks(); }, [loadBookmarks]);

  const filtered = selected === "全部" ? tools : tools.filter((t) => t.category === selected);
  // 国产优先，同组内按收藏量从高到低排列
  const sorted = [...filtered].sort((a, b) => {
    if (a.domestic !== b.domestic) return a.domestic ? -1 : 1;
    return b.bookmarkCount - a.bookmarkCount;
  });

  const toggleLike = (name: string) => {
    setLikes((prev) => ({ ...prev, [name]: prev[name] + 1 }));
  };

  const toggleCollect = async (tool: (typeof tools)[0]) => {
    if (isGuest) return;
    const isMarked = collected[tool.name];
    setCollected((prev) => ({ ...prev, [tool.name]: !isMarked }));
    try {
      if (isMarked) {
        await authFetch(`/api/bookmarks/${encodeURIComponent(tool.name)}?type=tool`, { method: "DELETE" });
      } else {
        await authFetch("/api/bookmarks", { method: "POST", body: JSON.stringify({
          itemId: tool.name, itemType: "tool", title: tool.name,
          subtitle: tool.category, url: tool.url, emoji: tool.emoji,
        })});
      }
    } catch {
      setCollected((prev) => ({ ...prev, [tool.name]: isMarked }));
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h1 className="text-2xl font-bold text-gray-900">AI 工具推荐</h1>
          <span className="text-xs text-gray-400 bg-gray-100 px-3 py-1 rounded-full">每月更新 · 最近更新：2026年3月</span>
        </div>
        <p className="text-gray-500 mt-1">精选国内外实用 AI 工具，国产优先 · 按收藏量排列</p>
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

      {/* 工具列表 */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {sorted.map((tool) => (
          <div key={tool.name} className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow flex flex-col">
            <div className="flex items-start gap-3 mb-3">
              <div className="text-3xl">{tool.emoji}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-semibold text-gray-900">{tool.name}</h3>
                  {tool.domestic && (
                    <span className="text-xs px-1.5 py-0.5 bg-red-50 text-red-600 border border-red-200 rounded-full">🇨🇳 国产</span>
                  )}
                </div>
                <span className="text-xs px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full">{tool.category}</span>
              </div>
            </div>
            <p className="text-sm text-gray-500 flex-1 mb-4">{tool.description}</p>
            <div className="flex items-center justify-between">
              <a
                href={tool.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-600 hover:underline"
              >
                访问工具 →
              </a>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => toggleCollect(tool)}
                  className={`text-sm px-2 py-1 rounded-lg transition-colors ${
                    collected[tool.name]
                      ? "text-yellow-500"
                      : "text-gray-400 hover:text-yellow-500"
                  }`}
                  title="收藏"
                  disabled={isGuest}
                >
                  {collected[tool.name] ? "★" : "☆"}
                </button>
                <button
                  onClick={() => toggleLike(tool.name)}
                  className="flex items-center gap-1 text-sm text-gray-400 hover:text-red-500 transition-colors px-2 py-1 rounded-lg"
                >
                  👍 {likes[tool.name]}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
