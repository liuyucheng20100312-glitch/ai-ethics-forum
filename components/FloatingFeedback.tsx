"use client";

import { useState } from "react";
import { useAuth } from "@/app/context/AuthContext";
import { useLanguage } from "@/app/context/LanguageContext";

const FEEDBACK_TYPES = [
  { value: "suggestion", icon: "💡", labelZh: "功能建议", labelEn: "Suggestion" },
  { value: "bug", icon: "🐛", labelZh: "问题反馈", labelEn: "Bug Report" },
  { value: "other", icon: "📝", labelZh: "其他", labelEn: "Other" },
];

export default function FloatingFeedback() {
  const { user, isGuest, authFetch } = useAuth();
  const { language } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
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
      setTimeout(() => {
        setSuccess(false);
        setIsOpen(false);
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : (language === "zh" ? "提交失败" : "Submit failed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Floating Button */}
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg hover:shadow-xl transition-all flex items-center justify-center group"
        title={language === "zh" ? "意见反馈" : "Feedback"}
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
        </svg>
        <span className="absolute right-full mr-3 bg-gray-900 text-white text-sm px-3 py-1.5 rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
          {language === "zh" ? "意见反馈" : "Feedback"}
        </span>
      </button>

      {/* Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setIsOpen(false)} />
          <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                📬 {language === "zh" ? "意见反馈" : "Feedback"}
              </h2>
              <button
                onClick={() => setIsOpen(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Content */}
            <div className="p-6">
              {isGuest ? (
                <div className="text-center py-8">
                  <div className="text-4xl mb-4">🔒</div>
                  <p className="text-gray-600 dark:text-gray-400 mb-4">
                    {language === "zh" ? "请先登录后提交反馈" : "Please log in to submit feedback"}
                  </p>
                  <div className="flex gap-3 justify-center">
                    <a href="/login" className="bg-blue-600 text-white px-5 py-2 rounded-lg hover:bg-blue-700 font-medium">
                      {language === "zh" ? "登录" : "Log In"}
                    </a>
                    <a href="/register" className="border border-blue-600 text-blue-600 px-5 py-2 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 font-medium">
                      {language === "zh" ? "注册" : "Register"}
                    </a>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-5">
                  {success && (
                    <div className="bg-green-100 dark:bg-green-900/30 border border-green-400 dark:border-green-600 text-green-700 dark:text-green-300 px-4 py-3 rounded-lg">
                      ✅ {language === "zh" ? "反馈提交成功，感谢您的意见！" : "Feedback submitted successfully!"}
                    </div>
                  )}

                  {error && (
                    <div className="bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-600 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg">
                      {error}
                    </div>
                  )}

                  {/* Feedback Type */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      {language === "zh" ? "反馈类型" : "Feedback Type"}
                    </label>
                    <div className="flex gap-2 flex-wrap">
                      {FEEDBACK_TYPES.map((item) => (
                        <button
                          key={item.value}
                          type="button"
                          onClick={() => setType(item.value)}
                          className={`px-3 py-1.5 rounded-lg border text-sm font-medium transition-all ${
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
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      {language === "zh" ? "反馈内容" : "Feedback Content"} *
                    </label>
                    <textarea
                      value={content}
                      onChange={(e) => setContent(e.target.value)}
                      placeholder={
                        language === "zh"
                          ? "请详细描述您的建议或遇到的问题..."
                          : "Please describe your suggestion or issue..."
                      }
                      rows={4}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    />
                  </div>

                  {/* Contact */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      {language === "zh" ? "联系方式（选填）" : "Contact (optional)"}
                    </label>
                    <input
                      type="text"
                      value={contact}
                      onChange={(e) => setContact(e.target.value)}
                      placeholder={
                        language === "zh"
                          ? "邮箱或手机号"
                          : "Email or phone"
                      }
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    />
                  </div>

                  {/* Submit */}
                  <button
                    type="submit"
                    disabled={loading || !content.trim()}
                    className="w-full bg-blue-600 text-white py-2.5 rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50 transition-colors"
                  >
                    {loading
                      ? (language === "zh" ? "提交中..." : "Submitting...")
                      : (language === "zh" ? "提交反馈" : "Submit Feedback")}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
