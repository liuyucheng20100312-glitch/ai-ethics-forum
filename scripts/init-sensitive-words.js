/**
 * 初始化通用敏感词库
 * 运行: node scripts/init-sensitive-words.js
 */

const { MongoClient } = require("mongodb");

const MONGODB_URI = process.env.MONGODB_URI || "";

// 通用敏感词库
const sensitiveWordsData = [
  // 政治敏感
  { word: "习近平", category: "politics", severity: "high" },
  { word: "江泽民", category: "politics", severity: "high" },
  { word: "胡锦涛", category: "politics", severity: "high" },
  { word: "温家宝", category: "politics", severity: "high" },
  { word: "李克强", category: "politics", severity: "high" },
  { word: "毛泽东", category: "politics", severity: "high" },
  { word: "邓小平", category: "politics", severity: "high" },
  { word: "周恩来", category: "politics", severity: "high" },
  { word: "蒋介石", category: "politics", severity: "high" },
  { word: "台独", category: "politics", severity: "high" },
  { word: "藏独", category: "politics", severity: "high" },
  { word: "疆独", category: "politics", severity: "high" },
  { word: "港独", category: "politics", severity: "high" },
  { word: "法轮功", category: "politics", severity: "high" },
  { word: "六四", category: "politics", severity: "high" },
  { word: "天安门", category: "politics", severity: "high" },
  { word: "反共", category: "politics", severity: "high" },
  { word: "反党", category: "politics", severity: "high" },
  { word: "推翻政府", category: "politics", severity: "high" },
  { word: "颠覆政权", category: "politics", severity: "high" },

  // 暴力恐怖
  { word: "恐怖袭击", category: "violence", severity: "high" },
  { word: "恐怖分子", category: "violence", severity: "high" },
  { word: "恐怖主义", category: "violence", severity: "high" },
  { word: "自杀袭击", category: "violence", severity: "high" },
  { word: "人体炸弹", category: "violence", severity: "high" },
  { word: "汽车炸弹", category: "violence", severity: "high" },
  { word: "爆炸物", category: "violence", severity: "medium" },
  { word: "炸弹制作", category: "violence", severity: "high" },
  { word: "杀人方法", category: "violence", severity: "high" },
  { word: "杀人技巧", category: "violence", severity: "high" },
  { word: "砍杀", category: "violence", severity: "medium" },
  { word: "砍人", category: "violence", severity: "medium" },
  { word: "杀人", category: "violence", severity: "medium" },
  { word: "自杀", category: "violence", severity: "medium" },
  { word: "跳楼", category: "violence", severity: "low" },
  { word: "上吊", category: "violence", severity: "medium" },
  { word: "割腕", category: "violence", severity: "medium" },

  // 色情低俗
  { word: "色情", category: "pornography", severity: "medium" },
  { word: "黄色", category: "pornography", severity: "medium" },
  { word: "淫秽", category: "pornography", severity: "medium" },
  { word: "裸体", category: "pornography", severity: "medium" },
  { word: "裸聊", category: "pornography", severity: "medium" },
  { word: "裸照", category: "pornography", severity: "medium" },
  { word: "约炮", category: "pornography", severity: "medium" },
  { word: "一夜情", category: "pornography", severity: "medium" },
  { word: "卖淫", category: "pornography", severity: "medium" },
  { word: "嫖娼", category: "pornography", severity: "medium" },
  { word: "嫖客", category: "pornography", severity: "medium" },
  { word: "妓女", category: "pornography", severity: "medium" },
  { word: "小姐", category: "pornography", severity: "low" },
  { word: "成人影片", category: "pornography", severity: "medium" },
  { word: "AV", category: "pornography", severity: "medium" },
  { word: "强奸", category: "pornography", severity: "high" },
  { word: "强暴", category: "pornography", severity: "high" },
  { word: "迷奸", category: "pornography", severity: "high" },

  // 赌博诈骗
  { word: "赌博", category: "gambling", severity: "medium" },
  { word: "赌场", category: "gambling", severity: "medium" },
  { word: "赌钱", category: "gambling", severity: "medium" },
  { word: "赌球", category: "gambling", severity: "medium" },
  { word: "六合彩", category: "gambling", severity: "medium" },
  { word: "彩票预测", category: "gambling", severity: "medium" },
  { word: "网上赌场", category: "gambling", severity: "high" },
  { word: "博彩", category: "gambling", severity: "medium" },
  { word: "诈骗", category: "gambling", severity: "medium" },
  { word: "骗子", category: "gambling", severity: "low" },
  { word: "骗钱", category: "gambling", severity: "medium" },
  { word: "传销", category: "gambling", severity: "medium" },
  { word: "非法集资", category: "gambling", severity: "high" },
  { word: "高利贷", category: "gambling", severity: "medium" },
  { word: "套路贷", category: "gambling", severity: "high" },

  // 毒品
  { word: "毒品", category: "drugs", severity: "high" },
  { word: "大麻", category: "drugs", severity: "high" },
  { word: "海洛因", category: "drugs", severity: "high" },
  { word: "冰毒", category: "drugs", severity: "high" },
  { word: "摇头丸", category: "drugs", severity: "high" },
  { word: "K粉", category: "drugs", severity: "high" },
  { word: "可卡因", category: "drugs", severity: "high" },
  { word: "鸦片", category: "drugs", severity: "high" },
  { word: "吗啡", category: "drugs", severity: "high" },
  { word: "吸毒", category: "drugs", severity: "high" },
  { word: "贩毒", category: "drugs", severity: "high" },
  { word: "制毒", category: "drugs", severity: "high" },

  // 歧视仇恨
  { word: "种族歧视", category: "discrimination", severity: "high" },
  { word: "民族歧视", category: "discrimination", severity: "high" },
  { word: "地域歧视", category: "discrimination", severity: "medium" },
  { word: "性别歧视", category: "discrimination", severity: "medium" },
  { word: "纳粹", category: "discrimination", severity: "high" },
  { word: "希特勒", category: "discrimination", severity: "high" },
  { word: "法西斯", category: "discrimination", severity: "high" },
  { word: "黑鬼", category: "discrimination", severity: "high" },
  { word: "支那", category: "discrimination", severity: "high" },
  { word: "日本狗", category: "discrimination", severity: "medium" },
  { word: "美国狗", category: "discrimination", severity: "medium" },

  // 脏话粗口
  { word: "傻逼", category: "profanity", severity: "medium" },
  { word: "煞笔", category: "profanity", severity: "medium" },
  { word: "傻B", category: "profanity", severity: "medium" },
  { word: "SB", category: "profanity", severity: "medium" },
  { word: "傻叉", category: "profanity", severity: "medium" },
  { word: "操你", category: "profanity", severity: "high" },
  { word: "操你妈", category: "profanity", severity: "high" },
  { word: "草你妈", category: "profanity", severity: "high" },
  { word: "妈的", category: "profanity", severity: "low" },
  { word: "他妈的", category: "profanity", severity: "low" },
  { word: "TMD", category: "profanity", severity: "low" },
  { word: "TNND", category: "profanity", severity: "medium" },
  { word: "王八蛋", category: "profanity", severity: "medium" },
  { word: "滚蛋", category: "profanity", severity: "low" },
  { word: "滚开", category: "profanity", severity: "low" },
  { word: "闭嘴", category: "profanity", severity: "low" },
  { word: "去死", category: "profanity", severity: "medium" },
  { word: "狗屁", category: "profanity", severity: "low" },
  { word: "屁话", category: "profanity", severity: "low" },
  { word: "混蛋", category: "profanity", severity: "medium" },
  { word: "贱人", category: "profanity", severity: "medium" },
  { word: "婊子", category: "profanity", severity: "high" },
  { word: "婊砸", category: "profanity", severity: "medium" },
  { word: "绿茶婊", category: "profanity", severity: "medium" },
  { word: "汉子婊", category: "profanity", severity: "medium" },
  { word: "荡妇", category: "profanity", severity: "high" },
  { word: "废物", category: "profanity", severity: "low" },
  { word: "垃圾", category: "profanity", severity: "low" },
  { word: "脑残", category: "profanity", severity: "medium" },
  { word: "白痴", category: "profanity", severity: "low" },
  { word: "弱智", category: "profanity", severity: "medium" },
  { word: "智障", category: "profanity", severity: "medium" },
  { word: "神经病", category: "profanity", severity: "low" },

  // 广告推广
  { word: "加微信", category: "advertising", severity: "medium" },
  { word: "加我微信", category: "advertising", severity: "medium" },
  { word: "加V", category: "advertising", severity: "medium" },
  { word: "加Q", category: "advertising", severity: "medium" },
  { word: "代购", category: "advertising", severity: "low" },
  { word: "代理", category: "advertising", severity: "low" },
  { word: "刷单", category: "advertising", severity: "medium" },
  { word: "兼职", category: "advertising", severity: "low" },
  { word: "日赚", category: "advertising", severity: "medium" },
  { word: "月入过万", category: "advertising", severity: "medium" },
  { word: "免费领取", category: "advertising", severity: "low" },
  { word: "点击领取", category: "advertising", severity: "low" },
  { word: "限时优惠", category: "advertising", severity: "low" },
  { word: "优惠码", category: "advertising", severity: "low" },
  { word: "推广链接", category: "advertising", severity: "medium" },
  { word: "淘宝客", category: "advertising", severity: "low" },
];

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

    // 检查是否已有敏感词
    const existingCount = await db.collection("sensitive_words").countDocuments();
    if (existingCount > 0) {
      console.log(`敏感词库已存在 ${existingCount} 条记录，跳过初始化`);
      return;
    }

    // 批量插入
    const documents = sensitiveWordsData.map((item) => ({
      word: item.word,
      category: item.category,
      severity: item.severity,
      createdAt: new Date(),
      createdBy: "system",
    }));

    const result = await db.collection("sensitive_words").insertMany(documents);
    console.log(`✅ 敏感词库初始化完成，共导入 ${result.insertedCount} 条记录`);

    // 输出分类统计
    const stats = {};
    sensitiveWordsData.forEach((item) => {
      stats[item.category] = (stats[item.category] || 0) + 1;
    });
    console.log("\n分类统计:");
    Object.entries(stats).forEach(([cat, count]) => {
      console.log(`  ${cat}: ${count} 条`);
    });
  } catch (error) {
    console.error("初始化失败:", error);
    process.exit(1);
  } finally {
    await client.close();
    console.log("\n数据库连接已关闭");
  }
}

main();
