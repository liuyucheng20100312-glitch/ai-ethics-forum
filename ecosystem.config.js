module.exports = {
  apps: [
    {
      name: 'ai-ethics-forum',
      // 直接用 Node.js 执行 Next.js 生产启动脚本（彻底绕开 CMD 窗口）
      script: 'node_modules/next/dist/bin/next',
      args: 'start',
      env: {
        NODE_ENV: 'production',
        PORT: 80 // 和你之前运行的端口保持一致
      },
      // Windows 下隐藏窗口（关键配置）
      windowsHide: true
    },
    {
      name: 'ai-post-scheduler',
      // 每周一自动生成AI帖子的定时任务
      script: 'npx',
      args: 'tsx scripts/scheduler.ts',
      env: {
        NODE_ENV: 'production'
      },
      watch: false,
      autorestart: true,
      max_restarts: 5,
      restart_delay: 10000,
      windowsHide: true
    }
  ]
};