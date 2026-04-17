/**
 * Weekly AI post scheduler managed by PM2.
 *
 * The script loads Next.js environment files itself because it runs outside of
 * `next start`. Use `--run-now` to generate one batch immediately and exit.
 */

import { loadEnvConfig } from "@next/env";
import cron from "node-cron";
import { MongoClient } from "mongodb";

loadEnvConfig(process.cwd());

type AiAuthor = {
  name: string;
  nameEn: string;
  role: string;
};

type GeneratedPost = {
  title?: string;
  titleEn?: string;
  content?: string;
  contentEn?: string;
};

const MONGODB_URI = process.env.MONGODB_URI || "";
const MONGODB_DB = process.env.MONGODB_DB || "ai-ethics-forum";
const BAILIAN_API_KEY = process.env.ALIBABA_BAILIAN_API_KEY || process.env.DASHSCOPE_API_KEY || "";
const BAILIAN_MODEL_ID = process.env.ALIBABA_BAILIAN_MODEL_ID || "qwen-plus";
const SCHEDULE = "0 9 * * 1";
const TIMEZONE = "Asia/Shanghai";

const AI_AUTHORS: AiAuthor[] = [
  {
    name: "学生探索者",
    nameEn: "Student Explorer",
    role: "对 AI 充满好奇心的高中生，善于提出问题和思考现实影响",
  },
  {
    name: "AI 观察者",
    nameEn: "AI Observer",
    role: "关注 AI 发展的观察员，善于分析行业动态和社会变化",
  },
  {
    name: "伦理思考者",
    nameEn: "Ethics Thinker",
    role: "专注 AI 伦理研究的学习者，善于分析道德困境",
  },
  {
    name: "科技评论员",
    nameEn: "Tech Commentator",
    role: "资深科技媒体评论员，善于解读技术影响",
  },
];

const CATEGORIES = [
  {
    value: "AI安全",
    topics: ["提示词注入", "模型安全漏洞", "对抗性攻击", "AI 系统防护", "深度伪造风险"],
  },
  {
    value: "隐私保护",
    topics: ["数据泄露", "人脸识别隐私", "训练数据版权", "个人隐私边界", "AI 监控"],
  },
  {
    value: "伦理责任",
    topics: ["AI 决策责任", "算法偏见", "自动驾驶伦理", "AI 问责机制", "人类监督权"],
  },
  {
    value: "学术讨论",
    topics: ["AI 论文解读", "前沿研究", "模型架构创新", "训练方法优化", "评估标准"],
  },
  {
    value: "社会影响",
    topics: ["就业冲击", "教育变革", "医疗应用", "信息茧房", "AI 与民主"],
  },
  {
    value: "创意想法",
    topics: ["AI 辅助创作", "人机协作", "未来应用场景", "创新工具", "AI 艺术"],
  },
];

function pickRandom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function extractJson(content: string): GeneratedPost | null {
  const cleaned = content.replace(/```json|```/g, "").trim();
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);

  if (!jsonMatch) {
    return null;
  }

  try {
    return JSON.parse(jsonMatch[0]) as GeneratedPost;
  } catch (error) {
    console.error("解析 AI 响应失败:", error);
    return null;
  }
}

