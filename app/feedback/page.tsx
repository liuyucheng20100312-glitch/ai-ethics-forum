"use client";

import { useState } from "react";
import { useAuth } from "@/app/context/AuthContext";
import { useLanguage } from "@/app/context/LanguageContext";

const FEEDBACK_TYPES = [
  { value: "suggestion", icon: "💡", labelZh: "功能建议", labelEn: "Suggestion" },
  { value: "bug", icon: "🐛", labelZh: "问题反馈", labelEn: "Bug Report" },
  { value: "other", icon: "📝", labelZh: "其他", labelEn: "Other" },
];

export default function FeedbackPage() {
  const { user, isGuest, authFetch } = useAuth();
  const { t, language } = useLanguage();
  const [type, setType] = useState("suggestion");
  const [content, setContent] = useState("");
  const [contact, setContact] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) {
      setError(language === "zh" ? "请填写反馈内容" : "Please enter your feedback");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await authFetch("/api/feedback", {
        method: "POST",
        body: JSON.stringify({ type, content, contact }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || (language === "zh" ? "提交失败" : "Submit failed"));
      }

      setSuccess(true);
      setContent("");
      setContact("");
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : (language === "zh" ? "提交失败" : "Submit failed"));
    } finally {
      setLoading(false);
    }
  };

  if (isGuest) {
    return (
      <div className="max-w-2xl mx-auto text-center py-24">
        <div className="text-5xl mb-4">🔒</div>
        <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-2">
          {language === "zh" ? "请先登录" : "Please Log In"}
        </h2>
        <p className="text-gray-500 dark:text-gray-400 mb-6">
          {language === "zh" ? "提交反馈需要登录账号" : "You need to log in to submit feedback"}
        </p>
        <div className="flex gap-3 justify-center">
          <a href="/login" className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 font-medium text-sm">
            {language === "zh" ? "登录" : "Log In"}
          </a>
          <a href="/register" className="border border-blue-600 text-blue-600 px-6 py-2 rounded-lg hover:bg-blue-50 font-medium text-sm">
            {language === "zh" ? "注册" : "Register"}
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold mb-2">
        📬 {language === "zh" ? "意见反馈" : "Feedback"}
      </h1>
      <p className="text-gray-500 mb-8">
        {language === "zh"
          ? "感谢您的宝贵意见，我们会认真对待每一条反馈"
          : "Thank you for your valuable feedback, we take every submission seriously"}
      </p>

      <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-8 space-y-6">
        {success && (
          <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded">
            ✅ {language === "zh" ? "反馈提交成功，感谢您的意见！" : "Feedback submitted successfully, thank you!"}
          </div>
        )}

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
            {error}
          </div>
        )}

        {/* Feedback Type */}
        <div>
          <label className="block text-sm font-bold text-gray-700 dark:text-gray-200 mb-3">
            {language === "zh" ? "反馈类型" : "Feedback Type"}
          </label>
          <div className="flex gap-3 flex-wrap">
            {FEEDBACK_TYPES.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => setType(item.value)}
                className={`px-4 py-2 rounded-lg border-2 font-medium transition-all ${
                  type === item.value
                    ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                    : "border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-gray-300"
                }`}
              >
                {item.icon} {language === "zh" ? item.labelZh : item.labelEn}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div>
          <label className="block text-sm font-bold text-gray-700 dark:text-gray-200 mb-2">
            {language === "zh" ? "反馈内容" : "Feedback Content"} *
          </label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={
              language === "zh"
                ? "请详细描述您的建议或遇到的问题..."
                : "Please describe your suggestion or issue in detail..."
            }
            rows={6}
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-xs text-gray-500 mt-1">{content.length}/500</p>
        </div>

        {/* Contact (optional) */}
        <div>
          <label className="block text-sm font-bold text-gray-700 dark:text-gray-200 mb-2">
            {language === "zh" ? "联系方式（选填）" : "Contact (optional)"}
          </label>
          <input
            type="text"
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            placeholder={
              language === "zh"
                ? "邮箱或手机号，方便我们回复您"
                : "Email or phone for us to reply"
            }
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* User Info */}
        <div>
          <label className="block text-sm font-bold text-gray-700 dark:text-gray-200 mb-2">
            {language === "zh" ? "提交账号" : "Submit as"}
          </label>
          <div className="w-full px-4 py-2 border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 rounded-lg text-gray-600 dark:text-gray-300 text-sm">
            {user?.username}
          </div>
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={loading || !content.trim()}
          className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 font-bold disabled:opacity-50 transition-colors"
        >
          {loading
            ? (language === "zh" ? "提交中..." : "Submitting...")
            : (language === "zh" ? "提交反馈" : "Submit Feedback")}
        </button>
      </form>
    </div>
  );
}
