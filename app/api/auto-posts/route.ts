import { connectToDatabase } from "@/lib/mongodb";
import { NextRequest, NextResponse } from "next/server";

// AI角色配置
const AI_AUTHORS = [
  { name: "学生探索者", nameEn: "Student Explorer", role: "对AI充满好奇心的高中生，善于提问和思考" },
  { name: "AI观察者", nameEn: "AI Observer", role: "关注AI发展的观察员，善于分析行业动态" },
  { name: "伦理思考者", nameEn: "Ethics Thinker", role: "专注AI伦理研究的学者，善于分析道德困境" },
  { name: "科技评论员", nameEn: "Tech Commentator", role: "资深科技媒体人，善于解读技术影响" },
];

// 分类配置
const CATEGORIES = [
  { value: "AI安全", topics: ["AI越狱攻击", "提示词注入", "模型安全漏洞", "对抗性攻击", "AI系统防护"] },
  { value: "隐私保护", topics: ["数据泄露", "人脸识别隐私", "训练数据版权", "个人隐私边界", "AI监控"] },
  { value: "伦理责任", topics: ["AI决策责任", "算法偏见", "自动驾驶伦理", "AI问责机制", "人类监督权"] },
  { value: "学术讨论", topics: ["AI论文解读", "前沿研究", "模型架构创新", "训练方法优化", "评估标准"] },
  { value: "社会影响", topics: ["就业冲击", "教育变革", "医疗应用", "信息茧房", "AI与民主"] },
  { value: "创意想法", topics: ["AI辅助创作", "人机协作", "未来应用场景", "创新工具", "AI艺术"] },
];

/**
 * 调用阿里云百炼生成帖子
 */
async function generatePostWithBailian(category: string, topic: string, author: { name: string; nameEn: string; role: string }) {
  const apiKey = process.env.ALIBABA_BAILIAN_API_KEY;
  const modelId = process.env.ALIBABA_BAILIAN_MODEL_ID || "qwen-plus";

  if (!apiKey) {
    throw new Error("阿里云百炼API密钥未配置");
  }

  const apiUrl = "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions";

  const prompt = `你现在是"${author.name}"（${author.role}），请在"${category}"分类下，围绕"${topic}"主题，创作一篇AI伦理相关的讨论帖子。

要求：
1. 标题要吸引人，能引发思考
2. 内容要有深度，包含具体案例或场景
3. 要有明确的观点，能引发读者讨论
4. 内容要符合高中生的认知水平，但不能太幼稚
5. 字数控制在300-500字

请以JSON格式返回：
{
  "title": "中文标题",
  "titleEn": "English Title",
  "content": "中文内容...",
  "contentEn": "English content..."
}`;

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: modelId,
      messages: [
        {
          role: "system",
          content: `你是一位AI伦理论坛的内容创作者，擅长撰写引人深思的讨论帖子。你需要扮演"${author.name}"这个角色：${author.role}。请用专业但易懂的语言，创作符合高中生水平的AI伦理讨论内容。`,
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
    throw new Error(`百炼API调用失败: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || "";

  // 解析JSON
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (e) {
    console.error("解析AI响应失败:", e);
  }

  // 如果解析失败，尝试提取内容
  return {
    title: `${category}：${topic}的思考`,
    titleEn: `Thoughts on ${topic} in ${category}`,
    content: content.slice(0, 500),
    contentEn: "",
  };
}

/**
 * GET: 手动触发生成AI帖子（需要管理员权限）
 */
export async function GET(request: NextRequest) {
  try {
    // 验证管理员权限（简单的token验证）
    // 如果设置了ADMIN_TOKEN，则需要验证；否则允许访问（开发环境）
    const authHeader = request.headers.get("authorization");
    const adminToken = process.env.ADMIN_TOKEN;

    if (adminToken && authHeader !== `Bearer ${adminToken}`) {
      return NextResponse.json({ error: "未授权访问" }, { status: 401 });
    }

    const { db } = await connectToDatabase();
    const generatedPosts: any[] = [];
    const errors: string[] = [];

    // 为每个分类生成2条帖子
    for (const category of CATEGORIES) {
      // 随机选择2个不同的主题
      const shuffledTopics = [...category.topics].sort(() => Math.random() - 0.5);
      const selectedTopics = shuffledTopics.slice(0, 2);

      for (const topic of selectedTopics) {
        try {
          // 随机选择一个AI作者
          const author = AI_AUTHORS[Math.floor(Math.random() * AI_AUTHORS.length)];

          // 调用百炼生成帖子
          const postContent = await generatePostWithBailian(category.value, topic, author);

          // 插入数据库
          const newPost = {
            title: postContent.title,
            titleEn: postContent.titleEn || "",
            author: author.name,
            authorEn: author.nameEn,
            category: category.value,
            content: postContent.content,
            contentEn: postContent.contentEn || "",
            replies: 0,
            status: "approved", // AI生成的帖子自动审核通过
            isAIGenerated: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          };

          const result = await db.collection("posts").insertOne(newPost);
          generatedPosts.push({
            _id: result.insertedId,
            title: newPost.title,
            category: newPost.category,
            author: newPost.author,
          });

          // 添加延迟避免API限流
          await new Promise((resolve) => setTimeout(resolve, 1000));
        } catch (error: any) {
          errors.push(`${category.value} - ${topic}: ${error.message}`);
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: `成功生成 ${generatedPosts.length} 条帖子`,
      generated: generatedPosts,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error: any) {
    console.error("生成AI帖子失败:", error);
    return NextResponse.json(
      { error: "生成AI帖子失败", details: error.message },
      { status: 500 }
    );
  }
}