async function generatePostWithBailian(category: string, topic: string, author: AiAuthor): Promise<GeneratedPost> {
  if (!BAILIAN_API_KEY) {
    throw new Error("ALIBABA_BAILIAN_API_KEY 或 DASHSCOPE_API_KEY 未配置");
  }

  const prompt = `你现在是“${author.name}”（${author.role}），请在“${category}”分类下，围绕“${topic}”主题，创作一篇 AI 伦理相关的论坛讨论帖。

要求：
1. 标题要能引发高中生讨论。
2. 内容要有具体案例或场景，观点清晰。
3. 语言适合高中生阅读，但不要过于幼稚。
4. 中文内容控制在 300-500 字。
5. 只返回 JSON，不要返回 Markdown。

JSON 格式：
{
  "title": "中文标题",
  "titleEn": "English Title",
  "content": "中文内容",
  "contentEn": "English content"
}`;

  const response = await fetch("https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${BAILIAN_API_KEY}`,
    },
    body: JSON.stringify({
      model: BAILIAN_MODEL_ID,
      messages: [
        {
          role: "system",
          content: `你是 AI 伦理论坛的内容创作者。请扮演“${author.name}”：${author.role}。输出必须是可解析 JSON。`,
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      max_tokens: 1500,
      temperature: 0.8,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`百炼 API 调用失败: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || "";
  const parsed = extractJson(content);

  return parsed || {
    title: `${category}: 关于${topic}的思考`,
    titleEn: `Thoughts on ${topic}`,
    content: content.slice(0, 500),
    contentEn: "",
  };
}

async function generatePosts(): Promise<void> {
  console.log(`[${new Date().toISOString()}] 开始生成 AI 帖子...`);

  if (!MONGODB_URI) {
    console.error("MONGODB_URI 未配置，无法写入帖子");
    return;
  }

  const client = new MongoClient(MONGODB_URI, {
    serverSelectionTimeoutMS: 10000,
    connectTimeoutMS: 10000,
  });

  try {
    await client.connect();
    const db = client.db(MONGODB_DB);
    const generatedPosts: string[] = [];
    const errors: string[] = [];

    for (const category of CATEGORIES) {
      const selectedTopics = [...category.topics].sort(() => Math.random() - 0.5).slice(0, 2);

      for (const topic of selectedTopics) {
        try {
          const author = pickRandom(AI_AUTHORS);
          const postContent = await generatePostWithBailian(category.value, topic, author);

          const newPost = {
            title: postContent.title || `${category.value}: ${topic}`,
            titleEn: postContent.titleEn || "",
            author: author.name,
            authorEn: author.nameEn,
            category: category.value,
            content: postContent.content || "",
            contentEn: postContent.contentEn || "",
            replies: 0,
            status: "approved",
            isAIGenerated: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          };

          await db.collection("posts").insertOne(newPost);
          generatedPosts.push(`[${category.value}] ${newPost.title}`);
          console.log(`已生成: [${category.value}] ${newPost.title} (${author.name})`);

          await new Promise((resolve) => setTimeout(resolve, 1000));
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const errorMessage = `${category.value} - ${topic}: ${message}`;
          errors.push(errorMessage);
          console.error(`生成失败: ${errorMessage}`);
        }
      }
    }

    console.log(`[${new Date().toISOString()}] 生成完成，成功 ${generatedPosts.length} 条，失败 ${errors.length} 条`);
    if (errors.length > 0) {
      console.log("失败详情:", errors);
    }
  } catch (error) {
    console.error("生成帖子任务失败:", error);
  } finally {
    await client.close();
  }
}

function startScheduler(): void {
  console.log("=".repeat(50));
  console.log("AI 帖子定时生成服务启动");
  console.log(`定时规则: 每周一 09:00 (${TIMEZONE})`);
  console.log(`数据库: ${MONGODB_DB}`);
  console.log(`模型: ${BAILIAN_MODEL_ID}`);
  console.log("=".repeat(50));

  cron.schedule(
    SCHEDULE,
    () => {
      void generatePosts();
    },
    {
      timezone: TIMEZONE,
    },
  );

  console.log("定时任务已注册，等待执行。可使用 --run-now 手动生成一次。");
}

if (process.argv.includes("--run-now") || process.argv.includes("--once")) {
  generatePosts()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error("手动生成失败:", error);
      process.exit(1);
    });
} else {
  startScheduler();
}

process.on("SIGINT", () => {
  console.log("\n收到退出信号，正在停止...");
  process.exit(0);
});

process.on("unhandledRejection", (error) => {
  console.error("未处理的 Promise 异常:", error);
});
