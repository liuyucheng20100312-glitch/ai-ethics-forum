"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";

function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  ) : (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
    </svg>
  );
}

const RECENT_USERS_KEY = "ai_ethics_recent_users";

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const { t, language, toggleLanguage } = useLanguage();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [recentUsers, setRecentUsers] = useState<string[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(RECENT_USERS_KEY);
      const parsed = raw ? (JSON.parse(raw) as string[]) : [];
      setRecentUsers(Array.isArray(parsed) ? parsed.slice(0, 5) : []);
    } catch {
      setRecentUsers([]);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "登录失败"); return; }
      login(data.token, {
        userId: data.userId ?? "",
        username: data.username,
        bio: data.bio ?? "",
        avatar: data.avatar ?? "",
      });
      try {
        const next = [data.username, ...recentUsers.filter((u) => u !== data.username)].slice(0, 5);
        localStorage.setItem(RECENT_USERS_KEY, JSON.stringify(next));
      } catch {}
      router.push("/");
    } catch {
      setError("网络错误，请稍后再试");
    } finally {
      setLoading(false);
    }
  };

  const handleGuestLogin = async () => {
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "guest", password: "" }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "登录失败"); return; }
      login(data.token, { userId: "guest", username: "游客", bio: "游客账号，仅供浏览", avatar: "" });
      router.push("/");
    } catch {
      setError("网络错误，请稍后再试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[70vh] flex items-center justify-center">
      <div className="w-full max-w-sm">
        <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl p-8 shadow-sm">
          {/* Header with lang toggle */}
          <div className="flex justify-end mb-2">
            <button
              type="button"
              onClick={toggleLanguage}
              className="text-xs px-2.5 py-1 rounded-full border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors font-medium tracking-wide"
              title={language === "zh" ? "Switch to English" : "切换到中文"}
            >
              {language === "zh" ? "EN" : "中"}
            </button>
          </div>

          <div className="text-center mb-6">
            <img src="/school-logo.png" alt="校徽" className="h-12 w-auto mx-auto mb-3" />
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">{t("login")}</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {t("forumTitle")} · {language === "zh" ? "广碧" : "GCGS"}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t("username")}</label>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={t("enterUsername")}
                className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
                autoFocus
              />
              {recentUsers.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  <span className="text-xs text-gray-400 self-center">{t("recentLogins")}:</span>
                  {recentUsers.map((name) => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => setUsername(name)}
                      className="text-xs px-2 py-1 rounded-full border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                    >
                      {name}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t("password")}</label>
              <div className="relative">
                <input
                  type={showPwd ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t("enterPassword")}
                  className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg px-3 py-2 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
                <button type="button" onClick={() => setShowPwd(!showPwd)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                  <EyeIcon open={showPwd} />
                </button>
              </div>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-2 rounded-lg text-sm transition-colors"
            >
              {loading ? t("loggingIn") : t("login")}
            </button>
          </form>

          <p className="text-center text-sm text-gray-500 dark:text-gray-400 mt-5">
            {t("noAccount")}
            <Link href="/register" className="text-blue-600 hover:underline ml-1">{t("registerNow")}</Link>
          </p>

          {/* Guest login */}
          <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
            <button
              type="button"
              onClick={handleGuestLogin}
              disabled={loading}
              className="w-full border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 font-medium py-2 rounded-lg text-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <span>👤</span>
              <span>{language === "zh" ? "游客登录（仅浏览）" : "Browse as Guest (read-only)"}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
