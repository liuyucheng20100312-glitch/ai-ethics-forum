"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";

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
  isVisible?: boolean;
  viewCount: number;
  createdAt: string;
}

// 检查是否是管理员
function isAdmin(userId: string | undefined): boolean {
  return userId === "offline_admin";
}

export default function VideosPage() {
  const { isGuest, user, authFetch } = useAuth();
  const { t, language } = useLanguage();
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [adminView, setAdminView] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const isUserAdmin = isAdmin(user?.userId);

  useEffect(() => {
    fetchVideos();
  }, [adminView, user]);  // eslint-disable-line react-hooks/exhaustive-deps

  const fetchVideos = async () => {
    setLoading(true);
    try {
      let url = "/api/videos";
      const params = new URLSearchParams();
      if (adminView && isUserAdmin) params.append("adminView", "true");
      if (params.toString()) url += `?${params.toString()}`;

      // 使用 authFetch 确保管理员身份能被识别
      const response = isUserAdmin ? await authFetch(url) : await fetch(url);
      const data = await response.json();
      setVideos(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("获取视频失败:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleVisibility = async (videoId: string, currentVisibility: boolean, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!isUserAdmin) return;

    setActionLoading(videoId);
    try {
      const response = await authFetch(`/api/videos/${videoId}`, {
        method: "PUT",
        body: JSON.stringify({ isVisible: !currentVisibility }),
      });

      if (response.ok) {
        fetchVideos();
      }
    } catch (error) {
      console.error("操作失败:", error);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteVideo = async (videoId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!isUserAdmin) return;

    if (!confirm(t("adminDeleteConfirm"))) return;

    setActionLoading(videoId);
    try {
      const response = await authFetch(`/api/videos/${videoId}`, {
        method: "DELETE",
      });

      if (response.ok) {
        fetchVideos();
      }
    } catch (error) {
      console.error("删除失败:", error);
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-4">{language === "zh" ? "视频专区" : "Videos"}</h1>
        <div className="flex gap-4 items-center flex-wrap">
          {/* Admin Toggle */}
          {isUserAdmin && (
            <button
              onClick={() => setAdminView(!adminView)}
              className={`px-4 py-2 rounded-full font-semibold transition ${
                adminView
                  ? "bg-purple-600 text-white"
                  : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600"
              }`}
            >
              {language === "zh" ? "视频管理" : "Video Management"}
            </button>
          )}

          {/* New Video Button - Admin Only */}
          {isUserAdmin && (
            <Link
              href="/videos/new"
              className="ml-auto bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 font-bold whitespace-nowrap"
            >
              {language === "zh" ? "+ 发布视频" : "+ Publish Video"}
            </Link>
          )}
        </div>
      </div>

      {/* Videos Grid */}
      {loading ? (
        <p className="text-center text-gray-500">{t("loading")}</p>
      ) : videos.length === 0 ? (
        <p className="text-center text-gray-500 py-8">{language === "zh" ? "暂无视频" : "No videos yet"}</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {videos.map((video) => {
            const displayTitle = language === "en" && video.titleEn ? video.titleEn : video.title;
            const displayUploader = language === "en" && video.uploaderEn ? video.uploaderEn : video.uploader;
            const isHidden = video.isVisible === false;

            return (
              <Link key={video._id} href={`/videos/${video._id}`}>
                <div className={`bg-white dark:bg-gray-800 border rounded-xl overflow-hidden hover:shadow-lg transition cursor-pointer relative group ${
                  isHidden ? "border-red-300 dark:border-red-700 opacity-75" : "border-gray-200 dark:border-gray-700"
                }`}>
                  {/* Cover Image */}
                  <div className="relative aspect-video bg-gray-100 dark:bg-gray-700">
                    <img
                      src={video.coverImage}
                      alt={displayTitle}
                      className="w-full h-full object-cover"
                    />
                    {/* Play Icon Overlay */}
                    <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="w-16 h-16 rounded-full bg-white/90 flex items-center justify-center">
                        <svg className="w-8 h-8 text-blue-600 ml-1" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      </div>
                    </div>
                    {/* Admin Badge for hidden videos */}
                    {adminView && isHidden && (
                      <div className="absolute top-2 right-2">
                        <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200 font-medium">
                          {t("isHidden")}
                        </span>
                      </div>
                    )}
                    {/* View Count */}
                    <div className="absolute bottom-2 right-2">
                      <span className="text-xs px-2 py-0.5 rounded bg-black/60 text-white">
                        👁 {video.viewCount || 0}
                      </span>
                    </div>
                  </div>

                  {/* Video Info */}
                  <div className="p-4">
                    <h3 className="font-bold text-gray-900 dark:text-gray-100 line-clamp-2 mb-2">{displayTitle}</h3>
                    <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                      <span>👤 {displayUploader}</span>
                    </div>
                    <div className="text-xs text-gray-400 mt-2">
                      {new Date(video.createdAt).toLocaleDateString(language === "en" ? "en-US" : "zh-CN")}
                    </div>
                  </div>

                  {/* Admin Actions */}
                  {adminView && isUserAdmin && (
                    <div className="px-4 pb-4 pt-0 border-t border-gray-100 dark:border-gray-700 flex gap-2">
                      <button
                        onClick={(e) => handleToggleVisibility(video._id, video.isVisible !== false, e)}
                        disabled={actionLoading === video._id}
                        className={`px-3 py-1.5 rounded text-sm font-medium transition ${
                          isHidden
                            ? "bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400"
                            : "bg-yellow-100 text-yellow-700 hover:bg-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400"
                        } disabled:opacity-50`}
                      >
                        {actionLoading === video._id ? t("loading") : isHidden ? t("setVisible") : t("setHidden")}
                      </button>
                      <button
                        onClick={(e) => handleDeleteVideo(video._id, e)}
                        disabled={actionLoading === video._id}
                        className="px-3 py-1.5 rounded text-sm font-medium bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400 transition disabled:opacity-50"
                      >
                        {language === "zh" ? "删除" : "Delete"}
                      </button>
                    </div>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
