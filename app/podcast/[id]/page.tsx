"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

type Episode = {
  title: string;
  coverImage: string;
  playUrl: string;
  publishedAt?: string;
  duration?: string;
  description?: string;
};

type Album = {
  _id: string;
  title: string;
  host: string;
  coverImage: string;
  description: string;
  episodes: Episode[];
};

export default function PodcastAlbumDetailPage() {
  const params = useParams();
  const [album, setAlbum] = useState<Album | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    async function loadAlbum() {
      setLoading(true);
      try {
        const res = await fetch(`/api/podcast/albums/${params.id}`);
        if (!res.ok) {
          setAlbum(null);
          return;
        }
        const data = await res.json();
        setAlbum(data);
        setActiveIndex(0);
      } finally {
        setLoading(false);
      }
    }
    if (params.id) loadAlbum();
  }, [params.id]);

  const activeEpisode = useMemo(() => album?.episodes?.[activeIndex] ?? null, [album, activeIndex]);

  if (loading) {
    return <div className="text-center py-20 text-gray-500">加载中...</div>;
  }
  if (!album) {
    return (
      <div className="text-center py-20">
        <p className="text-gray-500 mb-4">专辑不存在或暂未发布</p>
        <Link href="/podcast" className="text-blue-600 hover:underline">返回播客专区</Link>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <Link href="/podcast" className="text-blue-600 hover:underline inline-block">返回播客专区</Link>

      <section className="rounded-[32px] overflow-hidden bg-[linear-gradient(135deg,_#09111f_0%,_#11243f_52%,_#1d3b61_100%)] text-white shadow-[0_30px_80px_rgba(9,17,31,0.28)]">
        <div className="grid lg:grid-cols-[380px_1fr] gap-0">
          <div className="p-6 md:p-8 lg:p-10">
            <img src={activeEpisode?.coverImage || album.coverImage} alt={album.title} className="w-full aspect-square rounded-[28px] object-cover shadow-2xl" />
          </div>
          <div className="p-6 md:p-8 lg:p-10 flex flex-col justify-center">
            <span className="inline-flex w-fit rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs tracking-[0.22em] uppercase">Album Intro</span>
            <h1 className="mt-4 text-3xl md:text-4xl font-semibold leading-tight">{album.title}</h1>
            <p className="mt-3 text-blue-100/75 text-sm md:text-base">{album.host}</p>
            <p className="mt-6 text-blue-100/85 leading-7 whitespace-pre-wrap">{album.description}</p>

            {activeEpisode && (
              <div className="mt-8 rounded-[28px] bg-white/8 border border-white/10 p-5">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <p className="text-xs text-blue-100/65">正在播放</p>
                    <h2 className="mt-1 text-xl font-medium">{activeEpisode.title}</h2>
                    <p className="mt-2 text-sm text-blue-100/70">
                      {activeEpisode.publishedAt || "待补充日期"} {activeEpisode.duration ? `· ${activeEpisode.duration}` : ""}
                    </p>
                  </div>
                  <a href={activeEpisode.playUrl} target="_blank" rel="noreferrer" className="rounded-full bg-white text-slate-900 px-4 py-2 text-sm font-medium hover:bg-blue-50">
                    打开原链接播放
                  </a>
                </div>
                {activeEpisode.description && (
                  <p className="mt-4 text-sm text-blue-100/80 leading-6">{activeEpisode.description}</p>
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      {activeEpisode && (
        <section className="rounded-[32px] bg-white border border-gray-200 p-4 md:p-6 shadow-sm">
          <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
            <h2 className="text-xl font-semibold text-slate-900">播放窗口</h2>
            <a href={activeEpisode.playUrl} target="_blank" rel="noreferrer" className="text-sm text-blue-600 hover:underline">
              如果嵌入失败，点这里新窗口打开
            </a>
          </div>
          <div className="overflow-hidden rounded-[24px] border border-gray-200 bg-slate-950">
            <iframe
              src={activeEpisode.playUrl}
              title={activeEpisode.title}
              className="w-full h-[280px] md:h-[520px] border-0"
              sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
            />
          </div>
        </section>
      )}

      <section className="rounded-[32px] bg-white border border-gray-200 p-6 md:p-8 shadow-sm">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-2xl font-semibold text-slate-900">期数列表</h2>
            <p className="text-sm text-slate-500 mt-1">点击某一期，右侧主区域就切换成该链接进行播放。</p>
          </div>
          <span className="text-sm text-slate-500">{album.episodes.length} 期</span>
        </div>

        <div className="mt-6 space-y-3">
          {album.episodes.map((episode, index) => {
            const active = index === activeIndex;
            return (
              <button
                key={`${episode.title}-${index}`}
                onClick={() => setActiveIndex(index)}
                className={`w-full text-left rounded-[24px] border p-4 transition-all ${active ? "border-blue-500 bg-blue-50 shadow-sm" : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"}`}
              >
                <div className="grid md:grid-cols-[96px_1fr_auto] gap-4 items-center">
                  <img src={episode.coverImage} alt={episode.title} className="w-24 h-24 rounded-2xl object-cover" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className={`text-xs px-2 py-1 rounded-full ${active ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-500"}`}>
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <h3 className={`text-base md:text-lg font-medium ${active ? "text-blue-700" : "text-slate-900"}`}>{episode.title}</h3>
                    </div>
                    <p className="mt-2 text-sm text-slate-500">
                      {episode.publishedAt || "未填写日期"} {episode.duration ? `· ${episode.duration}` : ""}
                    </p>
                    {episode.description && <p className="mt-2 text-sm text-slate-600 line-clamp-2">{episode.description}</p>}
                  </div>
                  <div className="flex items-center gap-3 justify-end">
                    <a
                      href={episode.playUrl}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(event) => event.stopPropagation()}
                      className="rounded-full border border-gray-300 px-4 py-2 text-sm text-slate-700 hover:bg-white"
                    >
                      外链播放
                    </a>
                    <span className={`text-sm ${active ? "text-blue-600" : "text-slate-400"}`}>{active ? "播放中" : "点击播放"}</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
