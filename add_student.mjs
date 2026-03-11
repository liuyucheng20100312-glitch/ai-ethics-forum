import { MongoClient } from "mongodb";

const client = new MongoClient("mongodb+srv://admin:kslmFVQVylH2VXgD@cluster0.qqqwmn9.mongodb.net/?appName=Cluster0");

async function main() {
  await client.connect();
  const db = client.db("ai-ethics-forum");
  
  const user = await db.collection("users").findOne({ username: "G24lyc" });
  if (user) {
    await db.collection("users").updateOne(
      { username: "G24lyc" },
      { $set: { realName: "刘瑀丞", classId: "G2-4", verified: true } }
    );
    console.log("✅ 已更新用户 G24lyc 的认证信息");
  } else {
    console.log("⚠️  用户 G24lyc 尚未注册，注册后会自动获得认证");
  }

  await db.collection("students").updateOne(
    { username: "G24lyc" },
    { $set: { username: "G24lyc", realName: "刘瑀丞", classId: "G2-4" } },
    { upsert: true }
  );
  console.log("✅ 已添加到白名单");

  await client.close();
}

main().catch(console.error);
