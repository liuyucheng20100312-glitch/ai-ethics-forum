"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";

type Album = {
  _id: string;
  title: string;
  host: string;
  coverImage: string;
  description: string;
  status: "approved" | "hidden";
  episodes: Array<{
    title: string;
    coverImage: string;
    playUrl: string;
    publishedAt?: string;
    duration?: string;
  }>;
};

export default function PodcastPage() {
  const { isGuest, authFetch, user } = useAuth();
  const [albums, setAlbums] = useState<Album[]>([]);
  const [bookmarked, setBookmarked] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const isAdmin = user?.userId === "offline_admin";

  const loadAlbums = useCallback(async () => {
    setLoading(true);
    try {
      const url = isAdmin ? "/api/podcast/albums?includeHidden=true" : "/api/podcast/albums";
      const res = await fetch(url);
      const data = await res.json();
      setAlbums(Array.isArray(data) ? data : []);
    } catch {
      setAlbums([]);
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  const loadBookmarks = useCallback(async () => {
    if (isGuest) return;
    try {
      const res = await authFetch("/api/bookmarks");
      const data = await res.json();
      if (Array.isArray(data)) {
        setBookmarked(new Set(data.filter((item: any) => item.itemType === "podcast").map((item: any) => item.itemId)));
      }
    } catch {}
  }, [authFetch, isGuest]);

  useEffect(() => {
    loadAlbums();
    loadBookmarks();
  }, [loadAlbums, loadBookmarks]);

  async function toggleBookmark(album: Album) {
    if (isGuest) return;
    const marked = bookmarked.has(album._id);
    setBookmarked((prev) => {
      const next = new Set(prev);
      if (marked) next.delete(album._id);
      else next.add(album._id);
      return next;
    });

    try {
      if (marked) {
        await authFetch(`/api/bookmarks/${encodeURIComponent(album._id)}?type=podcast`, { method: "DELETE" });
      } else {
        await authFetch("/api/bookmarks", {
          method: "POST",
          body: JSON.stringify({
            itemId: album._id,
            itemType: "podcast",
            title: album.title,
            subtitle: `${album.host} · ${album.episodes.length}期`,
            emoji: "🎧",
          }),
        });
      }
    } catch {
      setBookmarked((prev) => {
        const next = new Set(prev);
        if (marked) next.add(album._id);
        else next.delete(album._id);
        return next;
      });
    }
  }

  const featured = albums[0];

  return (
    <div className="space-y-10">
      <section className="rounded-[32px] bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.35),_transparent_32%),linear-gradient(135deg,_#081223_0%,_#10233b_52%,_#1c314f_100%)] p-8 md:p-10 text-white shadow-[0_30px_80px_rgba(8,18,35,0.28)]">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
          <div className="max-w-3xl">
            <span className="inline-flex rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs tracking-[0.22em] uppercase">Podcast Albums</span>
            <h1 className="mt-4 text-3xl md:text-5xl font-semibold leading-tight">播客专区</h1>
            <p className="mt-4 text-sm md:text-base text-blue-100/85 leading-7">
              发现精彩播客专辑，聆听思想的声音。每一期都有独特的主题，点击即可播放或跳转。
            </p>
          </div>
          {isAdmin && (
            <Link href="/admin/podcast" className="inline-flex items-center justify-center rounded-full bg-white text-slate-900 px-5 py-3 font-medium hover:bg-blue-50">
              管理专辑
            </Link>
          )}
        </div>

        {featured && (
          <Link href={`/podcast/${featured._id}`} className="mt-8 block rounded-[28px] border border-white/10 bg-white/6 p-5 md:p-6 hover:bg-white/10 transition-colors">
            <div className="grid md:grid-cols-[260px_1fr] gap-6 items-center">
              <img src={featured.coverImage} alt={featured.title} className="w-full aspect-square rounded-[24px] object-cover shadow-2xl" />
              <div>
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="rounded-full bg-rose-500/90 px-3 py-1 text-xs font-medium">主打专辑</span>
                  <span className="text-sm text-blue-100/75">{featured.host}</span>
                </div>
                <h2 className="mt-4 text-2xl md:text-4xl font-semibold">{featured.title}</h2>
                <p className="mt-4 text-blue-100/80 line-clamp-4 leading-7">{featured.description}</p>
                <div className="mt-5 flex items-center gap-5 text-sm text-blue-100/75">
                  <span>{featured.episodes.length} 期内容</span>
                  <span>{featured.episodes[0]?.publishedAt || "持续更新中"}</span>
                </div>
              </div>
            </div>
          </Link>
        )}
      </section>

      <section className="space-y-5">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">专辑列表</h2>
          <p className="text-sm text-slate-500 mt-1">像网易云专辑页一样，先看专辑，再进入期数列表。</p>
        </div>

        {loading ? (
          <div className="grid md:grid-cols-2 gap-5">
            {[0, 1].map((item) => (
              <div key={item} className="rounded-[28px] border border-gray-200 bg-white p-5 animate-pulse">
                <div className="aspect-[16/7] rounded-[22px] bg-gray-200" />
                <div className="h-6 bg-gray-200 rounded mt-5 w-2/3" />
                <div className="h-4 bg-gray-100 rounded mt-3 w-full" />
                <div className="h-4 bg-gray-100 rounded mt-2 w-3/4" />
              </div>
            ))}
          </div>
        ) : albums.length === 0 ? (
          <div className="rounded-[28px] border border-dashed border-gray-300 bg-white p-12 text-center text-gray-500">
            还没有专辑内容，去后台先创建一个专辑就可以开始发布。
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-5">
            {albums.map((album) => (
              <div key={album._id} className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm hover:shadow-xl transition-shadow">
                <Link href={`/podcast/${album._id}`} className="block">
                  <img src={album.coverImage} alt={album.title} className="w-full aspect-[16/9] rounded-[24px] object-cover" />
                </Link>
                <div className="mt-5 flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-xl font-semibold text-slate-900">{album.title}</h3>
                      {album.status === "hidden" && (
                        <span className="rounded-full bg-slate-100 text-slate-500 text-xs px-2 py-1">隐藏中</span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-slate-500">{album.host}</p>
                  </div>
                  {!isGuest && (
                    <button onClick={() => toggleBookmark(album)} className={`text-2xl leading-none ${bookmarked.has(album._id) ? "text-amber-400" : "text-slate-300 hover:text-amber-300"}`}>
                      {bookmarked.has(album._id) ? "★" : "☆"}
                    </button>
                  )}
                </div>
                <p className="mt-4 text-sm text-slate-600 line-clamp-3 leading-6">{album.description}</p>
                <div className="mt-5 flex items-center justify-between text-sm text-slate-500">
                  <span>{album.episodes.length} 期</span>
                  <Link href={`/podcast/${album._id}`} className="rounded-full bg-slate-900 text-white px-4 py-2 hover:bg-slate-700">
                    进入专辑
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
