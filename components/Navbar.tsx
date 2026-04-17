"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/app/context/AuthContext";
import { useLanguage } from "@/app/context/LanguageContext";
import { isAdminUserId } from "@/lib/admin-auth";

// 检查是否是管理员
const navItemsZh = [
  { label: "首页",     labelEn: "Home",     href: "/" },
  { label: "视频专区", labelEn: "Videos",   href: "/videos" },
  { label: "播客专区", labelEn: "Podcast",  href: "/podcast" },
  { label: "新闻专区", labelEn: "News",     href: "/news" },
  { label: "AI工具推荐",labelEn:"Tools",    href: "/tools" },
  { label: "发帖专区", labelEn: "Forum",    href: "/forum" },
  { label: "投票专区", labelEn: "Votes",    href: "/votes" },
  { label: "问卷调查", labelEn: "Surveys",  href: "/surveys" },
  { label: "创意专区", labelEn: "Creative", href: "/creative" },
  { label: "个人中心", labelEn: "Profile",  href: "/profile" },
  { label: "设置",     labelEn: "Settings", href: "/settings" },
];

export default function Navbar() {
  const pathname = usePathname();
  const { user } = useAuth();
  const { language } = useLanguage();
  const isUserAdmin = isAdminUserId(user?.userId);

  return (
    <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-20 shadow-sm transition-colors">
      <div className="max-w-7xl mx-auto flex items-center justify-between px-6 h-14">
        <Link href="/" className="flex items-center gap-2 shrink-0 mr-6 group">
          <img src="/school-logo.png" alt="广东碧桂园学校" className="h-8 w-auto" />
          <div className="leading-tight hidden sm:block">
            <div className="text-xs font-semibold text-blue-900 dark:text-blue-300 leading-none">广东碧桂园学校</div>
            <div className="text-xs text-blue-600 dark:text-blue-400 leading-tight">AI Ethics Forum</div>
          </div>
        </Link>
        <nav className="flex items-center gap-1 overflow-x-auto flex-1">
          {navItemsZh.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                  active
                    ? "bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                    : "text-gray-600 dark:text-gray-400 hover:text-blue-700 hover:bg-gray-50 dark:hover:bg-gray-800"
                }`}
              >
                {language === "zh" ? item.label : item.labelEn}
              </Link>
            );
          })}
        </nav>
        <div className="shrink-0 ml-4 flex items-center gap-2">
          {/* 管理后台入口 */}
          {isUserAdmin && (
            <Link
              href="/admin"
              className={`text-sm font-medium px-3 py-1.5 rounded-lg transition-colors ${
                pathname.startsWith("/admin")
                  ? "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300"
                  : "text-purple-600 hover:text-purple-700 hover:bg-purple-50 dark:hover:bg-purple-900/20"
              }`}
            >
              🛡️ {language === "zh" ? "管理" : "Admin"}
            </Link>
          )}
          {user ? (
            <Link
              href="/profile"
              className="flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              {user.avatar ? (
                <img src={user.avatar} alt="头像" className="w-7 h-7 rounded-full object-cover border border-gray-200" />
              ) : (
                <div className="w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 flex items-center justify-center text-xs font-bold">
                  {user.username[0]}
                </div>
              )}
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300 hidden sm:block max-w-[80px] truncate">
                {user.username}
              </span>
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className="text-sm font-medium text-blue-600 hover:text-blue-700 px-3 py-1.5 rounded-lg hover:bg-blue-50 transition-colors"
              >
                {language === "zh" ? "登录" : "Login"}
              </Link>
              <Link
                href="/register"
                className="text-sm font-medium bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 transition-colors"
              >
                {language === "zh" ? "注册" : "Register"}
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
