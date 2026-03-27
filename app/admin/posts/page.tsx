"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "../../context/AuthContext";
import { useLanguage } from "../../context/LanguageContext";

interface Post {
  _id: string;
  title: string;
  titleEn?: string;
  author: string;
  category: string;
  content: string;
  contentEn?: string;
  status: "approved" | "pending" | "rejected" | "hidden";
  createdAt: string;
  updatedAt?: string;
  replies: number;
  reviewedBy?: string;
  adminNote?: string;
}

interface Stats {
  total: number;
  approved: number;
  pending: number;
  rejected: number;
  hidden: number;
}

// 检查是否是管理员
function isAdmin(userId: string | undefined): boolean {
  return userId === "offline_admin";
}

const STATUS_LABELS: Record<string, { zh: string; en: string; color: string }> = {
  approved: { zh: "已上架", en: "Published", color: "bg-green-100 text-green-700 border border-green-200" },
  pending: { zh: "待审核", en: "Pending", color: "bg-yellow-100 text-yellow-700 border border-yellow-200" },
  rejected: { zh: "已拒绝", en: "Rejected", color: "bg-red-100 text-red-700 border border-red-200" },
  hidden: { zh: "已下架", en: "Hidden", color: "bg-gray-100 text-gray-700 border border-gray-200" },
};

const CATEGORY_LABELS: Record<string, { zh: string; en: string }> = {
  discussion: { zh: "讨论交流", en: "Discussion" },
  question: { zh: "问题求助", en: "Question" },
  share: { zh: "经验分享", en: "Share" },
  news: { zh: "新闻资讯", en: "News" },
};

