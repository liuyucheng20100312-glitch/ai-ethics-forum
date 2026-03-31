/**
 * 初始化智能交互机器人用户认知与态度调查问卷
 * 运行: npx ts-node scripts/init-robot-survey.ts
 */

import { MongoClient } from "mongodb";

const MONGODB_URI = process.env.MONGODB_URI || "";

const surveyData = {
  title: "智能交互机器人用户认知与态度调查问卷",
  titleEn: "Survey on User Cognition and Attitude toward Intelligent Interactive Robots",
  description: `尊敬的调查对象：

您好！本次调查旨在了解用户对智能交互机器人的认知与态度，重点关注人机交互、拟人感知、使用行为与心理影响等方面。

当前，人形机器人、虚拟人等具备实体/形象的AI产品逐渐走进人们的生活，成为部分人获取信息、情感陪伴的选择。本次调查采用匿名形式，所有答案仅用于学术研究，严格保护您的个人隐私，请您根据自身真实情况如实作答，感谢您的支持与配合！`,
  descriptionEn: `Dear Participant,

Hello! This survey aims to understand users' cognition and attitudes toward intelligent interactive robots, focusing on human-robot interaction, anthropomorphic perception, usage behavior, and psychological impact.

Currently, AI products with physical/virtual forms such as humanoid robots and virtual humans are increasingly becoming part of people's lives. This survey is anonymous and all responses are used solely for academic research. Thank you for your participation!`,
  questions: [
    // 一、基本信息
    { index: 0, text: "你的性别", textEn: "Your gender", type: "single", section: "一、基本信息", options: ["A 男", "B 女", "C 其他", "D 不愿透露"], optionsEn: ["A Male", "B Female", "C Other", "D Prefer not to say"], required: true },
    { index: 1, text: "你的年龄", textEn: "Your age", type: "single", section: "一、基本信息", options: ["A 15–17岁", "B 18–22岁", "C 23–29岁", "D 30岁以上"], optionsEn: ["A 15-17 years", "B 18-22 years", "C 23-29 years", "D 30+ years"], required: true },
    { index: 2, text: "你的学历", textEn: "Your education level", type: "single", section: "一、基本信息", options: ["A 高中及以下", "B 专科", "C 本科", "D 硕士及以上"], optionsEn: ["A High school or below", "B Associate degree", "C Bachelor's degree", "D Master's degree or above"], required: true },
    { index: 3, text: "你是否接触过人形机器人、虚拟人等具备实体/形象的AI产品", textEn: "Have you used AI products with physical/virtual forms such as humanoid robots or virtual humans", type: "single", section: "一、基本信息", options: ["A 经常使用", "B 偶尔使用", "C 听说过但未用过", "D 完全不了解"], optionsEn: ["A Frequently", "B Occasionally", "C Heard of but never used", "D Completely unaware"], required: true },

    // 二、交互与拟人感知
    { index: 4, text: "机器人的外在形态、声音、表情等，会影响你对它的信任程度吗？", textEn: "Do the robot's appearance, voice, and expressions affect your trust in it?", type: "single", section: "二、交互与拟人感知", options: ["A 影响很大", "B 有一定影响", "C 影响较小", "D 基本无影响"], optionsEn: ["A Significant impact", "B Some impact", "C Minor impact", "D Almost no impact"], required: true },
    { index: 5, text: "长期与机器人互动后，你是否可能将其当作日常倾诉对象？", textEn: "After long-term interaction with robots, might you consider them as daily confidants?", type: "single", section: "二、交互与拟人感知", options: ["A 非常可能", "B 有可能", "C 不太可能", "D 不可能"], optionsEn: ["A Very likely", "B Possible", "C Unlikely", "D Impossible"], required: true },
    { index: 6, text: "你能稳定区分机器人的情感表达与真实人类情感吗？", textEn: "Can you consistently distinguish between robot emotional expressions and real human emotions?", type: "single", section: "二、交互与拟人感知", options: ["A 完全可以", "B 基本可以", "C 偶尔混淆", "D 经常难以区分"], optionsEn: ["A Completely", "B Mostly", "C Occasionally confused", "D Often difficult to distinguish"], required: true },
    { index: 7, text: "机器人对你的情绪、偏好越了解，你会更愿意与其互动吗？", textEn: "The better a robot understands your emotions and preferences, would you be more willing to interact with it?", type: "single", section: "二、交互与拟人感知", options: ["A 一定会", "B 可能会", "C 不一定", "D 不会"], optionsEn: ["A Definitely", "B Possibly", "C Not necessarily", "D No"], required: true },
    { index: 8, text: "机器人的回应越贴合你的情绪，你越容易产生依赖感吗？", textEn: "The more a robot's responses match your emotions, the easier it is to develop dependence?", type: "single", section: "二、交互与拟人感知", options: ["A 非常容易", "B 比较容易", "C 不太容易", "D 不会"], optionsEn: ["A Very easy", "B Fairly easy", "C Not very easy", "D No"], required: true },
    { index: 9, text: "你是否在意机器人是否明确表明自己'非人类'身份？", textEn: "Do you care whether robots clearly identify themselves as 'non-human'?", type: "single", section: "二、交互与拟人感知", options: ["A 非常在意", "B 比较在意", "C 不太在意", "D 不在意"], optionsEn: ["A Very much", "B Somewhat", "C Not much", "D No"], required: true },
    { index: 10, text: "你认为机器人越拟人，整体使用体验就越好吗？", textEn: "Do you think the more anthropomorphic a robot is, the better the overall user experience?", type: "single", section: "二、交互与拟人感知", options: ["A 一定是", "B 可能是", "C 不一定", "D 不是"], optionsEn: ["A Definitely", "B Possibly", "C Not necessarily", "D No"], required: true },

    // 三、使用行为与心理影响
    { index: 11, text: "你愿意向机器人倾诉学习、生活中的压力与负面情绪吗？", textEn: "Are you willing to confide in robots about stress and negative emotions in study or life?", type: "single", section: "三、使用行为与心理影响", options: ["A 非常愿意", "B 愿意", "C 不太愿意", "D 完全不愿意"], optionsEn: ["A Very willing", "B Willing", "C Not very willing", "D Completely unwilling"], required: true },
    { index: 12, text: "你认为长期与机器人互动，可能降低现实社交的意愿吗？", textEn: "Do you think long-term interaction with robots might reduce willingness for real social interaction?", type: "single", section: "三、使用行为与心理影响", options: ["A 一定会", "B 可能会", "C 不一定", "D 不会"], optionsEn: ["A Definitely", "B Possibly", "C Not necessarily", "D No"], required: true },
    { index: 13, text: "机器人收集你的表情、语气、动作等信息，你认为存在风险吗？", textEn: "Do you think there are risks when robots collect your expressions, tone, and movements?", type: "single", section: "三、使用行为与心理影响", options: ["A 风险很高", "B 有一定风险", "C 风险较低", "D 几乎无风险"], optionsEn: ["A Very high risk", "B Some risk", "C Low risk", "D Almost no risk"], required: true },
    { index: 14, text: "如果机器人总是顺着你的想法回应，你会感到更安心吗？", textEn: "If a robot always responds in line with your thoughts, would you feel more secure?", type: "single", section: "三、使用行为与心理影响", options: ["A 一定会", "B 可能会", "C 不一定", "D 不会"], optionsEn: ["A Definitely", "B Possibly", "C Not necessarily", "D No"], required: true },
    { index: 15, text: "当机器人出现错误或不当回应时，你认为主要责任在于？", textEn: "When a robot makes errors or inappropriate responses, who do you think is primarily responsible?", type: "single", section: "三、使用行为与心理影响", options: ["A 开发者与设计者", "B 使用者", "C 平台运营方", "D 难以简单判定"], optionsEn: ["A Developers and designers", "B Users", "C Platform operators", "D Difficult to determine"], required: true },
    { index: 16, text: "你是否希望机器人可以拒绝你某些不合理或情绪化的请求？", textEn: "Do you want robots to be able to refuse some of your unreasonable or emotional requests?", type: "single", section: "三、使用行为与心理影响", options: ["A 非常希望", "B 希望", "C 不太希望", "D 不希望"], optionsEn: ["A Very much", "B Yes", "C Not really", "D No"], required: true },
    { index: 17, text: "你更希望机器人满足你哪一类需求？", textEn: "What type of needs do you prefer robots to satisfy?", type: "single", section: "三、使用行为与心理影响", options: ["A 实用辅助", "B 情绪安慰", "C 陪伴聊天", "D 娱乐互动"], optionsEn: ["A Practical assistance", "B Emotional comfort", "C Companionship chat", "D Entertainment interaction"], required: true },
    { index: 18, text: "你是否希望自己与机器人的对话记录可以随时删除、不可恢复？", textEn: "Do you want to be able to delete your conversation records with robots at any time, unrecoverably?", type: "single", section: "三、使用行为与心理影响", options: ["A 非常希望", "B 希望", "C 不太希望", "D 不希望"], optionsEn: ["A Very much", "B Yes", "C Not really", "D No"], required: true },
    { index: 19, text: "你认为过度依赖机器人，对个人心理与成长会是？", textEn: "What do you think over-dependence on robots means for personal psychology and growth?", type: "single", section: "三、使用行为与心理影响", options: ["A 明显不利", "B 可能不利", "C 不一定", "D 没有影响"], optionsEn: ["A Clearly harmful", "B Possibly harmful", "C Uncertain", "D No effect"], required: true },
    { index: 20, text: "机器人持续记住你的习惯与偏好，会增强你的安全感吗？", textEn: "Does a robot continuously remembering your habits and preferences enhance your sense of security?", type: "single", section: "三、使用行为与心理影响", options: ["A 一定会", "B 可能会", "C 不一定", "D 不会"], optionsEn: ["A Definitely", "B Possibly", "C Not necessarily", "D No"], required: true },

    // 四、设计偏好与总体态度
    { index: 21, text: "你更希望机器人定位为？", textEn: "What role do you prefer robots to be positioned as?", type: "single", section: "四、设计偏好与总体态度", options: ["A 高效工具", "B 温和陪伴者", "C 协作者", "D 引导者"], optionsEn: ["A Efficient tool", "B Gentle companion", "C Collaborator", "D Guide"], required: true },
    { index: 22, text: "你认为机器人的回应风格应更偏向？", textEn: "What response style do you think robots should lean toward?", type: "single", section: "四、设计偏好与总体态度", options: ["A 真实直接", "B 温和委婉", "C 实用高效", "D 保持中立"], optionsEn: ["A Honest and direct", "B Gentle and tactful", "C Practical and efficient", "D Remain neutral"], required: true },
    { index: 23, text: "你支持对机器人产品设立明确的设计与使用规范吗？", textEn: "Do you support establishing clear design and usage standards for robot products?", type: "single", section: "四、设计偏好与总体态度", options: ["A 强烈支持", "B 支持", "C 中立", "D 不支持"], optionsEn: ["A Strongly support", "B Support", "C Neutral", "D Do not support"], required: true },
    { index: 24, text: "你认为机器人的拟人化程度需要被合理限制吗？", textEn: "Do you think the degree of anthropomorphism in robots needs to be reasonably limited?", type: "single", section: "四、设计偏好与总体态度", options: ["A 需要严格限制", "B 适度限制", "C 无需限制", "D 无所谓"], optionsEn: ["A Strictly limited", "B Moderately limited", "C No limit needed", "D Doesn't matter"], required: true },
    { index: 25, text: "你对个人数据在机器人系统中的使用态度是？", textEn: "What is your attitude toward the use of personal data in robot systems?", type: "single", section: "四、设计偏好与总体态度", options: ["A 非常谨慎", "B 比较谨慎", "C 不太在意", "D 较为放心"], optionsEn: ["A Very cautious", "B Somewhat cautious", "C Not very concerned", "D Fairly comfortable"], required: true },
    { index: 26, text: "未来人与机器人的关系，你更倾向于？", textEn: "For the future human-robot relationship, what do you lean toward?", type: "single", section: "四、设计偏好与总体态度", options: ["A 紧密融合", "B 适度共存", "C 保持距离", "D 不确定"], optionsEn: ["A Close integration", "B Moderate coexistence", "C Keep distance", "D Uncertain"], required: true },
    { index: 27, text: "使用机器人时，你最看重的是？", textEn: "What do you value most when using robots?", type: "single", section: "四、设计偏好与总体态度", options: ["A 功能稳定", "B 隐私安全", "C 体验舒适", "D 交互自然"], optionsEn: ["A Functional stability", "B Privacy security", "C Comfortable experience", "D Natural interaction"], required: true },
    { index: 28, text: "你是否希望机器人不刻意引导、不操控你的情绪与判断？", textEn: "Do you want robots not to deliberately guide or manipulate your emotions and judgments?", type: "single", section: "四、设计偏好与总体态度", options: ["A 非常希望", "B 希望", "C 不太希望", "D 不希望"], optionsEn: ["A Very much", "B Yes", "C Not really", "D No"], required: true },
    { index: 29, text: "整体而言，你对人形/高交互机器人的态度是？", textEn: "Overall, what is your attitude toward humanoid/highly interactive robots?", type: "single", section: "四、设计偏好与总体态度", options: ["A 积极支持", "B 谨慎乐观", "C 保持观望", "D 有所担忧"], optionsEn: ["A Actively supportive", "B Cautiously optimistic", "C Wait and see", "D Somewhat concerned"], required: true },
  ],
  sections: [
    { title: "一、基本信息", titleEn: "Part 1: Basic Information" },
    { title: "二、交互与拟人感知", titleEn: "Part 2: Interaction and Anthropomorphic Perception" },
    { title: "三、使用行为与心理影响", titleEn: "Part 3: Usage Behavior and Psychological Impact" },
    { title: "四、设计偏好与总体态度", titleEn: "Part 4: Design Preferences and Overall Attitude" },
  ],
  author: "admin",
  authorId: "offline_admin",
  status: "published",
  isVisible: true,
  responseCount: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
  publishedAt: new Date(),
};

async function main() {
  if (!MONGODB_URI) {
    console.error("请设置 MONGODB_URI 环境变量");
    process.exit(1);
  }

  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    console.log("已连接到MongoDB");

    const db = client.db("ai-ethics-forum");

    // 检查是否已存在
    const existing = await db.collection("surveys").findOne({ title: surveyData.title });
    if (existing) {
      console.log("问卷已存在，跳过初始化");
      return;
    }

    // 插入问卷
    const result = await db.collection("surveys").insertOne(surveyData);
    console.log(`✅ 问卷已成功创建，ID: ${result.insertedId}`);
  } catch (error) {
    console.error("初始化失败:", error);
    process.exit(1);
  } finally {
    await client.close();
    console.log("数据库连接已关闭");
  }
}

main();
