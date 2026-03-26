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

type LoginType = "password" | "sms";

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const { t, language, toggleLanguage } = useLanguage();
  const [loginType, setLoginType] = useState<LoginType>("password");

  // 密码登录状态
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);

  // 验证码登录状态
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [countdown, setCountdown] = useState(0);
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

  // 倒计时效果
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  const handleSendCode = async () => {
    setError("");

    // 验证手机号
    const phoneRegex = /^1[3-9]\d{9}$/;
    if (!phoneRegex.test(phone)) {
      setError(language === "zh" ? "请输入正确的手机号" : "Please enter a valid phone number");
      return;
    }

    setSendingCode(true);
    try {
      const res = await fetch("/api/sms/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, scene: "login" }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || (language === "zh" ? "发送失败" : "Failed to send"));
        return;
      }

      setCountdown(60);
    } catch {
      setError(language === "zh" ? "网络错误" : "Network error");
    } finally {
      setSendingCode(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, loginType: "password" }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "登录失败"); return; }
      login(data.token, {
        userId: data.userId ?? "",
        username: data.username,
        bio: data.bio ?? "",
        avatar: data.avatar ?? "",
        verified: data.verified ?? false,
        realName: data.realName ?? "",
        classId: data.classId ?? "",
        isAdmin: data.isAdmin ?? false,
      });
      try {
        const next = [data.username, ...recentUsers.filter((u) => u !== data.username)].slice(0, 5);
        localStorage.setItem(RECENT_USERS_KEY, JSON.stringify(next));
      } catch {}
      window.location.href = "/";
    } catch {
      setError("网络错误，请稍后再试");
    } finally {
      setLoading(false);
    }
  };

  const handleSmsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, code, loginType: "sms" }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "登录失败"); return; }
      login(data.token, {
        userId: data.userId ?? "",
        username: data.username,
        bio: data.bio ?? "",
        avatar: data.avatar ?? "",
        verified: data.verified ?? false,
        realName: data.realName ?? "",
        classId: data.classId ?? "",
        isAdmin: data.isAdmin ?? false,
      });
      window.location.href = "/";
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
        body: JSON.stringify({ username: "guest", password: "", loginType: "password" }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "登录失败"); return; }
      login(data.token, { userId: "guest", username: "游客", bio: "游客账号，仅供浏览", avatar: "" });
      window.location.href = "/";
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

          {/* 登录方式切换 */}
          <div className="flex mb-4 border-b border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={() => setLoginType("password")}
              className={`flex-1 pb-2 text-sm font-medium transition-colors ${
                loginType === "password"
                  ? "text-blue-600 border-b-2 border-blue-600"
                  : "text-gray-500 dark:text-gray-400"
              }`}
            >
              {language === "zh" ? "密码登录" : "Password"}
            </button>
            <button
              type="button"
              onClick={() => setLoginType("sms")}
              className={`flex-1 pb-2 text-sm font-medium transition-colors ${
                loginType === "sms"
                  ? "text-blue-600 border-b-2 border-blue-600"
                  : "text-gray-500 dark:text-gray-400"
              }`}
            >
              {language === "zh" ? "验证码登录" : "SMS Code"}
            </button>
          </div>

          {loginType === "password" ? (
            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {language === "zh" ? "用户名/手机号" : "Username/Phone"}
                </label>
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder={language === "zh" ? "输入用户名或手机号" : "Enter username or phone"}
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
          ) : (
            <form onSubmit={handleSmsSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {language === "zh" ? "手机号" : "Phone"}
                </label>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder={language === "zh" ? "请输入手机号" : "Enter phone number"}
                  className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {language === "zh" ? "验证码" : "Verification Code"}
                </label>
                <div className="flex gap-2">
                  <input
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder={language === "zh" ? "请输入验证码" : "Enter code"}
                    className="flex-1 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                    maxLength={6}
                  />
                  <button
                    type="button"
                    onClick={handleSendCode}
                    disabled={countdown > 0 || sendingCode}
                    className="px-4 py-2 text-sm font-medium rounded-lg border border-blue-600 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                  >
                    {countdown > 0
                      ? `${countdown}s`
                      : sendingCode
                      ? (language === "zh" ? "发送中..." : "Sending...")
                      : (language === "zh" ? "发送验证码" : "Send Code")}
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
          )}

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
