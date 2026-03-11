"use client";

import { useState } from "react";
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

function pwdStrength(p: string): { level: number; label: string; color: string } {
  if (!p) return { level: 0, label: "", color: "" };
  let score = 0;
  if (p.length >= 8) score++;
  if (p.length >= 12) score++;
  if (/[A-Z]/.test(p)) score++;
  if (/[0-9]/.test(p)) score++;
  if (/[^A-Za-z0-9]/.test(p)) score++;
  if (score <= 1) return { level: 1, label: "弱 Weak", color: "bg-red-400" };
  if (score <= 3) return { level: 2, label: "中 Fair", color: "bg-yellow-400" };
  return { level: 3, label: "强 Strong", color: "bg-green-500" };
}

export default function RegisterPage() {
  const router = useRouter();
  const { login } = useAuth();
  const { t, language, toggleLanguage } = useLanguage();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const strength = pwdStrength(password);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password !== confirm) {
      setError(language === "zh" ? "两次密码不一致" : "Passwords do not match");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? (language === "zh" ? "注册失败" : "Registration failed")); return; }
      login(data.token, {
        userId: data.userId ?? "",
        username: data.username,
        bio: "对AI伦理充满好奇的探索者",
        avatar: "",
        verified: data.verified ?? false,
        realName: data.realName ?? "",
        classId: data.classId ?? "",
        isAdmin: false,
      });
      router.push("/");
    } catch {
      setError(language === "zh" ? "网络错误，请稍后再试" : "Network error, please try again");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[70vh] flex items-center justify-center">
      <div className="w-full max-w-sm">
        <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl p-8 shadow-sm">
          {/* Lang toggle */}
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
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">{t("register")}</h1>
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
                placeholder={language === "zh" ? "最多10个汉字或20个字母" : "Max 20 characters"}
                className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
                autoFocus
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t("password")}</label>
              <div className="relative">
                <input
                  type={showPwd ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={language === "zh" ? "至少6位" : "At least 6 characters"}
                  className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg px-3 py-2 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
                <button type="button" onClick={() => setShowPwd(!showPwd)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                  <EyeIcon open={showPwd} />
                </button>
              </div>
              {/* Password strength bar */}
              {password.length > 0 && (
                <div className="mt-1.5 flex items-center gap-2">
                  <div className="flex gap-0.5 flex-1 h-1.5">
                    {[1, 2, 3].map((n) => (
                      <div key={n} className={`flex-1 rounded-full transition-colors ${strength.level >= n ? strength.color : "bg-gray-200 dark:bg-gray-600"}`} />
                    ))}
                  </div>
                  <span className={`text-xs font-medium ${strength.level === 1 ? "text-red-500" : strength.level === 2 ? "text-yellow-500" : "text-green-500"}`}>
                    {strength.label}
                  </span>
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t("confirmPassword")}</label>
              <div className="relative">
                <input
                  type={showConfirm ? "text" : "password"}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder={language === "zh" ? "再次输入密码" : "Repeat password"}
                  className={`w-full border rounded-lg px-3 py-2 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 ${
                    confirm && confirm !== password
                      ? "border-red-400 dark:border-red-500"
                      : "border-gray-300 dark:border-gray-600"
                  }`}
                  required
                />
                <button type="button" onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                  <EyeIcon open={showConfirm} />
                </button>
              </div>
              {confirm && confirm !== password && (
                <p className="text-xs text-red-500 mt-1">{language === "zh" ? "密码不一致" : "Passwords don't match"}</p>
              )}
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-2 rounded-lg text-sm transition-colors"
            >
              {loading ? t("registering") : t("register")}
            </button>
          </form>

          <p className="text-center text-sm text-gray-500 dark:text-gray-400 mt-5">
            {t("hasAccount")}
            <Link href="/login" className="text-blue-600 hover:underline ml-1">{t("loginNow")}</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
