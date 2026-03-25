"use client";

import Link from "next/link";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";

// 检查是否是管理员
function isAdmin(userId: string | undefined): boolean {
  return userId === "offline_admin";
}

export default function AdminPage() {
  const { user } = useAuth();
  const { t, language } = useLanguage();

  const isUserAdmin = isAdmin(user?.userId);

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
      href: "/admin/sensitive-words",
      icon: "📝",
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
      href: "/votes",
      icon: "📊",
      title: language === "zh" ? "投票管理" : "Vote Management",
      desc: language === "zh" ? "管理投票内容" : "Manage votes",
      color: "from-blue-500 to-cyan-500",
    },
    {
      href: "/surveys",
      icon: "📋",
      title: language === "zh" ? "问卷管理" : "Survey Management",
      desc: language === "zh" ? "管理调查问卷" : "Manage surveys",
      color: "from-green-500 to-teal-500",
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
