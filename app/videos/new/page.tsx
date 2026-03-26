"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "../../context/AuthContext";
import { useLanguage } from "../../context/LanguageContext";

// 检查是否是管理员
function isAdmin(userId: string | undefined): boolean {
  return userId === "offline_admin";
}

export default function NewVideoPage() {
  const { user, authFetch } = useAuth();
  const { t, language } = useLanguage();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState("");
  const [titleEn, setTitleEn] = useState("");
  const [uploader, setUploader] = useState("");
  const [uploaderEn, setUploaderEn] = useState("");
  const [coverImage, setCoverImage] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [content, setContent] = useState("");
  const [contentEn, setContentEn] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);

  const isUserAdmin = isAdmin(user?.userId);

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      alert(language === "zh" ? "图片大小不能超过 5MB" : "Image size must be under 5MB");
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("cover", file);

      const response = await authFetch("/api/videos/upload-cover", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Upload failed");
      }

      const data = await response.json();
      setCoverImage(data.coverUrl);
    } catch (error: any) {
      alert(error.message || (language === "zh" ? "上传失败" : "Upload failed"));
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim() || !uploader.trim() || !coverImage || !videoUrl.trim() || !content.trim()) {
      alert(t("fillRequired"));
      return;
    }

    setSubmitting(true);
    try {
      const response = await authFetch("/api/videos", {
        method: "POST",
        body: JSON.stringify({
          title: title.trim(),
          titleEn: titleEn.trim(),
          uploader: uploader.trim(),
          uploaderEn: uploaderEn.trim(),
          coverImage,
          videoUrl: videoUrl.trim(),
          content: content.trim(),
          contentEn: contentEn.trim(),
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || t("publishFailed"));
      }

      const video = await response.json();
      router.push(`/videos/${video._id}`);
    } catch (error: any) {
      alert(error.message || t("publishFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  // 非管理员无法访问
  if (!isUserAdmin) {
    return (
      <div className="text-center py-20">
        <p className="text-gray-500 mb-4">{language === "zh" ? "无权限发布视频" : "Access denied"}</p>
        <Link href="/videos" className="text-blue-600 hover:underline">{language === "zh" ? "返回视频专区" : "Back to Videos"}</Link>
      </div>
    );
  }

  return (
    <div>
      {/* Back Button */}
      <Link href="/videos" className="text-blue-600 hover:underline mb-6 inline-block">
        {language === "zh" ? "← 返回视频列表" : "← Back to Videos"}
      </Link>

      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-8">
        <h1 className="text-3xl font-bold mb-6">{language === "zh" ? "发布新视频" : "Publish New Video"}</h1>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Title */}
          <div>
            <label className="block text-sm font-semibold mb-2">
              {language === "zh" ? "视频标题" : "Video Title"} <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={language === "zh" ? "输入视频标题..." : "Enter video title..."}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          {/* Title English */}
          <div>
            <label className="block text-sm font-semibold mb-2 text-gray-500">
              {language === "zh" ? "英文标题（选填）" : "English Title (optional)"}
            </label>
            <input
              type="text"
              value={titleEn}
              onChange={(e) => setTitleEn(e.target.value)}
              placeholder="Enter title in English..."
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Uploader */}
          <div>
            <label className="block text-sm font-semibold mb-2">
              {language === "zh" ? "UP主信息" : "Uploader Info"} <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={uploader}
              onChange={(e) => setUploader(e.target.value)}
              placeholder={language === "zh" ? "例如：B站账号名" : "e.g., Bilibili account name"}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          {/* Uploader English */}
          <div>
            <label className="block text-sm font-semibold mb-2 text-gray-500">
              {language === "zh" ? "UP主英文信息（选填）" : "Uploader Info English (optional)"}
            </label>
            <input
              type="text"
              value={uploaderEn}
              onChange={(e) => setUploaderEn(e.target.value)}
              placeholder="Enter uploader info in English..."
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Cover Image Upload */}
          <div>
            <label className="block text-sm font-semibold mb-2">
              {language === "zh" ? "视频封面" : "Cover Image"} <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-4 items-start">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="px-4 py-2 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition disabled:opacity-50"
              >
                {uploading ? (language === "zh" ? "上传中..." : "Uploading...") : (language === "zh" ? "选择图片" : "Select Image")}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleCoverUpload}
                className="hidden"
              />
              {coverImage && (
                <img
                  src={coverImage}
                  alt="Cover preview"
                  className="w-48 h-27 object-cover rounded border border-gray-200 dark:border-gray-600"
                />
              )}
            </div>
            <p className="text-xs text-gray-400 mt-1">{language === "zh" ? "支持 JPG, PNG, 最大 5MB" : "JPG, PNG supported, max 5MB"}</p>
          </div>

          {/* Video URL */}
          <div>
            <label className="block text-sm font-semibold mb-2">
              {language === "zh" ? "视频链接" : "Video URL"} <span className="text-red-500">*</span>
            </label>
            <input
              type="url"
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              placeholder={language === "zh" ? "例如：https://www.bilibili.com/video/..." : "e.g., https://www.bilibili.com/video/..."}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          {/* Content Description */}
          <div>
            <label className="block text-sm font-semibold mb-2">
              {language === "zh" ? "内容描述" : "Description"} <span className="text-red-500">*</span>
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={language === "zh" ? "描述视频内容..." : "Describe the video content..."}
              rows={4}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          {/* Content Description English */}
          <div>
            <label className="block text-sm font-semibold mb-2 text-gray-500">
              {language === "zh" ? "英文描述（选填）" : "English Description (optional)"}
            </label>
            <textarea
              value={contentEn}
              onChange={(e) => setContentEn(e.target.value)}
              placeholder="Describe the video content in English..."
              rows={4}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Submit Button */}
          <div className="flex gap-4">
            <button
              type="submit"
              disabled={submitting || uploading || !coverImage}
              className="bg-blue-600 text-white px-8 py-3 rounded-lg hover:bg-blue-700 font-bold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? t("publishing") : (language === "zh" ? "发布视频" : "Publish Video")}
            </button>
            <Link
              href="/videos"
              className="px-8 py-3 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 font-medium"
            >
              {t("cancelEdit")}
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
