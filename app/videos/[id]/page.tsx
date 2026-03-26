"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "../../context/AuthContext";
import { useLanguage } from "../../context/LanguageContext";

interface Video {
  _id: string;
  title: string;
  titleEn?: string;
  uploader: string;
  uploaderEn?: string;
  coverImage: string;
  videoUrl: string;
  content: string;
  contentEn?: string;
  author: string;
  authorId: string;
  isVisible?: boolean;
  viewCount: number;
  createdAt: string;
}

interface Comment {
  _id: string;
  videoId: string;
  userId: string;
  username: string;
  content: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
}

// 检查是否是管理员
function isAdmin(userId: string | undefined): boolean {
  return userId === "offline_admin";
}

export default function VideoDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user, authFetch, isGuest } = useAuth();
  const { t, language } = useLanguage();
  const videoId = params.id as string;

  const [video, setVideo] = useState<Video | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<"notfound" | "error" | null>(null);
  const [commentContent, setCommentContent] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [bookmarkLoading, setBookmarkLoading] = useState(false);
  const [adminActionLoading, setAdminActionLoading] = useState(false);

  const isUserAdmin = isAdmin(user?.userId);

  useEffect(() => {
    if (videoId) {
      fetchVideo();
      fetchComments();
      if (user) checkBookmark();
    }
  }, [videoId, user]);  // eslint-disable-line react-hooks/exhaustive-deps

  const fetchVideo = async () => {
    setFetchError(null);
    try {
      const response = await fetch(`/api/videos/${videoId}`);
      if (response.status === 404) {
        setFetchError("notfound");
        return;
      }
      if (!response.ok) {
        setFetchError("error");
        return;
      }
      const data = await response.json();
      setVideo(data);
    } catch {
      setFetchError("error");
    } finally {
      setLoading(false);
    }
  };

  const fetchComments = async () => {
    try {
      const response = await fetch(`/api/videos/${videoId}/comments`);
      const data = await response.json();
      setComments(Array.isArray(data) ? data : []);
    } catch {
      setComments([]);
    }
  };

  const checkBookmark = async () => {
    try {
      const response = await authFetch("/api/bookmarks");
      const bookmarks = await response.json();
      const found = bookmarks.some(
        (b: any) => b.itemId === videoId && b.itemType === "video"
      );
      setIsBookmarked(found);
    } catch {
      setIsBookmarked(false);
    }
  };

  const handleToggleBookmark = async () => {
    if (!video || isGuest) return;

    setBookmarkLoading(true);
    try {
      if (isBookmarked) {
        // Remove bookmark
        const response = await authFetch(`/api/bookmarks/${videoId}?type=video`, {
          method: "DELETE",
        });
        if (response.ok) setIsBookmarked(false);
      } else {
        // Add bookmark
        const displayTitle = language === "en" && video.titleEn ? video.titleEn : video.title;
        const response = await authFetch("/api/bookmarks", {
          method: "POST",
          body: JSON.stringify({
            itemId: videoId,
            itemType: "video",
            title: displayTitle,
            subtitle: video.uploader,
            emoji: "🎬",
          }),
        });
        if (response.ok) setIsBookmarked(true);
      }
    } catch {} finally {
      setBookmarkLoading(false);
    }
  };

  const handleSubmitComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentContent.trim()) return;

    setSubmittingComment(true);
    try {
      const response = await authFetch(`/api/videos/${videoId}/comments`, {
        method: "POST",
        body: JSON.stringify({ content: commentContent.trim() }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to post comment");
      }

      setCommentContent("");
      fetchComments();
    } catch (error: any) {
      alert(error.message || "Failed to post comment");
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleToggleVisibility = async () => {
    if (!video || !isUserAdmin) return;

    setAdminActionLoading(true);
    try {
      const response = await authFetch(`/api/videos/${videoId}`, {
        method: "PUT",
        body: JSON.stringify({ isVisible: video.isVisible !== false ? false : true }),
      });

      if (response.ok) {
        fetchVideo();
      }
    } catch {} finally {
      setAdminActionLoading(false);
    }
  };

  const handleDeleteVideo = async () => {
    if (!video || !isUserAdmin) return;

    if (!confirm(t("adminDeleteConfirm"))) return;

    setAdminActionLoading(true);
    try {
      const response = await authFetch(`/api/videos/${videoId}`, {
        method: "DELETE",
      });

      if (response.ok) {
        router.push("/videos");
      }
    } catch {} finally {
      setAdminActionLoading(false);
    }
  };

  // Extract video embed URL for common platforms
  const getEmbedUrl = (url: string): string | null => {
    // Bilibili
    const biliMatch = url.match(/bilibili\.com\/video\/(BV[^/?]+)/);
    if (biliMatch) {
      return `https://player.bilibili.com/player.html?bvid=${biliMatch[1]}&high_quality=1`;
    }
    // YouTube
    const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&?]+)/);
    if (ytMatch) {
      return `https://www.youtube.com/embed/${ytMatch[1]}`;
    }
    return null;
  };

  if (loading) return <p className="text-center text-gray-500">{t("loading")}</p>;
  if (fetchError === "notfound") return (
    <div className="text-center py-20">
      <p className="text-gray-500 mb-4">{language === "zh" ? "视频不存在" : "Video not found"}</p>
      <Link href="/videos" className="text-blue-600 hover:underline">{language === "zh" ? "← 返回视频列表" : "← Back to Videos"}</Link>
    </div>
  );
  if (fetchError === "error" || !video) return (
    <div className="text-center py-20">
      <p className="text-gray-500 mb-4">{language === "zh" ? "加载失败，请稍后重试" : "Failed to load. Please try again."}</p>
      <div className="flex gap-4 justify-center">
        <button onClick={() => { setLoading(true); fetchVideo(); }} className="text-blue-600 hover:underline">
          {language === "zh" ? "重试" : "Retry"}
        </button>
        <Link href="/videos" className="text-gray-500 hover:underline">{language === "zh" ? "← 返回视频列表" : "← Back to Videos"}</Link>
      </div>
    </div>
  );

  const displayTitle = language === "en" && video.titleEn ? video.titleEn : video.title;
  const displayUploader = language === "en" && video.uploaderEn ? video.uploaderEn : video.uploader;
  const displayContent = language === "en" && video.contentEn ? video.contentEn : video.content;
  const dateLocale = language === "en" ? "en-US" : "zh-CN";
  const isHidden = video.isVisible === false;
  const embedUrl = getEmbedUrl(video.videoUrl);

  return (
    <div>
      {/* Back Button */}
      <Link href="/videos" className="text-blue-600 hover:underline mb-6 inline-block">
        {language === "zh" ? "← 返回视频列表" : "← Back to Videos"}
      </Link>

      {/* Video Content */}
      <div className={`bg-white dark:bg-gray-800 border rounded-lg overflow-hidden mb-8 relative ${
        isHidden ? "border-red-300 dark:border-red-700" : "border-gray-200 dark:border-gray-700"
      }`}>
        {/* Hidden Badge */}
        {isHidden && (
          <div className="absolute top-4 right-4 z-10">
            <span className="text-sm px-3 py-1 rounded-full bg-red-100 text-red-700 border border-red-200 font-medium">
              {t("isHidden")}
            </span>
          </div>
        )}

        {/* Video Player */}
        <div className="relative aspect-video bg-black">
          {embedUrl ? (
            <iframe
              src={embedUrl}
              className="w-full h-full"
              allowFullScreen
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            />
          ) : (
            <a
              href={video.videoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full h-full flex flex-col items-center justify-center text-white hover:bg-gray-900 transition"
            >
              <img
                src={video.coverImage}
                alt={displayTitle}
                className="absolute inset-0 w-full h-full object-cover opacity-50"
              />
              <div className="relative z-10 text-center">
                <div className="w-20 h-20 rounded-full bg-white/20 flex items-center justify-center mb-4 mx-auto">
                  <svg className="w-10 h-10 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </div>
                <p className="text-lg font-medium">{language === "zh" ? "点击跳转观看视频" : "Click to watch video"}</p>
              </div>
            </a>
          )}
        </div>

        {/* Video Info */}
        <div className="p-6">
          <div className="flex items-start justify-between gap-4 mb-4">
            <h1 className="text-2xl font-bold">{displayTitle}</h1>
            {/* Bookmark Button */}
            {!isGuest && (
              <button
                onClick={handleToggleBookmark}
                disabled={bookmarkLoading}
                className={`flex-shrink-0 px-4 py-2 rounded-lg font-medium transition ${
                  isBookmarked
                    ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                    : "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600"
                } disabled:opacity-50`}
              >
                {isBookmarked ? "⭐" : "☆"} {language === "zh" ? "收藏" : "Bookmark"}
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500 mb-4">
            <span>👤 {displayUploader}</span>
            <span>👁 {video.viewCount || 0} {language === "zh" ? "次观看" : "views"}</span>
            <span>🕐 {new Date(video.createdAt).toLocaleString(dateLocale)}</span>
          </div>

          <div className="prose dark:prose-invert max-w-none">
            <p className="text-gray-700 dark:text-gray-200 whitespace-pre-wrap">{displayContent}</p>
          </div>

          {/* External Link */}
          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
            <a
              href={video.videoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline text-sm"
            >
              🔗 {language === "zh" ? "在新窗口打开原视频链接" : "Open original video link in new window"}
            </a>
          </div>

          {/* Admin Actions */}
          {isUserAdmin && (
            <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-600">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-sm font-semibold text-purple-600 dark:text-purple-400">🛡️ {t("adminPanel")}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link
                  href={`/videos/new?id=${videoId}`}
                  className="px-4 py-2 rounded-lg font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 hover:bg-blue-200 transition"
                >
                  {language === "zh" ? "编辑" : "Edit"}
                </Link>
                <button
                  onClick={handleToggleVisibility}
                  disabled={adminActionLoading}
                  className={`px-4 py-2 rounded-lg font-medium transition disabled:opacity-50 ${
                    isHidden
                      ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 hover:bg-green-200"
                      : "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 hover:bg-yellow-200"
                  }`}
                >
                  {isHidden ? t("setVisible") : t("setHidden")}
                </button>
                <button
                  onClick={handleDeleteVideo}
                  disabled={adminActionLoading}
                  className="px-4 py-2 rounded-lg font-medium bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 hover:bg-red-200 transition disabled:opacity-50"
                >
                  {language === "zh" ? "删除" : "Delete"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Comments Section */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
        <h2 className="text-xl font-bold mb-6">💬 {language === "zh" ? "评论" : "Comments"} ({comments.length})</h2>

        {/* Comment Form */}
        {isGuest ? (
          <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 text-center mb-6">
            <p className="text-gray-500 text-sm">{language === "zh" ? "登录后可以发表评论" : "Log in to post comments"}</p>
            <div className="flex gap-4 justify-center mt-2">
              <Link href="/login" className="text-blue-600 hover:underline text-sm">{t("loginLink")}</Link>
              <span className="text-gray-300">|</span>
              <Link href="/register" className="text-blue-600 hover:underline text-sm">{t("registerLink")}</Link>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmitComment} className="mb-6">
            <textarea
              value={commentContent}
              onChange={(e) => setCommentContent(e.target.value)}
              placeholder={language === "zh" ? "发表你的看法..." : "Share your thoughts..."}
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
            <div className="flex justify-end mt-2">
              <button
                type="submit"
                disabled={!commentContent.trim() || submittingComment}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                {submittingComment ? t("loading") : (language === "zh" ? "发表评论" : "Post Comment")}
              </button>
            </div>
          </form>
        )}

        {/* Comments List */}
        {comments.length === 0 ? (
          <p className="text-gray-500 text-center py-8">{language === "zh" ? "暂无评论，快来第一个评论吧！" : "No comments yet. Be the first to comment!"}</p>
        ) : (
          <div className="space-y-4">
            {comments.map((comment) => (
              <div key={comment._id} className="border-b border-gray-100 dark:border-gray-700 pb-4 last:border-0">
                <div className="flex justify-between items-start mb-2">
                  <span className="font-medium text-gray-900 dark:text-gray-100">{comment.username}</span>
                  <span className="text-xs text-gray-500">
                    {new Date(comment.createdAt).toLocaleString(dateLocale)}
                  </span>
                </div>
                <p className="text-gray-700 dark:text-gray-200">{comment.content}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