export default function PostsAdminPage() {
  const { user, authFetch } = useAuth();
  const { t, language } = useLanguage();

  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<Stats>({ total: 0, approved: 0, pending: 0, rejected: 0, hidden: 0 });
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [adminNote, setAdminNote] = useState("");
  const [processing, setProcessing] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState("");

  const isUserAdmin = isAdmin(user?.userId);

  useEffect(() => {
    if (isUserAdmin) fetchPosts();
  }, [statusFilter, categoryFilter, page]);  // eslint-disable-line react-hooks/exhaustive-deps

  const fetchPosts = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.append("status", statusFilter);
      if (categoryFilter !== "all") params.append("category", categoryFilter);
      params.append("page", page.toString());

      const response = await authFetch(`/api/admin/posts?${params.toString()}`);
      const data = await response.json();
      setPosts(data.posts || []);
      setTotalPages(data.totalPages || 1);
      setStats(data.stats || stats);
    } catch (error) {
      console.error("获取帖子列表失败:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (post: Post, newStatus: string) => {
    setProcessing(true);
    try {
      const response = await authFetch(`/api/admin/posts/${post._id}`, {
        method: "PUT",
        body: JSON.stringify({ status: newStatus, adminNote }),
      });

      if (response.ok) {
        setSelectedPost(null);
        setAdminNote("");
        fetchPosts();
      }
    } catch (error) {
      console.error("更新状态失败:", error);
    } finally {
      setProcessing(false);
    }
  };

  const handleDelete = async (post: Post) => {
    if (!confirm(language === "zh" ? "确定要删除这篇帖子吗？相关的回复也会被删除，此操作不可恢复。" : "Delete this post and all replies? This cannot be undone.")) return;

    setProcessing(true);
    try {
      const response = await authFetch(`/api/admin/posts/${post._id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        setSelectedPost(null);
        fetchPosts();
      }
    } catch (error) {
      console.error("删除帖子失败:", error);
    } finally {
      setProcessing(false);
    }
  };

  const getStatusLabel = (status: string) => {
    const label = STATUS_LABELS[status];
    return language === "en" ? label?.en : label?.zh;
  };

  const getCategoryLabel = (category: string) => {
    const label = CATEGORY_LABELS[category];
    return language === "en" ? label?.en : label?.zh;
  };

  const filteredPosts = posts.filter(post => {
    if (!searchKeyword) return true;
    const keyword = searchKeyword.toLowerCase();
    return (
      post.title.toLowerCase().includes(keyword) ||
      post.titleEn?.toLowerCase().includes(keyword) ||
      post.author.toLowerCase().includes(keyword) ||
      post.content.toLowerCase().includes(keyword)
    );
  });

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
        📝 {language === "zh" ? "帖子管理" : "Posts Management"}
      </h1>

      {/* 统计卡片 */}
      <div className="grid grid-cols-5 gap-3 mb-6">
        <div
          className={`bg-white dark:bg-gray-800 border rounded-lg p-4 cursor-pointer hover:shadow-lg transition-shadow ${statusFilter === "all" ? "ring-2 ring-blue-500" : ""}`}
          onClick={() => { setStatusFilter("all"); setPage(1); }}
        >
          <div className="text-2xl font-bold text-blue-600">{stats.total}</div>
          <div className="text-sm text-gray-500">{language === "zh" ? "全部" : "All"}</div>
        </div>
        <div
          className={`bg-white dark:bg-gray-800 border rounded-lg p-4 cursor-pointer hover:shadow-lg transition-shadow ${statusFilter === "approved" ? "ring-2 ring-green-500" : ""}`}
          onClick={() => { setStatusFilter("approved"); setPage(1); }}
        >
          <div className="text-2xl font-bold text-green-600">{stats.approved}</div>
          <div className="text-sm text-gray-500">{language === "zh" ? "已上架" : "Published"}</div>
        </div>
        <div
          className={`bg-white dark:bg-gray-800 border rounded-lg p-4 cursor-pointer hover:shadow-lg transition-shadow ${statusFilter === "pending" ? "ring-2 ring-yellow-500" : ""}`}
          onClick={() => { setStatusFilter("pending"); setPage(1); }}
        >
          <div className="text-2xl font-bold text-yellow-600">{stats.pending}</div>
          <div className="text-sm text-gray-500">{language === "zh" ? "待审核" : "Pending"}</div>
        </div>
        <div
          className={`bg-white dark:bg-gray-800 border rounded-lg p-4 cursor-pointer hover:shadow-lg transition-shadow ${statusFilter === "hidden" ? "ring-2 ring-gray-500" : ""}`}
          onClick={() => { setStatusFilter("hidden"); setPage(1); }}
        >
          <div className="text-2xl font-bold text-gray-600">{stats.hidden}</div>
          <div className="text-sm text-gray-500">{language === "zh" ? "已下架" : "Hidden"}</div>
        </div>
        <div
          className={`bg-white dark:bg-gray-800 border rounded-lg p-4 cursor-pointer hover:shadow-lg transition-shadow ${statusFilter === "rejected" ? "ring-2 ring-red-500" : ""}`}
          onClick={() => { setStatusFilter("rejected"); setPage(1); }}
        >
          <div className="text-2xl font-bold text-red-600">{stats.rejected}</div>
          <div className="text-sm text-gray-500">{language === "zh" ? "已拒绝" : "Rejected"}</div>
        </div>
      </div>

      {/* 筛选和搜索 */}
      <div className="bg-white dark:bg-gray-800 border rounded-lg p-4 mb-6">
        <div className="flex flex-wrap gap-4 items-center">
          {/* 分类筛选 */}
          <select
            value={categoryFilter}
            onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 rounded-lg"
          >
            <option value="all">{language === "zh" ? "全部分类" : "All Categories"}</option>
            {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {language === "en" ? label.en : label.zh}
              </option>
            ))}
          </select>

          {/* 搜索框 */}
          <input
            type="text"
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            placeholder={language === "zh" ? "搜索标题、作者或内容..." : "Search title, author or content..."}
            className="flex-1 min-w-[200px] px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 rounded-lg"
          />
        </div>
      </div>

      {/* 帖子列表 */}
      {loading ? (
        <p className="text-center text-gray-500">{t("loading")}</p>
      ) : filteredPosts.length === 0 ? (
        <p className="text-center text-gray-500 py-8">
          {language === "zh" ? "暂无帖子" : "No posts found"}
        </p>
      ) : (
        <div className="space-y-3">
          {filteredPosts.map((post) => (
            <div
              key={post._id}
              className="bg-white dark:bg-gray-800 border rounded-lg p-4 hover:shadow-lg cursor-pointer transition-shadow"
              onClick={() => setSelectedPost(post)}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`px-2 py-0.5 rounded text-sm ${STATUS_LABELS[post.status]?.color}`}>
                      {getStatusLabel(post.status)}
                    </span>
                    <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-sm">
                      {getCategoryLabel(post.category)}
                    </span>
                  </div>
                  <h3 className="font-semibold text-lg truncate">
                    {language === "en" && post.titleEn ? post.titleEn : post.title}
                  </h3>
                  <p className="text-gray-500 text-sm mt-1 line-clamp-2">
                    {language === "en" && post.contentEn ? post.contentEn : post.content}
                  </p>
                  <div className="flex items-center gap-4 mt-2 text-sm text-gray-400">
                    <span>{language === "zh" ? "作者" : "Author"}: {post.author}</span>
                    <span>{language === "zh" ? "回复" : "Replies"}: {post.replies || 0}</span>
                    <span>{new Date(post.createdAt).toLocaleString(language === "en" ? "en-US" : "zh-CN")}</span>
                  </div>
                </div>
              </div>
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
      {selectedPost && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold">
                  {language === "zh" ? "帖子详情" : "Post Details"}
                </h2>
                <button
                  onClick={() => { setSelectedPost(null); setAdminNote(""); }}
                  className="text-gray-500 hover:text-gray-700 text-2xl"
                >
                  ×
                </button>
              </div>

              <div className="space-y-4">
                {/* 状态和分类 */}
                <div className="flex items-center gap-2">
                  <span className={`px-3 py-1 rounded ${STATUS_LABELS[selectedPost.status]?.color}`}>
                    {getStatusLabel(selectedPost.status)}
                  </span>
                  <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded">
                    {getCategoryLabel(selectedPost.category)}
                  </span>
                </div>

                {/* 标题 */}
                <div>
                  <span className="text-sm text-gray-500">{language === "zh" ? "标题" : "Title"}:</span>
                  <h3 className="text-lg font-semibold mt-1">{selectedPost.title}</h3>
                  {selectedPost.titleEn && (
                    <p className="text-gray-500 text-sm">{selectedPost.titleEn}</p>
                  )}
                </div>

                {/* 作者和时间 */}
                <div className="flex items-center gap-6 text-sm text-gray-500">
                  <span>{language === "zh" ? "作者" : "Author"}: <strong className="text-gray-700">{selectedPost.author}</strong></span>
                  <span>{language === "zh" ? "发布时间" : "Created"}: {new Date(selectedPost.createdAt).toLocaleString(language === "en" ? "en-US" : "zh-CN")}</span>
                </div>

                {/* 内容 */}
                <div>
                  <span className="text-sm text-gray-500">{language === "zh" ? "内容" : "Content"}:</span>
                  <div className="mt-1 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg whitespace-pre-wrap max-h-60 overflow-y-auto">
                    {language === "en" && selectedPost.contentEn ? selectedPost.contentEn : selectedPost.content}
                  </div>
                </div>

                {/* 管理备注 */}
                <div>
                  <label className="text-sm text-gray-500">{language === "zh" ? "管理备注" : "Admin Note"}:</label>
                  <textarea
                    value={adminNote}
                    onChange={(e) => setAdminNote(e.target.value)}
                    rows={2}
                    className="w-full mt-1 px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 rounded-lg"
                    placeholder={language === "zh" ? "可选填写管理备注..." : "Optional admin note..."}
                  />
                </div>

                {/* 操作按钮 */}
                <div className="flex flex-wrap gap-2 pt-4 border-t">
                  {/* 上架/下架按钮 */}
                  {selectedPost.status === "hidden" ? (
                    <button
                      onClick={() => handleStatusChange(selectedPost, "approved")}
                      disabled={processing}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                    >
                      {language === "zh" ? "↑ 上架" : "↑ Publish"}
                    </button>
                  ) : selectedPost.status === "approved" ? (
                    <button
                      onClick={() => handleStatusChange(selectedPost, "hidden")}
                      disabled={processing}
                      className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50"
                    >
                      {language === "zh" ? "↓ 下架" : "↓ Hide"}
                    </button>
                  ) : null}

                  {/* 审核按钮 */}
                  {selectedPost.status === "pending" && (
                    <>
                      <button
                        onClick={() => handleStatusChange(selectedPost, "approved")}
                        disabled={processing}
                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                      >
                        {language === "zh" ? "✓ 通过" : "✓ Approve"}
                      </button>
                      <button
                        onClick={() => handleStatusChange(selectedPost, "rejected")}
                        disabled={processing}
                        className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50"
                      >
                        {language === "zh" ? "✗ 拒绝" : "✗ Reject"}
                      </button>
                    </>
                  )}

                  {/* 重新上架（被拒绝的） */}
                  {selectedPost.status === "rejected" && (
                    <button
                      onClick={() => handleStatusChange(selectedPost, "approved")}
                      disabled={processing}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                    >
                      {language === "zh" ? "↑ 重新上架" : "↑ Republish"}
                    </button>
                  )}

                  {/* 删除按钮 */}
                  <button
                    onClick={() => handleDelete(selectedPost)}
                    disabled={processing}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 ml-auto"
                  >
                    {language === "zh" ? "🗑 删除" : "🗑 Delete"}
                  </button>
                </div>

                {/* 审核记录 */}
                {selectedPost.reviewedBy && (
                  <div className="text-sm text-gray-400 pt-2 border-t">
                    {language === "zh" ? "审核人" : "Reviewed by"}: {selectedPost.reviewedBy}
                    {selectedPost.adminNote && ` - ${selectedPost.adminNote}`}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
