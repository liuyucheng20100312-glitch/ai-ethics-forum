"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/app/context/AuthContext";
import { useLanguage } from "@/app/context/LanguageContext";

interface Feedback {
  _id: string;
  type: string;
  content: string;
  contact: string;
  authorId: string;
  authorName: string;
  status: string;
  createdAt: string;
  updatedAt?: string;
}

const TYPE_LABELS: Record<string, { icon: string; zh: string; en: string }> = {
  suggestion: { icon: "💡", zh: "功能建议", en: "Suggestion" },
  bug: { icon: "🐛", zh: "问题反馈", en: "Bug Report" },
  other: { icon: "📝", zh: "其他", en: "Other" },
};

const STATUS_LABELS: Record<string, { zh: string; en: string; color: string }> = {
  pending: { zh: "待处理", en: "Pending", color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" },
  read: { zh: "已读", en: "Read", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  resolved: { zh: "已解决", en: "Resolved", color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
};

// 检查是否是管理员
function isAdmin(userId: string | undefined): boolean {
  return userId === "offline_admin";
}

export default function AdminFeedbackPage() {
  const { user, authFetch } = useAuth();
  const { language } = useLanguage();
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  const isUserAdmin = isAdmin(user?.userId);

  useEffect(() => {
    if (isUserAdmin) fetchFeedbacks();
  }, [isUserAdmin]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchFeedbacks = async () => {
    try {
      const res = await authFetch("/api/feedback");
      const data = await res.json();
      setFeedbacks(data);
    } catch (error) {
      console.error("获取反馈失败:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (id: string, status: string) => {
    try {
      const res = await authFetch(`/api/feedback/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });

      if (res.ok) {
        setFeedbacks((prev) =>
          prev.map((f) => (f._id === id ? { ...f, status } : f))
        );
      }
    } catch (error) {
      console.error("更新状态失败:", error);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(language === "zh" ? "确定要删除这条反馈吗？" : "Are you sure you want to delete this feedback?")) {
      return;
    }

    try {
      const res = await authFetch(`/api/feedback/${id}`, {
        method: "DELETE",
      });

      if (res.ok) {
        setFeedbacks((prev) => prev.filter((f) => f._id !== id));
      }
    } catch (error) {
      console.error("删除反馈失败:", error);
    }
  };

  if (!isUserAdmin) {
    return (
      <div className="text-center py-20">
        <p className="text-gray-500">{language === "zh" ? "无权限访问此页面" : "Access denied"}</p>
      </div>
    );
  }

  const filteredFeedbacks = filter === "all"
    ? feedbacks
    : feedbacks.filter((f) => f.status === filter);

  const stats = {
    total: feedbacks.length,
    pending: feedbacks.filter((f) => f.status === "pending").length,
    read: feedbacks.filter((f) => f.status === "read").length,
    resolved: feedbacks.filter((f) => f.status === "resolved").length,
  };

  return (
    <div>
      <h1 className="text-3xl font-bold mb-2">
        📬 {language === "zh" ? "意见反馈管理" : "Feedback Management"}
      </h1>
      <p className="text-gray-500 mb-6">
        {language === "zh" ? "查看和管理用户提交的反馈意见" : "View and manage user feedback submissions"}
      </p>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 text-center">
          <div className="text-2xl font-bold text-gray-800 dark:text-gray-200">{stats.total}</div>
          <div className="text-sm text-gray-500">{language === "zh" ? "总计" : "Total"}</div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 text-center">
          <div className="text-2xl font-bold text-yellow-600">{stats.pending}</div>
          <div className="text-sm text-gray-500">{language === "zh" ? "待处理" : "Pending"}</div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 text-center">
          <div className="text-2xl font-bold text-blue-600">{stats.read}</div>
          <div className="text-sm text-gray-500">{language === "zh" ? "已读" : "Read"}</div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 text-center">
          <div className="text-2xl font-bold text-green-600">{stats.resolved}</div>
          <div className="text-sm text-gray-500">{language === "zh" ? "已解决" : "Resolved"}</div>
        </div>
      </div>

      {/* Filter */}
      <div className="flex gap-2 mb-6">
        {["all", "pending", "read", "resolved"].map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              filter === s
                ? "bg-blue-600 text-white"
                : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
            }`}
          >
            {s === "all"
              ? (language === "zh" ? "全部" : "All")
              : STATUS_LABELS[s][language === "zh" ? "zh" : "en"]}
          </button>
        ))}
      </div>

      {/* Feedback List */}
      {loading ? (
        <p className="text-center text-gray-500 py-8">{language === "zh" ? "加载中..." : "Loading..."}</p>
      ) : filteredFeedbacks.length === 0 ? (
        <p className="text-center text-gray-500 py-8">{language === "zh" ? "暂无反馈" : "No feedback yet"}</p>
      ) : (
        <div className="space-y-4">
          {filteredFeedbacks.map((feedback) => {
            const typeInfo = TYPE_LABELS[feedback.type] || TYPE_LABELS.other;
            const statusInfo = STATUS_LABELS[feedback.status] || STATUS_LABELS.pending;

            return (
              <div
                key={feedback._id}
                className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6"
              >
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{typeInfo.icon}</span>
                    <span className="font-medium text-gray-800 dark:text-gray-200">
                      {language === "zh" ? typeInfo.zh : typeInfo.en}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${statusInfo.color}`}>
                      {language === "zh" ? statusInfo.zh : statusInfo.en}
                    </span>
                  </div>
                  <span className="text-xs text-gray-500">
                    {new Date(feedback.createdAt).toLocaleString(language === "zh" ? "zh-CN" : "en-US")}
                  </span>
                </div>

                <p className="text-gray-700 dark:text-gray-300 mb-4 whitespace-pre-wrap">
                  {feedback.content}
                </p>

                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-4 text-gray-500">
                    <span>👤 {feedback.authorName}</span>
                    {feedback.contact && <span>📞 {feedback.contact}</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={feedback.status}
                      onChange={(e) => handleStatusChange(feedback._id, e.target.value)}
                      className="text-sm border border-gray-300 dark:border-gray-600 dark:bg-gray-700 rounded px-2 py-1"
                    >
                      <option value="pending">{language === "zh" ? "待处理" : "Pending"}</option>
                      <option value="read">{language === "zh" ? "已读" : "Read"}</option>
                      <option value="resolved">{language === "zh" ? "已解决" : "Resolved"}</option>
                    </select>
                    <button
                      onClick={() => handleDelete(feedback._id)}
                      className="text-red-500 hover:text-red-700 px-2 py-1"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
