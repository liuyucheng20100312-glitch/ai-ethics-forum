/**
 * AI帖子自动生成定时任务
 *
 * 部署方式（选择一种）：
 *
 * 1. Vercel Cron Jobs（推荐，如果部署在Vercel）
 *    在 vercel.json 中添加：
 *    {
 *      "crons": [{
 *        "path": "/api/auto-posts",
 *        "schedule": "0 9 * * 1"  // 每周一早上9点执行
 *      }]
 *    }
 *
 * 2. 外部定时服务（cron-job.org、EasyCron等）
 *    设置每周一调用：https://你的域名/api/auto-posts
 *    Headers: Authorization: Bearer YOUR_ADMIN_TOKEN
 *
 * 3. 本地 cron（Linux/Mac）
 *    crontab -e
 *    0 9 * * 1 curl -H "Authorization: Bearer YOUR_ADMIN_TOKEN" https://你的域名/api/auto-posts
 *
 * 4. Windows 任务计划程序
 *    创建每周一执行的任务，运行：
 *    curl -H "Authorization: Bearer YOUR_ADMIN_TOKEN" https://你的域名/api/auto-posts
 */

// 手动执行脚本（用于测试）
async function main() {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  const adminToken = process.env.ADMIN_TOKEN;

  if (!adminToken) {
    console.error("请设置 ADMIN_TOKEN 环境变量");
    process.exit(1);
  }

  console.log("开始生成AI帖子...");

  try {
    const response = await fetch(`${baseUrl}/api/auto-posts`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
    });

    const result = await response.json();
    console.log("生成结果:", JSON.stringify(result, null, 2));
  } catch (error) {
    console.error("生成失败:", error);
    process.exit(1);
  }
}

main();
