"use client";

import Link from "next/link";
import { isAdminUserId } from "@/lib/admin-auth";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";

// 检查是否是管理员
export default function AdminPage() {
  const { user } = useAuth();
  const { t, language } = useLanguage();

  const isUserAdmin = isAdminUserId(user?.userId);

  if (!isUserAdmin) {
    return (
      <div className="text-center py-20">
        <p className="text-gray-500">{language === "zh" ? "无权限访问此页面" : "Access denied"}</p>
        <Link href="/" className="text-blue-600 hover:underline mt-4 inline-block">{t("home")}</Link>
      </div>
    );
  }

  const menuItems = [
    {
      href: "/admin/study-assistant",
      icon: "🧭",
      title: language === "zh" ? "IB学习助手" : "IB Study Assistant",
      desc:
        language === "zh"
          ? "上传试卷、分析弱项、生成学习计划、推荐资料并监督执行"
          : "Upload papers, diagnose weak points, build plans, recommend materials, and supervise execution",
      color: "from-emerald-600 to-teal-500",
    },
    {
      href: "/admin/study-question-bank",
      icon: "QS",
      title: language === "zh" ? "学习题库审核" : "Study Question Review",
      desc:
        language === "zh"
          ? "审核自动学习收录的高质量题目，批准后写入向量知识库"
          : "Review auto-captured questions and publish approved items to the vector knowledge base",
      color: "from-cyan-600 to-emerald-500",
    },
    {
      href: "/admin/podcast",
      icon: "🎧",
      title: language === "zh" ? "播客专辑" : "Podcast Albums",
      desc: language === "zh" ? "创建专辑主介绍并维护每一期播放链接" : "Create podcast albums and manage episode links",
      color: "from-slate-700 to-blue-600",
    },
    {
      href: "/admin/posts",
      icon: "📝",
      title: language === "zh" ? "帖子管理" : "Posts Management",
      desc: language === "zh" ? "管理所有帖子，上架/下架/删除" : "Manage posts, publish/hide/delete",
      color: "from-blue-500 to-cyan-500",
    },
    {
      href: "/admin/sensitive-words",
      icon: "🔒",
      title: language === "zh" ? "敏感词管理" : "Sensitive Words",
      desc: language === "zh" ? "管理敏感词库，支持批量导入" : "Manage sensitive words, batch import supported",
      color: "from-red-500 to-pink-500",
    },
    {
      href: "/admin/moderation",
      icon: "🔍",
      title: language === "zh" ? "内容审核" : "Content Moderation",
      desc: language === "zh" ? "审核包含敏感词的内容" : "Review content with sensitive words",
      color: "from-yellow-500 to-orange-500",
    },
    {
      href: "/videos",
      icon: "🎬",
      title: language === "zh" ? "视频管理" : "Video Management",
      desc: language === "zh" ? "发布和管理视频内容" : "Publish and manage videos",
      color: "from-purple-500 to-indigo-500",
    },
    {
      href: "/votes",
      icon: "📊",
      title: language === "zh" ? "投票管理" : "Vote Management",
      desc: language === "zh" ? "管理投票内容" : "Manage votes",
      color: "from-indigo-500 to-purple-500",
    },
    {
      href: "/surveys",
      icon: "📋",
      title: language === "zh" ? "问卷管理" : "Survey Management",
      desc: language === "zh" ? "管理调查问卷" : "Manage surveys",
      color: "from-green-500 to-teal-500",
    },
    {
      href: "/admin/feedback",
      icon: "📬",
      title: language === "zh" ? "反馈管理" : "Feedback Management",
      desc: language === "zh" ? "查看用户意见反馈" : "View user feedback",
      color: "from-teal-500 to-cyan-500",
    },
    {
      href: "/admin/users",
      icon: "👥",
      title: language === "zh" ? "用户管理" : "User Management",
      desc: language === "zh" ? "管理用户，新增/编辑/禁用/删除" : "Manage users, add/edit/disable/delete",
      color: "from-pink-500 to-rose-500",
    },
  ];

  return (
    <div>
      <h1 className="text-3xl font-bold mb-2">
        🛡️ {language === "zh" ? "管理后台" : "Admin Panel"}
      </h1>
      <p className="text-gray-500 mb-8">
        {language === "zh" ? "欢迎回来，管理员" : "Welcome back, Admin"}
      </p>

      <div className="grid md:grid-cols-2 gap-6">
        {menuItems.map((item) => (
          <Link key={item.href} href={item.href}>
            <div className={`bg-gradient-to-r ${item.color} text-white rounded-xl p-6 hover:shadow-lg hover:scale-[1.02] transition-all`}>
              <div className="text-3xl mb-3">{item.icon}</div>
              <h3 className="text-xl font-bold mb-2">{item.title}</h3>
              <p className="text-white/80 text-sm">{item.desc}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
