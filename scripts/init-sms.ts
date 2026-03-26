/**
 * 初始化短信模板和数据库索引
 * 运行方式: npx tsx scripts/init-sms.ts
 */

import { MongoClient } from "mongodb";

const MONGODB_URI = process.env.MONGODB_URI || "";
const MONGODB_DB = process.env.MONGODB_DB || "ai-ethics-forum";

async function init() {
  if (!MONGODB_URI) {
    console.error("请设置 MONGODB_URI 环境变量");
    process.exit(1);
  }

  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db(MONGODB_DB);

  console.log("开始初始化...");

  // 创建索引
  console.log("创建索引...");

  // users 集合索引
  await db.collection("users").createIndex({ username: 1 }, { unique: true });
  await db.collection("users").createIndex({ phone: 1 }, { unique: true, sparse: true });
  console.log("  ✓ users 索引创建完成");

  // verification_codes 集合索引
  await db.collection("verification_codes").createIndex({ phone: 1, scene: 1 });
  await db.collection("verification_codes").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  console.log("  ✓ verification_codes 索引创建完成");

  // sms_logs 集合索引
  await db.collection("sms_logs").createIndex({ phone: 1, createdAt: -1 });
  await db.collection("sms_logs").createIndex({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 3600 }); // 保留90天
  console.log("  ✓ sms_logs 索引创建完成");

  // sms_templates 集合索引
  await db.collection("sms_templates").createIndex({ code: 1 }, { unique: true });
  console.log("  ✓ sms_templates 索引创建完成");

  // 初始化默认短信模板
  console.log("初始化短信模板...");

  const defaultTemplates = [
    {
      code: "REGISTER",
      name: "注册验证码",
      content: "您的注册手机验证码为{code}",
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      code: "LOGIN",
      name: "登录验证码",
      content: "您的登录手机验证码为{code}",
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];

  for (const template of defaultTemplates) {
    const existing = await db.collection("sms_templates").findOne({ code: template.code });
    if (!existing) {
      await db.collection("sms_templates").insertOne(template);
      console.log(`  ✓ 模板 ${template.code} 创建完成`);
    } else {
      console.log(`  - 模板 ${template.code} 已存在，跳过`);
    }
  }

  await client.close();
  console.log("初始化完成！");
}

init().catch((error) => {
  console.error("初始化失败:", error);
  process.exit(1);
});
