"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
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
  linkUrl?: string;
  replies: number;
  createdAt: string;
}

export default function PostDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user, authFetch, isGuest } = useAuth();
  const { t, language } = useLanguage();
  const postId = params.id as string;

  const [post, setPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<"notfound" | "error" | null>(null);
  const [replyText, setReplyText] = useState("");
  const [replies, setReplies] = useState<any[]>([]);
  const [liked, setLiked] = useState(false);
  const [likeLoading, setLikeLoading] = useState(false);
  const [followed, setFollowed] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  // showEn = true means display English version (only when available)
  const [showEn, setShowEn] = useState(false);

  useEffect(() => {
    if (postId) {
      fetchPost();
      if (user) checkLiked();
    }
  }, [postId, user]);  // eslint-disable-line react-hooks/exhaustive-deps

  // When language changes, auto-switch display if translation exists
  useEffect(() => {
    if (language === "en" && post?.contentEn) setShowEn(true);
    else setShowEn(false);
  }, [language, post]);

  async function checkLiked() {
    try {
      const res = await authFetch("/api/likes");
      const data = await res.json();
      setLiked(Array.isArray(data) && data.some((l: any) => l.postId === postId));
    } catch {}
  }

  async function checkFollowed(authorUsername: string) {
    if (!user) return;
    try {
      const res = await authFetch("/api/follows");
      const data = await res.json();
      setFollowed(Array.isArray(data) && data.some((f: any) => f.followingUsername === authorUsername));
    } catch {}
  }

  async function handleFollow() {
    if (!post || followLoading) return;
    setFollowLoading(true);
    try {
      if (followed) {
        await authFetch(`/api/follows/${encodeURIComponent(post.author)}`, { method: "DELETE" });
        setFollowed(false);
      } else {
        await authFetch("/api/follows", {
          method: "POST",
          body: JSON.stringify({ username: post.author }),
        });
        setFollowed(true);
      }
    } catch {}
    finally { setFollowLoading(false); }
  }

  const fetchPost = async () => {
    setFetchError(null);
    try {
      // Use authFetch so the Bearer token is always included
      const response = await authFetch(`/api/posts/${postId}`);
      if (response.status === 404) {
        setFetchError("notfound");
        return;
      }
      if (!response.ok) {
        setFetchError("error");
        return;
      }
      const data = await response.json();
      setPost(data);
      fetchReplies();
      if (user) checkFollowed(data.author);
    } catch {
      setFetchError("error");
    } finally {
      setLoading(false);
    }
  };

  const fetchReplies = async () => {
    try {
      const response = await fetch(`/api/replies?postId=${postId}`);
      const data = await response.json();
      setReplies(data);
    } catch (error) {
      console.error("获取回复失败:", error);
    }
  };

  async function handleLike() {
    // Allow all users to like
    if (!post || likeLoading) return;
    setLikeLoading(true);
    try {
      if (liked) {
        await authFetch(`/api/likes/${postId}`, { method: "DELETE" });
        setLiked(false);
      } else {
        await authFetch("/api/likes", {
          method: "POST",
          body: JSON.stringify({
            postId,
            title: post.title,
            author: post.author,
            category: post.category,
            createdAt: post.createdAt,
          }),
        });
        setLiked(true);
      }
    } catch {}
    finally { setLikeLoading(false); }
  }

  const handleReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim()) return;
    try {
      const response = await authFetch("/api/replies", {
        method: "POST",
        body: JSON.stringify({ postId, content: replyText, author: user?.username ?? "匿名用户" }),
      });
      if (!response.ok) throw new Error(t("replyFailed"));
      setReplyText("");
      fetchReplies();
      fetchPost();
    } catch { alert(t("replyFailed")); }
  };

  async function handleDelete() {
    if (!post || deleteLoading) return;
    const confirmMsg = language === "zh"
      ? "确定要删除这篇帖子吗？此操作不可恢复。"
      : "Are you sure you want to delete this post? This action cannot be undone.";
    if (!confirm(confirmMsg)) return;

    setDeleteLoading(true);
    try {
      const response = await authFetch(`/api/posts/${postId}`, { method: "DELETE" });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "删除失败");
      }
      router.push("/forum");
    } catch (error: any) {
      alert(error.message || (language === "zh" ? "删除失败" : "Delete failed"));
    } finally {
      setDeleteLoading(false);
    }
  }

  // 判断是否有删除权限
  const canDelete = !isGuest && post && (user?.username === post.author || user?.isAdmin);

  if (loading) return <p className="text-center text-gray-500">{t("loading")}</p>;
  if (fetchError === "notfound") return (
    <div className="text-center py-20">
      <p className="text-gray-500 mb-4">{t("postNotFound")}</p>
      <Link href="/forum" className="text-blue-600 hover:underline">{t("backToForum")}</Link>
    </div>
  );
  if (fetchError === "error" || !post) return (
    <div className="text-center py-20">
      <p className="text-gray-500 mb-4">{language === "zh" ? "加载失败，请稍后重试" : "Failed to load. Please try again."}</p>
      <div className="flex gap-4 justify-center">
        <button onClick={() => { setLoading(true); fetchPost(); }} className="text-blue-600 hover:underline">
          {language === "zh" ? "重试" : "Retry"}
        </button>
        <Link href="/forum" className="text-gray-500 hover:underline">{t("backToForum")}</Link>
      </div>
    </div>
  );

  const hasEnglish = !!(post.titleEn && post.contentEn);
  const displayTitle = showEn && post.titleEn ? post.titleEn : post.title;
  const displayContent = showEn && post.contentEn ? post.contentEn : post.content;
  const dateLocale = language === "en" ? "en-US" : "zh-CN";
  const hasLink = !!(post.linkUrl && post.linkUrl.trim());

  return (
    <div>
      {/* Back Button */}
      <Link href="/forum" className="text-blue-600 hover:underline mb-6 inline-block">
        {t("backToForum")}
      </Link>

      {/* Post Content */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-8 mb-8">
        <div className="mb-4">
          <div className="flex items-start justify-between gap-4 mb-2">
            <h1 className="text-3xl font-bold">{displayTitle}</h1>
            {hasEnglish && (
              <button
                onClick={() => setShowEn((prev) => !prev)}
                className="flex-shrink-0 px-3 py-1 text-xs rounded-full border border-blue-400 text-blue-600 hover:bg-blue-50 transition"
              >
                {showEn ? t("viewInChinese") : t("viewInEnglish")}
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500">
            <span>👤 {post.author}</span>
            {/* Follow button – only for logged-in users viewing someone else’s post */}
            {!isGuest && user?.username !== post.author && (
              <button
                onClick={handleFollow}
                disabled={followLoading}
                className={`flex items-center gap-1 px-3 py-0.5 rounded-full border text-xs font-medium transition-all disabled:opacity-50 ${
                  followed
                    ? "bg-blue-50 border-blue-300 text-blue-600"
                    : "bg-white dark:bg-gray-700 border-gray-300 text-gray-500 hover:border-blue-300 hover:text-blue-500"
                }`}
              >
                {followed ? `✔ ${t("followingState")}` : `+ ${t("follow")}`}
              </button>
            )}
            <span>🏷️ {post.category}</span>
            <span>🕐 {new Date(post.createdAt).toLocaleString(dateLocale)}</span>
            {hasLink && (
              <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-600 text-xs font-medium">
                {t("linkPostBadge")}
              </span>
            )}
          </div>
        </div>
        <hr className="my-6" />

        {/* Link content - iframe or regular content */}
        {hasLink ? (
          <div className="w-full" style={{ minHeight: "60vh" }}>
            <iframe
              src={post.linkUrl}
              className="w-full h-[60vh] border-0 rounded-lg"
              title={displayTitle}
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            />
          </div>
        ) : (
          <>
            <p className="text-gray-700 dark:text-gray-200 whitespace-pre-wrap leading-relaxed">
              {displayContent}
            </p>
            {!hasEnglish && language === "en" && (
              <p className="mt-4 text-xs text-gray-400 italic">{t("translationNotAvailable")}</p>
            )}
          </>
        )}

        <div className="mt-6 flex items-center gap-3 flex-wrap">
          {isGuest ? (
            <span className="text-sm text-gray-400 italic">{t("guestCannotLike")} &nbsp;·&nbsp; {t("guestCannotFollow")}</span>
          ) : (
          <button
            onClick={handleLike}
            disabled={likeLoading}
            className={`flex items-center gap-2 px-5 py-2 rounded-full border text-sm font-medium transition-all disabled:opacity-50 ${
              liked
                ? "bg-red-50 border-red-300 text-red-600"
                : "bg-white dark:bg-gray-700 border-gray-300 text-gray-500 hover:border-red-300 hover:text-red-500"
            }`}
          >
            {liked ? "❤️" : "🤍"} {liked ? t("liked") : t("like")}
          </button>
          )}
          {/* 删除按钮 */}
          {canDelete && (
            <button
              onClick={handleDelete}
              disabled={deleteLoading}
              className="flex items-center gap-2 px-5 py-2 rounded-full border text-sm font-medium transition-all disabled:opacity-50 bg-white dark:bg-gray-700 border-gray-300 text-gray-500 hover:border-red-300 hover:text-red-500"
            >
              🗑️ {language === "zh" ? "删除帖子" : "Delete Post"}
            </button>
          )}
        </div>
      </div>

      {/* Reply Section */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-8 mb-8">
        <h2 className="text-2xl font-bold mb-4">💬 {replies.length} {t("replyCount")}</h2>

        {/* Reply Form */}
        {isGuest ? (
          <div className="mb-8 pb-8 border-b border-gray-200 dark:border-gray-600 flex items-center gap-3 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
            <span className="text-2xl">🔒</span>
            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-200">{t("guestCannotReply")}</p>
              <p className="text-xs text-gray-400">
                <a href="/login" className="text-blue-600 hover:underline">{t("loginLink")}</a>
                {" "}{t("loginToParticipate")}
              </p>
            </div>
          </div>
        ) : (
        <form onSubmit={handleReply} className="mb-8 pb-8 border-b border-gray-200 dark:border-gray-600">
            <textarea
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder={t("replyPlaceholder")}
              rows={4}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4"
            />
            <button type="submit" disabled={!replyText.trim()}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 font-bold disabled:opacity-50">
              {t("postReply")}
            </button>
          </form>
        )}

        {/* Replies List */}
        {replies.length === 0 ? (
          <p className="text-gray-500 text-center py-8">{t("noReplies")}</p>
        ) : (
          <div className="space-y-6">
            {replies.map((reply) => (
              <div key={reply._id} className="border-l-4 border-blue-400 pl-4">
                <div className="flex justify-between items-start mb-2">
                  <span className="font-bold text-blue-600">{reply.author}</span>
                  <span className="text-xs text-gray-500">
                    {new Date(reply.createdAt).toLocaleString(dateLocale)}
                  </span>
                </div>
                <p className="text-gray-700 dark:text-gray-200">{reply.content}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}