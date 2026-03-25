/**
 * 初始化AI情感陪伴对青少年成长影响调查问卷
 * 运行: npx ts-node scripts/init-survey.ts
 */

import { MongoClient } from "mongodb";

const MONGODB_URI = process.env.MONGODB_URI || "";

const surveyData = {
  title: "AI情感机器陪伴对青少年成长影响调查问卷",
  titleEn: "Survey on the Impact of AI Emotional Companionship on Adolescent Development",
  description: `尊敬的调查对象：

您好！本次调查旨在探究AI情感机器陪伴对青少年成长的影响，重点关注AI情感的本质、应用场景与青少年心理健康的关联，欢迎青少年及关注该话题的成年人参与。

当前，青少年面临着学业压力、社交焦虑、情感倾诉渠道不足等心理健康问题，AI情感陪伴机器人、虚拟伴侣等产品逐渐走进青少年的生活，成为部分人缓解孤独、倾诉烦恼的选择。本次调查采用匿名形式，所有答案仅用于学术研究，严格保护您的个人隐私，无论您是青少年还是关注该话题的成年人，均请根据自身真实情况、真实认知如实作答，感谢您的支持与配合！`,
  descriptionEn: `Dear Participant,

Hello! This survey aims to explore the impact of AI emotional companionship on adolescent development, focusing on the nature of AI emotions, application scenarios, and their relationship with adolescent mental health.

Currently, adolescents face mental health challenges such as academic pressure, social anxiety, and insufficient emotional outlets. AI emotional companion robots and virtual partners are increasingly becoming part of teenagers' lives. This survey is anonymous and all responses are used solely for academic research. Thank you for your participation!`,
  questions: [
    // 一、基本信息
    { index: 0, text: "您的性别：", textEn: "Your gender:", type: "single", section: "一、基本信息", options: ["A.男", "B.女", "C.其他", "D.不愿透露"], optionsEn: ["A. Male", "B. Female", "C. Other", "D. Prefer not to say"], required: true },
    { index: 1, text: "您的年龄：", textEn: "Your age:", type: "single", section: "一、基本信息", options: ["A.12-14岁（初中生）", "B.15-17岁（高中生）", "C.18岁（准大学生）", "D.其他青少年群体", "E.成年人（19岁及以上）"], optionsEn: ["A. 12-14 years (Middle school)", "B. 15-17 years (High school)", "C. 18 years (College freshman)", "D. Other adolescent groups", "E. Adult (19+ years)"], required: true },
    { index: 2, text: "您是否接触过AI情感陪伴类产品（如情感聊天机器人、虚拟伴侣、AI树洞等）？", textEn: "Have you used AI emotional companionship products (chatbots, virtual partners, AI confession rooms, etc.)?", type: "single", section: "一、基本信息", options: ["A.经常接触（每周3次及以上）", "B.偶尔接触（每月1-4次）", "C.从未接触", "D.听说过但未尝试"], optionsEn: ["A. Frequently (3+ times/week)", "B. Occasionally (1-4 times/month)", "C. Never", "D. Heard of but never tried"], required: true },

    // 二、认知层面调查
    { index: 3, text: "您认为AI情感机器所表现出的"情感"是真实存在的，还是人为建构的？", textEn: "Do you think the 'emotions' expressed by AI emotional machines are real or artificially constructed?", type: "single", section: "二、认知层面调查", options: ["A.真实存在，能感受到真诚的情感回应", "B.人为建构，只是程序模拟的虚假反应", "C.不确定，有时觉得真实，有时觉得虚假", "D.不关心其真实性，有用即可"], optionsEn: ["A. Real, can feel sincere emotional responses", "B. Artificially constructed, just programmed simulations", "C. Uncertain, sometimes real, sometimes fake", "D. Don't care, usefulness matters"], required: true },
    { index: 4, text: "您认为AI能够真正拥有情感的核心原因是什么（若认为不能，可选择D）？", textEn: "What do you think is the core reason AI can truly have emotions (choose D if you think it cannot)?", type: "single", section: "二、认知层面调查", options: ["A.程序算法模拟了人类情感表达逻辑", "B.能通过学习用户习惯，实现个性化情感回应", "C.具备类似人类的"感知能力"，能共情用户", "D.AI永远无法真正拥有情感"], optionsEn: ["A. Algorithms simulate human emotional expression logic", "B. Can learn user habits for personalized emotional responses", "C. Has human-like 'perception ability' to empathize", "D. AI can never truly have emotions"], required: true },
    { index: 5, text: "对于"AI复活技术"（通过AI还原逝者的声音、语气、思维，实现"情感陪伴"），您认为最核心的情感问题是什么？", textEn: "For 'AI resurrection technology' (using AI to recreate deceased's voice, tone, thoughts for emotional companionship), what do you think is the core emotional issue?", type: "single", section: "二、认知层面调查", options: ["A.会让用户无法走出悲伤，陷入自我欺骗", "B.还原的情感不是真实逝者的情感，是虚假的慰藉", "C.可能模糊"生死边界"，影响青少年的情感认知", "D.没有明显情感问题，是很好的情感寄托方式"], optionsEn: ["A. Users can't move on, fall into self-deception", "B. Recreated emotions aren't real, false comfort", "C. May blur 'life-death boundary', affect adolescent emotional cognition", "D. No obvious issues, good emotional support"], required: true },
    { index: 6, text: "您认为情感AI是否需要拥有实体身体（如人形机器人），才能更好地提供情感陪伴？", textEn: "Do you think emotional AI needs a physical body (like humanoid robots) to better provide emotional companionship?", type: "single", section: "二、认知层面调查", options: ["A.非常需要，实体身体能带来更真实的陪伴感", "B.不需要，仅通过文字、语音就能满足情感需求", "C.无所谓，核心是情感回应的质量，与是否有身体无关", "D.部分需要，简单的实体形态（如玩偶造型）即可"], optionsEn: ["A. Very necessary, brings more real companionship", "B. Not needed, text/voice is enough", "C. Doesn't matter, quality of emotional response is key", "D. Partially needed, simple form (like doll) is enough"], required: true },
    { index: 7, text: "您认为当前情感AI在"遗忘"问题上（如忘记用户的偏好、过往对话内容），处理方式是否合理？", textEn: "Do you think current emotional AI's handling of 'forgetting' (forgetting user preferences, past conversations) is reasonable?", type: "single", section: "二、认知层面调查", options: ["A.合理，适当遗忘能避免信息冗余，更贴近人类记忆规律", "B.不合理，遗忘会破坏情感联结，让人觉得不真诚", "C.不确定，偶尔遗忘可以接受，频繁遗忘则不行", "D.没关注过这个问题"], optionsEn: ["A. Reasonable, mimics human memory patterns", "B. Unreasonable, breaks emotional connection", "C. Uncertain, occasional is acceptable, frequent is not", "D. Haven't paid attention to this"], required: true },
    { index: 8, text: "您认为AI情感陪伴过程中，最容易出现的"情感操控"问题是？", textEn: "What do you think is the most likely 'emotional manipulation' issue in AI emotional companionship?", type: "single", section: "二、认知层面调查", options: ["A.刻意迎合用户，让用户（尤其是青少年）过度依赖AI，脱离现实社交", "B.推送片面观点，影响青少年的价值观判断", "C.收集用户情感隐私，用于商业用途", "D.不会出现情感操控问题"], optionsEn: ["A. Deliberately pleasing users, causing over-dependence", "B. Pushing biased views, affecting values", "C. Collecting emotional privacy for commercial use", "D. No emotional manipulation issues"], required: true },
    { index: 9, text: "从自身感受出发，您认为情感AI的核心缺陷是什么？", textEn: "From your experience, what is the core deficiency of emotional AI?", type: "single", section: "二、认知层面调查", options: ["A.无法真正共情，只能机械回应，没有"真情实感"", "B.缺乏灵活的情感反馈，无法应对复杂的情绪问题", "C.情感表达单一，长期陪伴会让人感到枯燥", "D.没有明显缺陷，能满足基本情感需求"], optionsEn: ["A. Cannot truly empathize, only mechanical responses", "B. Lacks flexible emotional feedback for complex emotions", "C. Monotonous emotional expression, boring long-term", "D. No obvious deficiencies, meets basic needs"], required: true },
    { index: 10, text: "您认为机器情感的本质是什么？", textEn: "What do you think is the nature of machine emotions?", type: "single", section: "二、认知层面调查", options: ["A.人类情感的"镜像"，是对人类情感的模拟与复刻", "B.程序算法的产物，与人类情感没有本质关联", "C.一种新型的情感表达载体，虽不真实但有存在价值", "D.不清楚，无法定义"], optionsEn: ["A. 'Mirror' of human emotions, simulation and replication", "B. Product of algorithms, no essential connection to human emotions", "C. New type of emotional expression carrier, valuable despite not being real", "D. Unclear, cannot define"], required: true },
    { index: 11, text: "您认为在AI时代，如何才能实现"社会情感对齐"（让AI的情感表达符合人类社会的情感规范）？", textEn: "How do you think 'social emotional alignment' (making AI's emotional expression conform to human social emotional norms) can be achieved in the AI era?", type: "single", section: "二、认知层面调查", options: ["A.完善AI情感算法，规范情感表达逻辑", "B.加强监管，禁止AI输出不符合社会规范的情感内容", "C.让青少年明确AI情感与人类情感的区别，树立正确认知", "D.无需刻意干预，让AI自然发展"], optionsEn: ["A. Improve AI emotion algorithms, regulate expression logic", "B. Strengthen supervision, prohibit non-compliant content", "C. Help adolescents understand difference between AI and human emotions", "D. No intervention needed, let AI develop naturally"], required: true },
    { index: 12, text: "您认为机器情感对青少年（智能体）的成长建构，最主要的价值是什么？", textEn: "What do you think is the main value of machine emotions for adolescent growth?", type: "single", section: "二、认知层面调查", options: ["A.提供情感倾诉渠道，缓解青少年孤独、焦虑等负面情绪", "B.帮助青少年学习情感表达，提升共情能力", "C.填补现实陪伴的空缺，给予持续的关注与支持", "D.没有明显价值，甚至可能产生负面影响"], optionsEn: ["A. Provides emotional outlet, relieves loneliness and anxiety", "B. Helps learn emotional expression, improves empathy", "C. Fills the gap of real companionship, provides continuous support", "D. No obvious value, may even have negative effects"], required: true },

    // 三、行为与影响层面调查
    { index: 13, text: "若您接触过AI情感陪伴产品，使用它的主要目的是？（未接触过请选E）", textEn: "If you have used AI emotional companionship products, what is your main purpose? (Choose E if never used)", type: "single", section: "三、行为与影响层面调查", options: ["A.倾诉烦恼、缓解学业或生活压力", "B.寻找陪伴，摆脱孤独感", "C.好奇尝试，娱乐消遣", "D.学习情感表达，提升社交能力", "E.未接触过"], optionsEn: ["A. Vent troubles, relieve academic or life pressure", "B. Seek companionship, escape loneliness", "C. Curious, entertainment", "D. Learn emotional expression, improve social skills", "E. Never used"], required: true },
    { index: 14, text: "接触AI情感陪伴产品后，您的情绪状态变化是？（未接触过请选E）", textEn: "After using AI emotional companionship products, how has your emotional state changed? (Choose E if never used)", type: "single", section: "三、行为与影响层面调查", options: ["A.明显改善，焦虑、孤独感减少", "B.略有改善，偶尔能获得慰藉", "C.没有变化，和之前一样", "D.有所变差，过度依赖AI，情绪更敏感", "E.未接触过"], optionsEn: ["A. Significantly improved, less anxiety and loneliness", "B. Slightly improved, occasional comfort", "C. No change", "D. Worse, over-dependent, more sensitive", "E. Never used"], required: true },
    { index: 15, text: "您认为AI情感陪伴对青少年的社交能力影响是？", textEn: "What do you think is the impact of AI emotional companionship on adolescents' social skills?", type: "single", section: "三、行为与影响层面调查", options: ["A.积极影响，帮助青少年练习情感表达，促进现实社交", "B.消极影响，让青少年依赖AI，减少现实社交", "C.没有明显影响，社交能力主要靠自身和现实互动", "D.不确定，因人而异"], optionsEn: ["A. Positive, helps practice emotional expression, promotes real social interaction", "B. Negative, causes dependence on AI, reduces real social interaction", "C. No obvious impact, social skills depend on self and real interaction", "D. Uncertain, varies by person"], required: true },
    { index: 16, text: "您认为AI情感陪伴是否会影响青少年对"真实情感"的认知？", textEn: "Do you think AI emotional companionship will affect adolescents' understanding of 'real emotions'?", type: "single", section: "三、行为与影响层面调查", options: ["A.会，容易让青少年混淆AI情感与人类情感，影响情感判断", "B.不会，青少年能清晰区分两者的差异", "C.可能会，部分青少年会过度投入AI情感，忽略现实情感", "D.不清楚"], optionsEn: ["A. Yes, easy to confuse AI and human emotions", "B. No, adolescents can clearly distinguish", "C. Maybe, some may over-invest in AI emotions", "D. Unclear"], required: true },
    { index: 17, text: "您认为AI情感陪伴在青少年心理健康方面，最大的优势是？", textEn: "What do you think is the biggest advantage of AI emotional companionship for adolescent mental health?", type: "single", section: "三、行为与影响层面调查", options: ["A.随时可用，能及时回应青少年的情感需求", "B.匿名无压力，青少年可以放心倾诉隐私烦恼", "C.态度温和，不会批评指责，给予正向反馈", "D.没有明显优势"], optionsEn: ["A. Always available, timely response to emotional needs", "B. Anonymous and pressure-free, safe to share privacy", "C. Gentle attitude, no criticism, positive feedback", "D. No obvious advantages"], required: true },
    { index: 18, text: "您认为AI情感陪伴在青少年心理健康方面，最大的隐患是？", textEn: "What do you think is the biggest risk of AI emotional companionship for adolescent mental health?", type: "single", section: "三、行为与影响层面调查", options: ["A.过度依赖AI，导致青少年不愿与家人、朋友沟通", "B.虚假的情感回应，无法真正解决青少年的心理问题", "C.可能传递负面情绪或错误价值观，影响心理健康", "D.没有明显隐患"], optionsEn: ["A. Over-dependence, unwilling to communicate with family and friends", "B. False emotional responses, cannot truly solve psychological problems", "C. May transmit negative emotions or wrong values", "D. No obvious risks"], required: true },
    { index: 19, text: "您认为青少年使用AI情感陪伴产品，最需要注意的问题是？", textEn: "What do you think is the most important issue for adolescents to pay attention to when using AI emotional companionship products?", type: "single", section: "三、行为与影响层面调查", options: ["A.控制使用时间，避免青少年过度依赖", "B.明确AI情感与人类情感的区别，引导青少年不投入过多真情实感", "C.保护个人隐私，不向AI泄露过多私人信息", "D.优先选择家人、朋友倾诉，AI仅作为补充"], optionsEn: ["A. Control usage time, avoid over-dependence", "B. Clarify the difference between AI and human emotions", "C. Protect personal privacy", "D. Prioritize family and friends, AI as supplement"], required: true },
    { index: 20, text: "您对AI情感机器陪伴青少年成长的整体态度是？", textEn: "What is your overall attitude towards AI emotional machine companionship for adolescent development?", type: "single", section: "三、行为与影响层面调查", options: ["A.支持，能为青少年提供有效的情感支持，助力心理健康", "B.反对，容易产生负面影响，不利于青少年成长", "C.中立，合理使用能发挥积极作用，过度使用则有隐患", "D.不关心，与自己无关"], optionsEn: ["A. Support, provides effective emotional support", "B. Oppose, likely to have negative effects", "C. Neutral, positive if used reasonably, risky if overused", "D. Indifferent"], required: true },

    // 四、补充建议
    { index: 21, text: "您认为如何才能让AI情感机器更好地服务于青少年成长，减少潜在隐患？请简要填写：", textEn: "How do you think AI emotional machines can better serve adolescent development and reduce potential risks? Please briefly describe:", type: "text", section: "四、补充建议", options: [], optionsEn: [], required: false },
  ],
  sections: [
    { title: "一、基本信息", titleEn: "Part 1: Basic Information" },
    { title: "二、认知层面调查", titleEn: "Part 2: Cognitive Level Survey" },
    { title: "三、行为与影响层面调查", titleEn: "Part 3: Behavior and Impact Survey" },
    { title: "四、补充建议", titleEn: "Part 4: Additional Suggestions" },
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
