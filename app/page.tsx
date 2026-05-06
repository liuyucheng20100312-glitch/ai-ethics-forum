"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useLanguage } from "./context/LanguageContext";

const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

type Post = {
  _id: string;
  title: string;
  author?: string;
  category?: string;
  content?: string;
  createdAt?: string;
};

type Video = {
  _id: string;
  title: string;
  titleEn?: string;
  uploader: string;
  uploaderEn?: string;
  coverImage: string;
  videoUrl: string;
  viewCount: number;
};

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
      const response = await fetch("/api/posts?limit=3");
      const data = await response.json();
      const list: Post[] = Array.isArray(data) ? data : (data.posts ?? []);
      setPosts(list.slice(0, 3));
      setLastUpdated(new Date());
    } catch {
      // keep previous posts
    } finally {
      setLoading(false);
    }
  };

  const fetchVideos = async () => {
    try {
      const response = await fetch("/api/videos");
      const data = await response.json();
      if (Array.isArray(data)) {
        setVideos(data.slice(0, 4));
      }
    } catch {
      // ignore for now
    } finally {
      setVideosLoading(false);
    }
  };

  useEffect(() => {
    fetchPosts();
    fetchVideos();
    timerRef.current = setInterval(fetchPosts, REFRESH_INTERVAL_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const formatTime = (date: Date) => {
    const pad = (value: number) => String(value).padStart(2, "0");
    return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  };

  return (
    <div className="space-y-10">
      <section className="brand-warm-gradient relative overflow-hidden rounded-2xl p-10 text-slate-800 shadow-sm">
        <div className="absolute inset-0 bg-white/8" />
        <div className="absolute -right-12 -top-12 h-56 w-56 rounded-full border-2 border-white/25" />
        <div className="absolute -right-4 -top-4 h-36 w-36 rounded-full border border-white/35" />

        <div className="relative flex items-start gap-6">
          <div className="hidden shrink-0 sm:block">
            <img src="/school-logo.png" alt="广东碧桂园学校" className="h-16 w-auto drop-shadow-lg" />
          </div>
          <div>
            <div className="mb-1 flex items-center gap-2">
              <span className="rounded-full bg-white/75 px-2.5 py-0.5 text-xs font-medium tracking-wide text-orange-700 shadow-sm">
                {t("schoolName")}
              </span>
            </div>
            <h1 className="mb-1 text-3xl font-bold">{t("forumTitle")}</h1>
            <p className="mb-1 text-sm text-slate-700">Guangdong Country Garden School</p>
            <p className="mb-6 text-sm text-slate-600">{t("forumSubtitle")}</p>
            <div className="flex gap-3">
              <Link href="/forum/new" className="rounded-lg bg-slate-900 px-5 py-2 text-sm font-semibold text-white shadow transition-colors hover:bg-slate-800">
                {t("startDiscussion")}
              </Link>
              <Link href="/forum" className="rounded-lg border border-slate-300 bg-white/55 px-5 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-white/75">
                {t("browseForum")}
              </Link>
            </div>
          </div>
        </div>

        <div className="relative mt-8 flex items-center gap-2 border-t border-white/45 pt-5">
          <span className="text-xs text-slate-500">{t("motto")}</span>
          <span className="text-sm font-medium italic text-slate-700">“明理、创新、立志、成人”</span>
          <span className="mx-2 text-slate-300">|</span>
          <span className="text-xs font-light tracking-wide text-slate-500">Wisdom · Innovation · Aspiration · Integrity</span>
        </div>
      </section>

      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100">
            🎞 {language === "zh" ? "精选视频" : "Featured Videos"}
          </h2>
          <Link href="/videos" className="text-sm text-blue-600 hover:underline">
            {language === "zh" ? "查看全部 →" : "View all →"}
          </Link>
        </div>

        {videosLoading ? (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {[0, 1, 2, 3].map((index) => (
              <div key={index} className="animate-pulse overflow-hidden rounded-xl border border-gray-100 bg-white dark:border-gray-700 dark:bg-gray-800">
                <div className="aspect-video bg-gray-200 dark:bg-gray-700" />
                <div className="p-3">
                  <div className="mb-2 h-4 w-3/4 rounded bg-gray-200 dark:bg-gray-700" />
                  <div className="h-3 w-1/2 rounded bg-gray-100 dark:bg-gray-600" />
                </div>
              </div>
            ))}
          </div>
        ) : videos.length === 0 ? null : (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {videos.map((video) => {
              const displayTitle = language === "en" && video.titleEn ? video.titleEn : video.title;
              const displayUploader = language === "en" && video.uploaderEn ? video.uploaderEn : video.uploader;

              return (
                <Link key={video._id} href={`/videos/${video._id}`}>
                  <div className="group overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md dark:border-gray-700 dark:bg-gray-800 dark:hover:border-blue-700">
                    <div className="relative aspect-video bg-gray-100 dark:bg-gray-700">
                      <img src={video.coverImage} alt={displayTitle} className="h-full w-full object-cover" />
                      <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition-opacity group-hover:opacity-100">
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/90">
                          <svg className="ml-0.5 h-6 w-6 text-blue-600" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M8 5v14l11-7z" />
                          </svg>
                        </div>
                      </div>
                      <div className="absolute bottom-1 right-1">
                        <span className="rounded bg-black/60 px-1.5 py-0.5 text-xs text-white">
                          👁 {video.viewCount || 0}
                        </span>
                      </div>
                    </div>
                    <div className="p-3">
                      <h3 className="mb-1 line-clamp-2 text-sm font-semibold text-gray-900 dark:text-gray-100">{displayTitle}</h3>
                      <p className="text-xs text-gray-400 dark:text-gray-500">{displayUploader}</p>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <div className="mb-4 flex items-center justify-between">
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
              className="rounded-full border border-gray-200 px-3 py-1 text-xs text-gray-500 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-800"
            >
              {loading ? "…" : t("refresh")}
            </button>
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {[0, 1, 2].map((index) => (
              <div key={index} className="rounded-xl border border-gray-100 bg-white p-5 animate-pulse dark:border-gray-700 dark:bg-gray-800">
                <div className="mb-2 h-4 w-3/4 rounded bg-gray-200 dark:bg-gray-600" />
                <div className="h-3 w-1/2 rounded bg-gray-100 dark:bg-gray-700" />
              </div>
            ))}
          </div>
        ) : posts.length === 0 ? (
          <div className="py-10 text-center text-sm text-gray-400 dark:text-gray-500">
            {t("noPostsYet")}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {posts.map((post) => (
              <Link
                key={post._id}
                href={`/post/${post._id}`}
                className="block rounded-xl border border-gray-100 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md dark:border-gray-700 dark:bg-gray-800 dark:hover:border-blue-700"
              >
                {post.category && (
                  <span className="mb-2 inline-block rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
                    {post.category}
                  </span>
                )}
                <h3 className="mb-1 line-clamp-2 font-semibold text-gray-900 dark:text-gray-100">{post.title}</h3>
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  {post.author && `${post.author} · `}
                  {post.createdAt ? new Date(post.createdAt).toLocaleDateString(language === "zh" ? "zh-CN" : "en-US") : ""}
                </p>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-4 text-xl font-bold text-gray-800 dark:text-gray-100">
          {language === "zh" ? "推荐主题" : "Topics"}
        </h2>
        <div className="flex flex-wrap gap-3">
          {topics.map((topic, index) => (
            <Link
              key={index}
              href={topic.href}
              className="rounded-full border border-orange-200 bg-white px-4 py-1.5 text-sm font-medium text-orange-700 shadow-sm transition-colors hover:bg-orange-50 dark:border-orange-500/40 dark:bg-orange-950/20 dark:text-orange-200 dark:hover:bg-orange-950/30"
            >
              {language === "zh" ? topic.labelZh : topic.labelEn}
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
