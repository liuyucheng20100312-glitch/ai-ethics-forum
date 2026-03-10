"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const { authFetch, user, isGuest, logout } = useAuth();
  const { language, toggleLanguage, t } = useLanguage();
  const router = useRouter();

  const handleLogout = () => {
    logout();
    router.push("/login");
  };
  const [notifications, setNotifications] = useState({
    replies: true,
    likes: true,
    follows: false,
    system: true,
  });

  // Load saved notifications on mount
  useEffect(() => {
    const saved = localStorage.getItem("ai_ethics_notifications");
    if (saved) {
      try { setNotifications(JSON.parse(saved)); } catch {}
    }
  }, []);

  const updateNotification = (key: string, value: boolean) => {
    setNotifications((prev) => {
      const next = { ...prev, [key]: value };
      localStorage.setItem("ai_ethics_notifications", JSON.stringify(next));
      return next;
    });
  };
  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [pwdMsg, setPwdMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const handleChangePassword = async () => {
    setPwdMsg(null);
    if (newPwd.length < 6) { setPwdMsg({ text: t("pwdMinLength"), ok: false }); return; }
    if (newPwd !== confirmPwd) { setPwdMsg({ text: t("pwdMismatch"), ok: false }); return; }
    try {
      const res = await authFetch("/api/profile", {
        method: "PUT",
        body: JSON.stringify({ currentPassword: currentPwd, newPassword: newPwd, confirmPassword: confirmPwd }),
      });
      const data = await res.json();
      if (!res.ok) { setPwdMsg({ text: data.error ?? t("pwdChangeFailed"), ok: false }); return; }
      setCurrentPwd(""); setNewPwd(""); setConfirmPwd("");
      setPwdMsg({ text: t("pwdChanged"), ok: true });
      setTimeout(() => setPwdMsg(null), 3000);
    } catch { setPwdMsg({ text: t("networkError"), ok: false }); }
  };

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t("settings")}</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">{t("managePrefs")}</p>
      </div>

      {/* Guest banner */}
      {isGuest && (
        <div className="flex items-start gap-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl px-5 py-4">
          <span className="text-xl">🔒</span>
          <div>
            <p className="text-sm font-medium text-amber-800 dark:text-amber-300">{t("guestModeBanner")}</p>
            <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">{t("guestModeDesc")}</p>
          </div>
        </div>
      )}

      {/* 主题设置 */}
      <section className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl p-6 shadow-sm space-y-4">
        <h2 className="font-semibold text-gray-900 dark:text-gray-100">{t("appearance")}</h2>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => setTheme("light")}
            className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-colors ${
              theme === "light"
                ? "border-blue-600 bg-blue-50 dark:bg-blue-900/30"
                : "border-gray-200 dark:border-gray-600 hover:border-gray-300"
            }`}
          >
            <span className="text-2xl">☀️</span>
            <div className="text-left">
              <div className="font-medium text-sm text-gray-900 dark:text-gray-100">{t("lightTheme")}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">{t("themeSubLight")}</div>
            </div>
            {theme === "light" && <span className="ml-auto text-blue-600 text-sm">✓</span>}
          </button>
          <button
            onClick={() => setTheme("dark")}
            className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-colors ${
              theme === "dark"
                ? "border-blue-600 bg-blue-50 dark:bg-blue-900/30"
                : "border-gray-200 dark:border-gray-600 hover:border-gray-300"
            }`}
          >
            <span className="text-2xl">🌙</span>
            <div className="text-left">
              <div className="font-medium text-sm text-gray-900 dark:text-gray-100">{t("darkTheme")}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">{t("themeSubDark")}</div>
            </div>
            {theme === "dark" && <span className="ml-auto text-blue-600 text-sm">✓</span>}
          </button>
        </div>
      </section>

      {/* 通知设置 */}
      <section className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl p-6 shadow-sm space-y-4">
        <h2 className="font-semibold text-gray-900 dark:text-gray-100">{t("notifications")}</h2>
        <div className="space-y-3">
          {[
            { key: "replies", labelKey: "notifReplies", descKey: "notifRepliesDesc" },
            { key: "likes", labelKey: "notifLikes", descKey: "notifLikesDesc" },
            { key: "follows", labelKey: "notifFollows", descKey: "notifFollowsDesc" },
            { key: "system", labelKey: "notifSystem", descKey: "notifSystemDesc" },
          ].map((item) => (
            <div key={item.key} className="flex items-center justify-between py-2">
              <div>
                <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{t(item.labelKey as any)}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">{t(item.descKey as any)}</div>
              </div>
              <button
                onClick={() => updateNotification(item.key, !notifications[item.key as keyof typeof notifications])}
                className={`relative w-10 h-6 rounded-full transition-colors ${
                  notifications[item.key as keyof typeof notifications]
                    ? "bg-blue-600"
                    : "bg-gray-300 dark:bg-gray-600"
                }`}
              >
                <span
                  className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                    notifications[item.key as keyof typeof notifications]
                      ? "left-4"
                      : "left-0.5"
                  }`}
                />
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* 账户安全 */}
      {!isGuest && (
      <section className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl p-6 shadow-sm space-y-4">
        <h2 className="font-semibold text-gray-900 dark:text-gray-100">{t("security")}</h2>
        {!user && <p className="text-xs text-yellow-600">{t("loginRequired")}</p>}
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t("currentPassword")}</label>
            <input
              type="password"
              value={currentPwd}
              onChange={(e) => setCurrentPwd(e.target.value)}
              placeholder={t("enterCurrentPwd")}
              className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t("newPassword")}</label>
            <input
              type="password"
              value={newPwd}
              onChange={(e) => setNewPwd(e.target.value)}
              placeholder={t("enterNewPwd")}
              className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t("confirmNewPassword")}</label>
            <input
              type="password"
              value={confirmPwd}
              onChange={(e) => setConfirmPwd(e.target.value)}
              placeholder={t("enterNewPwdConfirm")}
              className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          {pwdMsg && (
            <p className={`text-sm ${pwdMsg.ok ? "text-green-600" : "text-red-600"}`}>
              {pwdMsg.ok ? "✓ " : "✗ "}{pwdMsg.text}
            </p>
          )}
          <button
            onClick={handleChangePassword}
            className="mt-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {t("changePassword")}
          </button>
        </div>
      </section>      )}

      {/* 语言设置 */}
      <section className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl p-6 shadow-sm space-y-4">
        <h2 className="font-semibold text-gray-900 dark:text-gray-100">{t("languageLabel")}</h2>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => language !== "zh" && toggleLanguage()}
            className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-colors ${
              language === "zh"
                ? "border-blue-600 bg-blue-50 dark:bg-blue-900/30"
                : "border-gray-200 dark:border-gray-600 hover:border-gray-300"
            }`}
          >
            <span className="text-2xl">🇨🇳</span>
            <div className="text-left">
              <div className="font-medium text-sm text-gray-900 dark:text-gray-100">{t("chineseOption")}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">{t("langSubZh")}</div>
            </div>
            {language === "zh" && <span className="ml-auto text-blue-600 text-sm">✓</span>}
          </button>
          <button
            onClick={() => language !== "en" && toggleLanguage()}
            className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-colors ${
              language === "en"
                ? "border-blue-600 bg-blue-50 dark:bg-blue-900/30"
                : "border-gray-200 dark:border-gray-600 hover:border-gray-300"
            }`}
          >
            <span className="text-2xl">🇬🇧</span>
            <div className="text-left">
              <div className="font-medium text-sm text-gray-900 dark:text-gray-100">{t("englishOption")}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">{t("langSubEn")}</div>
            </div>
            {language === "en" && <span className="ml-auto text-blue-600 text-sm">✓</span>}
          </button>
        </div>
      </section>

      {/* 账号管理 */}
      <section className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl p-6 shadow-sm space-y-3">
        <h2 className="font-semibold text-gray-900 dark:text-gray-100">{t("accountManagement")}</h2>
        {user && (
          <div className="flex items-center gap-3 py-2 border-b border-gray-100 dark:border-gray-700">
            <div className="w-9 h-9 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 flex items-center justify-center text-sm font-bold">
              {user.username[0]}
            </div>
            <div>
              <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{user.username}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">{isGuest ? t("loggedInAsGuest") : t("loggedInAs")}</div>
            </div>
          </div>
        )}
        <button
          onClick={() => router.push("/login")}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-600 hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors text-left"
        >
          <span className="text-lg">🔄</span>
          <div>
            <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{t("switchAccountBtn")}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">{t("switchAccountDesc")}</div>
          </div>
        </button>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-600 hover:border-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-left"
        >
          <span className="text-lg">🚪</span>
          <div>
            <div className="text-sm font-medium text-red-600 dark:text-red-400">{t("logoutBtn")}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">{t("logoutDesc")}</div>
          </div>
        </button>
      </section>
    </div>
  );
}
