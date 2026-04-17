"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "../../context/AuthContext";
import { useLanguage } from "../../context/LanguageContext";
import { isAdminUserId } from "@/lib/admin-auth";

interface ModerationRecord {
  _id: string;
  contentId: string;
  contentType: "post" | "reply" | "vote_comment" | "vote";
  author: string;
  content: string;
  sensitiveWords: Array<{ word: string; category: string; severity: string }>;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
  reviewedBy?: string;
  reviewedAt?: string;
  reviewNote?: string;
}

// 检查是否是管理员
const CONTENT_TYPE_LABELS: Record<string, { zh: string; en: string }> = {
  post: { zh: "帖子", en: "Post" },
  reply: { zh: "回复", en: "Reply" },
  vote_comment: { zh: "投票评论", en: "Vote Comment" },
  vote: { zh: "投票", en: "Vote" },
};

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-700 border border-yellow-200",
  approved: "bg-green-100 text-green-700 border border-green-200",
  rejected: "bg-red-100 text-red-700 border border-red-200",
};

export default function ModerationPage() {
  const { user, authFetch } = useAuth();
  const { t, language } = useLanguage();

  const [records, setRecords] = useState<ModerationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"pending" | "approved" | "rejected">("pending");
  const [contentTypeFilter, setContentTypeFilter] = useState<string>("all");
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedRecord, setSelectedRecord] = useState<ModerationRecord | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [processing, setProcessing] = useState(false);

  const isUserAdmin = isAdminUserId(user?.userId);

  useEffect(() => {
    if (isUserAdmin) fetchRecords();
  }, [statusFilter, contentTypeFilter, page]);  // eslint-disable-line react-hooks/exhaustive-deps

  const fetchRecords = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append("status", statusFilter);
      if (contentTypeFilter !== "all") params.append("contentType", contentTypeFilter);
      params.append("page", page.toString());

      const response = await authFetch(`/api/moderation?${params.toString()}`);
      const data = await response.json();
      setRecords(data.records || []);
      setTotal(data.total || 0);
      setTotalPages(data.totalPages || 1);
    } catch (error) {
      console.error("获取审核列表失败:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (record: ModerationRecord) => {
    setProcessing(true);
    try {
      const response = await authFetch(`/api/moderation/${record.contentId}`, {
        method: "PUT",
        body: JSON.stringify({ status: "approved", reviewNote }),
      });

      if (response.ok) {
        setSelectedRecord(null);
        setReviewNote("");
        fetchRecords();
      }
    } catch (error) {
      console.error("审核失败:", error);
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async (record: ModerationRecord) => {
    setProcessing(true);
    try {
      const response = await authFetch(`/api/moderation/${record.contentId}`, {
        method: "PUT",
        body: JSON.stringify({ status: "rejected", reviewNote }),
      });

      if (response.ok) {
        setSelectedRecord(null);
        setReviewNote("");
        fetchRecords();
      }
    } catch (error) {
      console.error("审核失败:", error);
    } finally {
      setProcessing(false);
    }
  };

  const handleDelete = async (record: ModerationRecord) => {
    if (!confirm(language === "zh" ? "确定要删除这条内容吗？此操作不可恢复。" : "Are you sure you want to delete? This cannot be undone.")) return;

    setProcessing(true);
    try {
      const response = await authFetch(`/api/moderation/${record.contentId}`, {
        method: "DELETE",
      });

      if (response.ok) {
        setSelectedRecord(null);
        fetchRecords();
      }
    } catch (error) {
      console.error("删除失败:", error);
    } finally {
      setProcessing(false);
    }
  };

  const getContentTypeLabel = (type: string) => {
    const labels = CONTENT_TYPE_LABELS[type];
    return language === "en" ? labels?.en : labels?.zh;
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "pending": return language === "zh" ? "待审核" : "Pending";
      case "approved": return language === "zh" ? "已通过" : "Approved";
      case "rejected": return language === "zh" ? "已拒绝" : "Rejected";
      default: return status;
    }
  };

  if (!isUserAdmin) {
    return (
      <div className="text-center py-20">
        <p className="text-gray-500">{language === "zh" ? "无权限访问此页面" : "Access denied"}</p>
        <Link href="/" className="text-blue-600 hover:underline mt-4 inline-block">{t("home")}</Link>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <Link href="/admin" className="text-blue-600 hover:underline">
          ← {language === "zh" ? "返回管理后台" : "Back to Admin"}
        </Link>
      </div>

      <h1 className="text-3xl font-bold mb-6">
        🔍 {language === "zh" ? "内容审核" : "Content Moderation"}
      </h1>

      {/* 统计 */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white dark:bg-gray-800 border rounded-lg p-4 cursor-pointer hover:shadow-lg" onClick={() => { setStatusFilter("pending"); setPage(1); }}>
          <div className="text-2xl font-bold text-yellow-600">
            {statusFilter === "pending" ? total : "..."}
          </div>
          <div className="text-sm text-gray-500">{language === "zh" ? "待审核" : "Pending"}</div>
        </div>
        <div className="bg-white dark:bg-gray-800 border rounded-lg p-4 cursor-pointer hover:shadow-lg" onClick={() => { setStatusFilter("approved"); setPage(1); }}>
          <div className="text-2xl font-bold text-green-600">
            {statusFilter === "approved" ? total : "..."}
          </div>
          <div className="text-sm text-gray-500">{language === "zh" ? "已通过" : "Approved"}</div>
        </div>
        <div className="bg-white dark:bg-gray-800 border rounded-lg p-4 cursor-pointer hover:shadow-lg" onClick={() => { setStatusFilter("rejected"); setPage(1); }}>
          <div className="text-2xl font-bold text-red-600">
            {statusFilter === "rejected" ? total : "..."}
          </div>
          <div className="text-sm text-gray-500">{language === "zh" ? "已拒绝" : "Rejected"}</div>
        </div>
      </div>

      {/* 筛选 */}
      <div className="bg-white dark:bg-gray-800 border rounded-lg p-4 mb-6">
        <div className="flex flex-wrap gap-4">
          {/* 状态筛选 */}
          <div className="flex gap-2">
            {["pending", "approved", "rejected"].map((s) => (
              <button
                key={s}
                onClick={() => { setStatusFilter(s as any); setPage(1); }}
                className={`px-4 py-2 rounded-lg font-medium ${
                  statusFilter === s
                    ? s === "pending" ? "bg-yellow-600 text-white"
                    : s === "approved" ? "bg-green-600 text-white"
                    : "bg-red-600 text-white"
                    : "bg-gray-100 dark:bg-gray-700"
                }`}
              >
                {getStatusLabel(s)}
              </button>
            ))}
          </div>

          {/* 内容类型筛选 */}
          <select
            value={contentTypeFilter}
            onChange={(e) => { setContentTypeFilter(e.target.value); setPage(1); }}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 rounded-lg"
          >
            <option value="all">{language === "zh" ? "全部类型" : "All Types"}</option>
            {Object.keys(CONTENT_TYPE_LABELS).map((type) => (
              <option key={type} value={type}>{getContentTypeLabel(type)}</option>
            ))}
          </select>
        </div>
      </div>

      {/* 列表 */}
      {loading ? (
        <p className="text-center text-gray-500">{t("loading")}</p>
      ) : records.length === 0 ? (
        <p className="text-center text-gray-500 py-8">
          {language === "zh" ? "暂无待审核内容" : "No content to review"}
        </p>
      ) : (
        <div className="space-y-4">
          {records.map((record) => (
            <div
              key={record._id}
              className="bg-white dark:bg-gray-800 border rounded-lg p-6 hover:shadow-lg cursor-pointer"
              onClick={() => setSelectedRecord(record)}
            >
              <div className="flex items-start justify-between gap-4 mb-3">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-sm">
                    {getContentTypeLabel(record.contentType)}
                  </span>
                  <span className={`px-2 py-1 rounded text-sm ${STATUS_COLORS[record.status]}`}>
                    {getStatusLabel(record.status)}
                  </span>
                </div>
                <span className="text-sm text-gray-500">
                  {new Date(record.createdAt).toLocaleString(language === "en" ? "en-US" : "zh-CN")}
                </span>
              </div>

              <p className="text-gray-700 dark:text-gray-200 line-clamp-3 mb-3">{record.content}</p>

              <div className="flex flex-wrap gap-2 mb-2">
                {record.sensitiveWords.map((sw, i) => (
                  <span key={i} className="px-2 py-1 bg-red-50 text-red-600 rounded text-sm border border-red-200">
                    {sw.word} ({sw.category})
                  </span>
                ))}
              </div>

              <div className="text-sm text-gray-500">
                {language === "zh" ? "作者" : "Author"}: {record.author}
              </div>

              {record.reviewedBy && (
                <div className="text-sm text-gray-400 mt-2 pt-2 border-t border-gray-100 dark:border-gray-600">
                  {language === "zh" ? "审核人" : "Reviewed by"}: {record.reviewedBy}
                  {record.reviewNote && ` - ${record.reviewNote}`}
                </div>
              )}
            </div>
          ))}

          {/* 分页 */}
          {totalPages > 1 && (
            <div className="flex justify-center gap-2 mt-6">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-4 py-2 border rounded-lg disabled:opacity-50"
              >
                {language === "zh" ? "上一页" : "Previous"}
              </button>
              <span className="px-4 py-2">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-4 py-2 border rounded-lg disabled:opacity-50"
              >
                {language === "zh" ? "下一页" : "Next"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* 详情弹窗 */}
      {selectedRecord && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold">
                  {language === "zh" ? "审核详情" : "Review Details"}
                </h2>
                <button
                  onClick={() => { setSelectedRecord(null); setReviewNote(""); }}
                  className="text-gray-500 hover:text-gray-700 text-2xl"
                >
                  ×
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <span className="text-sm text-gray-500">{language === "zh" ? "内容类型" : "Content Type"}:</span>
                  <span className="ml-2">{getContentTypeLabel(selectedRecord.contentType)}</span>
                </div>

                <div>
                  <span className="text-sm text-gray-500">{language === "zh" ? "作者" : "Author"}:</span>
                  <span className="ml-2">{selectedRecord.author}</span>
                </div>

                <div>
                  <span className="text-sm text-gray-500">{language === "zh" ? "检测到的敏感词" : "Detected Words"}:</span>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {selectedRecord.sensitiveWords.map((sw, i) => (
                      <span key={i} className="px-2 py-1 bg-red-50 text-red-600 rounded text-sm border border-red-200">
                        {sw.word} ({sw.category}, {sw.severity})
                      </span>
                    ))}
                  </div>
                </div>

                <div>
                  <span className="text-sm text-gray-500">{language === "zh" ? "内容" : "Content"}:</span>
                  <div className="mt-1 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg whitespace-pre-wrap">
                    {selectedRecord.content}
                  </div>
                </div>

                <div>
                  <label className="text-sm text-gray-500">{language === "zh" ? "审核备注" : "Review Note"}:</label>
                  <textarea
                    value={reviewNote}
                    onChange={(e) => setReviewNote(e.target.value)}
                    rows={2}
                    className="w-full mt-1 px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 rounded-lg"
                    placeholder={language === "zh" ? "可选填写审核意见..." : "Optional review note..."}
                  />
                </div>

                <div className="flex gap-2 pt-4">
                  {selectedRecord.status === "pending" && (
                    <>
                      <button
                        onClick={() => handleApprove(selectedRecord)}
                        disabled={processing}
                        className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                      >
                        {language === "zh" ? "✓ 通过" : "✓ Approve"}
                      </button>
                      <button
                        onClick={() => handleReject(selectedRecord)}
                        disabled={processing}
                        className="flex-1 px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 disabled:opacity-50"
                      >
                        {language === "zh" ? "✗ 拒绝" : "✗ Reject"}
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => handleDelete(selectedRecord)}
                    disabled={processing}
                    className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                  >
                    {language === "zh" ? "🗑 删除内容" : "🗑 Delete"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
