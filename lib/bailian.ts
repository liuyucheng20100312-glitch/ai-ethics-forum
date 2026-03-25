/**
 * 阿里云百炼AI服务封装
 * 文档: https://help.aliyun.com/document_detail/2712195.html
 */

interface BailianResponse {
  output?: {
    text?: string;
    finish_reason?: string;
  };
  code?: string;
  message?: string;
}

interface SurveyAnswer {
  questionIndex: number;
  question: string;
  answer: string;
  answerOption?: string;
}

interface SurveyAnalysis {
  summary: string;
  insights: string[];
  suggestions: string[];
}

/**
 * 调用阿里云百炼大模型进行文本分析
 */
export async function callBailianAI(prompt: string): Promise<string> {
  const apiKey = process.env.ALIBABA_BAILIAN_API_KEY;
  const modelId = process.env.ALIBABA_BAILIAN_MODEL_ID || "qwen-plus";

  if (!apiKey) {
    console.warn("阿里云百炼API密钥未配置，跳过AI分析");
    return "";
  }

  const apiUrl = "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions";

  try {
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
            content: "你是一位专业的心理健康研究员，专注于AI情感陪伴对青少年成长影响的研究。请用简洁、专业的语言分析问卷数据，给出有洞察力的结论和建议。",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        max_tokens: 2000,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("百炼API调用失败:", response.status, errorText);
      return "";
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || "";
  } catch (error) {
    console.error("百炼API调用异常:", error);
    return "";
  }
}

/**
 * 分析问卷答案，生成个性化反馈
 */
export async function analyzeSurveyAnswers(
  surveyTitle: string,
  answers: SurveyAnswer[]
): Promise<SurveyAnalysis> {
  // 构建分析提示词
  const answersText = answers
    .map((a, i) => `${i + 1}. ${a.question}\n   回答: ${a.answer}${a.answerOption ? ` (${a.answerOption})` : ""}`)
    .join("\n\n");

  const prompt = `请分析以下问卷回答，问卷主题是"${surveyTitle}"。

问卷回答：
${answersText}

请从以下几个方面进行分析：
1. 总体评价：对回答者整体认知和态度的简要评价（100字以内）
2. 关键洞察：从回答中发现的关键信息点（3-5个要点）
3. 建议：基于回答给出的个性化建议（2-3条）

请以JSON格式返回，格式如下：
{
  "summary": "总体评价...",
  "insights": ["洞察1", "洞察2", "洞察3"],
  "suggestions": ["建议1", "建议2"]
}`;

  const aiResponse = await callBailianAI(prompt);

  if (!aiResponse) {
    return {
      summary: "感谢您的参与！您的回答已记录。",
      insights: [],
      suggestions: [],
    };
  }

  try {
    // 尝试解析JSON
    const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (e) {
    console.error("解析AI响应失败:", e);
  }

  // 如果解析失败，返回原始文本作为summary
  return {
    summary: aiResponse.slice(0, 500),
    insights: [],
    suggestions: [],
  };
}

/**
 * 分析问卷整体统计数据
 */
export async function analyzeSurveyStatistics(
  surveyTitle: string,
  questions: { index: number; text: string; options: string[] }[],
  statistics: { optionCounts: Record<string, number>; total: number }[]
): Promise<string> {
  const statsText = statistics
    .map((stat, i) => {
      const q = questions[i];
      const optionsText = Object.entries(stat.optionCounts)
        .map(([opt, count]) => `  - ${opt}: ${count}票 (${Math.round((count / stat.total) * 100) || 0}%)`)
        .join("\n");
      return `${i + 1}. ${q.text}\n${optionsText}`;
    })
    .join("\n\n");

  const prompt = `请分析以下问卷的统计结果，问卷主题是"${surveyTitle}"。

统计数据：
${statsText}

请给出：
1. 整体数据解读（150字以内）
2. 发现的主要趋势或模式（3个要点）
3. 对青少年的启示和建议（2条）

请用简洁专业的语言回答。`;

  return await callBailianAI(prompt);
}
