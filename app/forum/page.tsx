"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import type { TranslationKey } from "../context/LanguageContext";

interface Post {
  _id: string;
  title: string;
  titleEn?: string;
  author: string;
  category: string;
  content: string;
  contentEn?: string;
  replies: number;
  createdAt: string;
}

// Map DB category values (always stored in Chinese) to translation keys
const CATEGORY_MAP: { value: string; key: TranslationKey }[] = [
  { value: "全部", key: "all" },
  { value: "AI安全", key: "catAiSafety" },
  { value: "隐私保护", key: "catPrivacy" },
  { value: "伦理责任", key: "catEthics" },
  { value: "学术讨论", key: "catAcademic" },
  { value: "社会影响", key: "catSocial" },
  { value: "创意想法", key: "catCreative" },
];

export default function ForumPage() {
  const { isGuest, user, authFetch } = useAuth();
  const { t, language } = useLanguage();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("全部");
  const [followingSet, setFollowingSet] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchPosts();
    if (!isGuest && user) fetchFollowing();
  }, [isGuest, user]);  // eslint-disable-line react-hooks/exhaustive-deps

  const fetchFollowing = async () => {
    try {
      const res = await authFetch("/api/follows");
      const data = await res.json();
      if (Array.isArray(data)) {
        setFollowingSet(new Set(data.map((f: { followingUsername: string }) => f.followingUsername)));
      }
    } catch {}
  };

  const fetchPosts = async () => {
    try {
      const response = await fetch("/api/posts");
      const data = await response.json();
      setPosts(Array.isArray(data) ? data : data.posts ?? []);
    } catch (error) {
      console.error("获取帖子失败:", error);
    } finally {
      setLoading(false);
    }
  };

  const rawFiltered = posts.filter((post) => {
    const titleToSearch = language === "en" && post.titleEn ? post.titleEn : post.title;
    const contentToSearch = language === "en" && post.contentEn ? post.contentEn : post.content;
    const matchesSearch =
      titleToSearch.toLowerCase().includes(searchTerm.toLowerCase()) ||
      contentToSearch.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === "全部" || post.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  // Prioritise followed users' posts
  const followedPosts = rawFiltered.filter((p) => followingSet.has(p.author));
  const otherPosts    = rawFiltered.filter((p) => !followingSet.has(p.author));
  const filteredPosts = followingSet.size > 0 ? [...followedPosts, ...otherPosts] : rawFiltered;

  function getCategoryLabel(zhValue: string): string {
    const entry = CATEGORY_MAP.find((c) => c.value === zhValue);
    return entry ? t(entry.key) : zhValue;
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-4">{t("forumDiscussion")}</h1>
        <div className="flex gap-4">
          <input
            type="text"
            placeholder={t("searchPlaceholder")}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {!isGuest && (
            <Link
              href="/forum/new"
              className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 font-bold whitespace-nowrap"
            >
              {t("newPost")}
            </Link>
          )}
        </div>
      </div>

      {/* Categories Filter */}
      <div className="mb-6 flex gap-2 flex-wrap">
        {CATEGORY_MAP.map(({ value, key }) => (
          <button
            key={value}
            onClick={() => setSelectedCategory(value)}
            className={`px-4 py-2 rounded-full font-semibold transition ${
              selectedCategory === value
                ? "bg-blue-600 text-white"
                : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600"
            }`}
          >
            {t(key)}
          </button>
        ))}
      </div>

      {/* Posts List */}
      {loading ? (
        <p className="text-center text-gray-500">{t("loading")}</p>
      ) : filteredPosts.length === 0 ? (
        <p className="text-center text-gray-500 py-8">{t("noPosts")}</p>
      ) : (
        <div className="space-y-4">
          {filteredPosts.map((post) => {
            const displayTitle = language === "en" && post.titleEn ? post.titleEn : post.title;
            const displayContent = language === "en" && post.contentEn ? post.contentEn : post.content;
            const isFollowed = followingSet.has(post.author);
            return (
              <Link key={post._id} href={`/post/${post._id}`}>
                <div className={`bg-white dark:bg-gray-800 border rounded-lg p-6 hover:shadow-lg hover:border-blue-400 transition cursor-pointer ${
                  isFollowed ? "border-blue-300 dark:border-blue-600" : "border-gray-200 dark:border-gray-700"
                }`}>
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <h3 className="text-xl font-bold text-blue-600">{displayTitle}</h3>
                    {isFollowed && (
                      <span className="flex-shrink-0 text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-200">
                        {t("followingBadge")}
                      </span>
                    )}
                  </div>
                  <p className="text-gray-600 dark:text-gray-300 mb-4 line-clamp-2">{displayContent}</p>
                  <div className="flex gap-4 text-sm text-gray-500 flex-wrap">
                    <span>👤 {post.author}</span>
                    <span>🏷️ {getCategoryLabel(post.category)}</span>
                    <span>💬 {post.replies} {t("repliesCount")}</span>
                    <span>🕐 {new Date(post.createdAt).toLocaleDateString(language === "en" ? "en-US" : "zh-CN")}</span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
