"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useLanguage } from "./context/LanguageContext";

const REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

type Post = { _id: string; title: string; author?: string; category?: string; content?: string; createdAt?: string };
type Video = { _id: string; title: string; titleEn?: string; uploader: string; uploaderEn?: string; coverImage: string; videoUrl: string; viewCount: number };

const topics = [
  { labelZh: "AI伦理", labelEn: "AI Ethics", href: "/forum" },
  { labelZh: "AI创作", labelEn: "AI Creative", href: "/creative" },
  { labelZh: "AI工具开发", labelEn: "AI Tools", href: "/tools" },
  { labelZh: "未来科技", labelEn: "Future Tech", href: "/news" },
];

export default function Home() {
  const { t, language } = useLanguage();
  const [posts, setPosts] = useState<Post[]>([]);
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [videosLoading, setVideosLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchPosts = async () => {
    try {
      const res = await fetch("/api/posts");
      const data = await res.json();
      if (Array.isArray(data)) {
        setPosts(data.slice(0, 3));
        setLastUpdated(new Date());
      }
    } catch {
      // silently ignore; keep showing previous posts
    } finally {
      setLoading(false);
    }
  };

  const fetchVideos = async () => {
    try {
      const res = await fetch("/api/videos");
      const data = await res.json();
      if (Array.isArray(data)) {
        setVideos(data.slice(0, 4));
      }
    } catch {
      // silently ignore
    } finally {
      setVideosLoading(false);
    }
  };

  useEffect(() => {
    fetchPosts();
    fetchVideos();
    timerRef.current = setInterval(fetchPosts, REFRESH_INTERVAL_MS);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  const formatTime = (d: Date) => {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  return (
    <div className="space-y-10">
      {/* Hero */}
      <section className="bg-gradient-to-br from-blue-800 via-blue-700 to-blue-900 rounded-2xl p-10 text-white relative overflow-hidden">
        <div className="absolute -right-12 -top-12 w-56 h-56 rounded-full border-2 border-white/10" />
        <div className="absolute -right-4 -top-4 w-36 h-36 rounded-full border border-white/10" />

        <div className="relative flex items-start gap-6">
          <div className="shrink-0 hidden sm:block">
            <img src="/school-logo.png" alt="广东碧桂园学校" className="h-16 w-auto drop-shadow-lg" />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-medium bg-white/20 text-white px-2.5 py-0.5 rounded-full tracking-wide">{t("schoolName")}</span>
            </div>
            <h1 className="text-3xl font-bold mb-1">{t("forumTitle")}</h1>
            <p className="text-blue-200 text-sm mb-1">Guangdong Country Garden School</p>
            <p className="text-blue-200/80 text-sm mb-6">{t("forumSubtitle")}</p>
            <div className="flex gap-3">
              <Link href="/forum/new" className="bg-white text-blue-800 font-semibold px-5 py-2 rounded-lg hover:bg-blue-50 transition-colors text-sm shadow">
                {t("startDiscussion")}
              </Link>
              <Link href="/forum" className="border border-white/50 text-white font-semibold px-5 py-2 rounded-lg hover:bg-white/10 transition-colors text-sm">
                {t("browseForum")}
              </Link>
            </div>
          </div>
        </div>

        <div className="mt-8 pt-5 border-t border-white/20 flex items-center gap-2">
          <span className="text-white/60 text-xs">{t("motto")}</span>
          <span className="text-white/90 text-sm font-medium italic">&ldquo;明理、创新、立志、成人&rdquo;</span>
          <span className="mx-2 text-white/30">|</span>
          <span className="text-white/60 text-xs font-light tracking-wide">Wisdom · Innovation · Aspiration · Integrity</span>
        </div>
      </section>

      {/* 精选视频 */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100">
            🎬 {language === "zh" ? "精选视频" : "Featured Videos"}
          </h2>
          <Link href="/videos" className="text-sm text-blue-600 hover:underline">
            {language === "zh" ? "查看全部 →" : "View all →"}
          </Link>
        </div>

        {videosLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl overflow-hidden animate-pulse">
                <div className="aspect-video bg-gray-200 dark:bg-gray-700" />
                <div className="p-3">
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-2" />
                  <div className="h-3 bg-gray-100 dark:bg-gray-600 rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : videos.length === 0 ? null : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {videos.map((video) => {
              const displayTitle = language === "en" && video.titleEn ? video.titleEn : video.title;
              const displayUploader = language === "en" && video.uploaderEn ? video.uploaderEn : video.uploader;
              return (
                <Link key={video._id} href={`/videos/${video._id}`}>
                  <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl overflow-hidden shadow-sm hover:shadow-md hover:border-blue-200 dark:hover:border-blue-700 transition-all hover:-translate-y-0.5 group">
                    <div className="relative aspect-video bg-gray-100 dark:bg-gray-700">
                      <img src={video.coverImage} alt={displayTitle} className="w-full h-full object-cover" />
                      <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity">
                        <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center">
                          <svg className="w-6 h-6 text-blue-600 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M8 5v14l11-7z" />
                          </svg>
                        </div>
                      </div>
                      <div className="absolute bottom-1 right-1">
                        <span className="text-xs px-1.5 py-0.5 rounded bg-black/60 text-white">
                          👁 {video.viewCount || 0}
                        </span>
                      </div>
                    </div>
                    <div className="p-3">
                      <h3 className="font-semibold text-gray-900 dark:text-gray-100 line-clamp-2 text-sm mb-1">{displayTitle}</h3>
                      <p className="text-xs text-gray-400 dark:text-gray-500">{displayUploader}</p>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {/* 最新帖子 — live from DB */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100">{t("latestPosts")}</h2>
          <div className="flex items-center gap-3">
            {lastUpdated && (
              <span className="text-xs text-gray-400 dark:text-gray-500">
                {t("lastUpdated")} {formatTime(lastUpdated)} · {t("autoRefresh")} 5min
              </span>
            )}
            <button
              onClick={fetchPosts}
              disabled={loading}
              className="text-xs px-3 py-1 rounded-full border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
            >
              {loading ? "…" : t("refresh")}
            </button>
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl p-5 animate-pulse">
                <div className="h-4 bg-gray-200 dark:bg-gray-600 rounded w-3/4 mb-2" />
                <div className="h-3 bg-gray-100 dark:bg-gray-700 rounded w-1/2" />
              </div>
            ))}
          </div>
        ) : posts.length === 0 ? (
          <div className="text-center py-10 text-gray-400 dark:text-gray-500 text-sm">
            {t("noPostsYet")}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {posts.map((post) => (
              <Link
                key={post._id}
                href={`/post/${post._id}`}
                className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl p-5 shadow-sm hover:shadow-md hover:border-blue-200 dark:hover:border-blue-700 transition-all block hover:-translate-y-0.5"
              >
                {post.category && (
                  <span className="text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded-full mb-2 inline-block">
                    {post.category}
                  </span>
                )}
                <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-1 line-clamp-2">{post.title}</h3>
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  {post.author && `${post.author} · `}
                  {post.createdAt ? new Date(post.createdAt).toLocaleDateString(language === "zh" ? "zh-CN" : "en-US") : ""}
                </p>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* 推荐主题 */}
      <section>
        <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-4">
          {language === "zh" ? "推荐主题" : "Topics"}
        </h2>
        <div className="flex flex-wrap gap-3">
          {topics.map((topic, i) => (
            <Link key={i} href={topic.href}
              className="px-4 py-1.5 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-700 rounded-full text-sm font-medium hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
            >
              {language === "zh" ? topic.labelZh : topic.labelEn}
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
