"use client";

import { useState, useEffect, useRef } from "react";
import { useAuth } from "../context/AuthContext";

interface CreativePost {
  _id: string;
  author: string;
  tool: string;
  description: string;
  fileUrl: string;
  fileType: "image" | "video" | "audio" | "none";
  fileName: string;
  likes: number;
  likedBy?: string[];
  createdAt: string;
}

const TOOL_SUGGESTIONS = [
  "通义千问", "文心一言", "豆包", "Kimi", "即梦 AI", "文心一格",
  "Suno AI", "Udio", "海螺 AI", "Midjourney", "Stable Diffusion",
  "Runway Gen-3", "Claude", "GitHub Copilot", "通义灵码", "其他",
];

export default function CreativePage() {
  const { user, isGuest, authFetch } = useAuth();
  const [posts, setPosts] = useState<CreativePost[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [tool, setTool] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Liked set
  const [likedSet, setLikedSet] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchPosts();
  }, []);

  async function fetchPosts() {
    try {
      const res = await fetch("/api/creative");
      const data = await res.json();
      if (Array.isArray(data)) {
        setPosts(data);
        // Build liked set from likedBy arrays
        if (user) {
          const liked = new Set<string>(
            data.filter((p: CreativePost) => p.likedBy?.includes(user.userId)).map((p: CreativePost) => p._id)
          );
          setLikedSet(liked);
        }
      }
    } catch {}
    finally { setLoading(false); }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    setFilePreview("");
    if (!f) return;
    if (f.size > 50 * 1024 * 1024) {
      setError("文件大小不能超过 50 MB");
      setFile(null);
      e.target.value = "";
      return;
    }
    setError("");
    const url = URL.createObjectURL(f);
    setFilePreview(url);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!tool.trim()) { setError("请填写使用的 AI 工具"); return; }
    if (!description.trim()) { setError("请填写使用成果展示"); return; }
    setError("");
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("tool", tool.trim());
      fd.append("description", description.trim());
      if (file) fd.append("file", file);

      const res = await authFetch("/api/creative", { method: "POST", body: fd });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error ?? "发布失败");
        return;
      }
      // Reset form
      setTool("");
      setDescription("");
      setFile(null);
      setFilePreview("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      setShowForm(false);
      fetchPosts();
    } catch { setError("发布失败，请重试"); }
    finally { setSubmitting(false); }
  }

  async function handleLike(post: CreativePost) {
    if (isGuest || !user) return;
    const wasLiked = likedSet.has(post._id);
    // Optimistic
    setLikedSet((prev) => { const s = new Set(prev); wasLiked ? s.delete(post._id) : s.add(post._id); return s; });
    setPosts((prev) => prev.map((p) => p._id === post._id ? { ...p, likes: p.likes + (wasLiked ? -1 : 1) } : p));
    try {
      await authFetch(`/api/creative/${post._id}/like`, { method: "POST" });
    } catch {
      // Revert
      setLikedSet((prev) => { const s = new Set(prev); wasLiked ? s.add(post._id) : s.delete(post._id); return s; });
      setPosts((prev) => prev.map((p) => p._id === post._id ? { ...p, likes: p.likes + (wasLiked ? 1 : -1) } : p));
    }
  }

  // Derive file type from File object for preview
  function getFileCategory(f: File): "image" | "video" | "audio" {
    if (f.type.startsWith("image/")) return "image";
    if (f.type.startsWith("video/")) return "video";
    return "audio";
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">创意专区</h1>
          <p className="text-gray-500 mt-1">分享你用 AI 创作的作品，展示工具与成果</p>
        </div>
        {!isGuest && (
          <button
            onClick={() => setShowForm((v) => !v)}
            className="bg-blue-600 text-white text-sm font-medium px-5 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            {showForm ? "✕ 取消" : "+ 发布创意"}
          </button>
        )}
      </div>

      {/* Submission Form */}
      {showForm && !isGuest && (
        <form
          onSubmit={handleSubmit}
          className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm space-y-5"
        >
          <h2 className="text-lg font-semibold text-gray-900">发布 AI 创意作品</h2>

          {/* AI Tool */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              🛠 使用的 AI 工具 <span className="text-red-400">*</span>
            </label>
            <input
              list="tool-suggestions"
              value={tool}
              onChange={(e) => setTool(e.target.value)}
              placeholder="输入或选择工具名称，如：Suno AI"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <datalist id="tool-suggestions">
              {TOOL_SUGGESTIONS.map((t) => <option key={t} value={t} />)}
            </datalist>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              ✨ 使用成果展示 <span className="text-red-400">*</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              placeholder="描述你的创作过程、提示词、成果亮点……"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          {/* File Upload */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              📎 上传作品文件（可选，支持图片 / 音频 / 视频，≤ 50 MB）
            </label>
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors"
            >
              {file ? (
                <div className="space-y-2">
                  {/* Preview */}
                  {filePreview && getFileCategory(file) === "image" && (
                    <img src={filePreview} alt="预览" className="max-h-48 mx-auto rounded-lg object-contain" />
                  )}
                  {filePreview && getFileCategory(file) === "video" && (
                    <video src={filePreview} controls className="max-h-48 mx-auto rounded-lg w-full" />
                  )}
                  {filePreview && getFileCategory(file) === "audio" && (
                    <audio src={filePreview} controls className="w-full" />
                  )}
                  <p className="text-sm text-gray-600 font-medium">{file.name}</p>
                  <p className="text-xs text-gray-400">{(file.size / 1024 / 1024).toFixed(1)} MB · 点击重新选择</p>
                </div>
              ) : (
                <>
                  <p className="text-3xl mb-2">🖼️🎵🎬</p>
                  <p className="text-sm text-gray-500">点击上传图片、音频或视频文件</p>
                  <p className="text-xs text-gray-400 mt-1">支持 JPG / PNG / GIF / MP3 / WAV / MP4 / MOV 等格式</p>
                </>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,audio/*,video/*"
              onChange={handleFileChange}
              className="hidden"
            />
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={submitting}
              className="bg-blue-600 text-white text-sm font-medium px-6 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {submitting ? "发布中…" : "发布作品"}
            </button>
            <button
              type="button"
              onClick={() => { setShowForm(false); setError(""); }}
              className="border border-gray-300 text-gray-600 text-sm px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors"
            >
              取消
            </button>
          </div>
        </form>
      )}

      {/* Guest prompt */}
      {isGuest && (
        <div className="bg-blue-50 border border-blue-100 rounded-xl px-5 py-4 text-sm text-blue-700">
          🔒 <a href="/login" className="underline font-medium">登录</a> 后可发布 AI 创意作品
        </div>
      )}

      {/* Feed */}
      {loading ? (
        <p className="text-center text-gray-400 py-12">加载中…</p>
      ) : posts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center text-gray-400">
          <div className="text-5xl mb-4">🎨</div>
          <p className="text-lg font-medium text-gray-500">还没有创意作品</p>
          <p className="text-sm mt-1">成为第一个分享 AI 创意的人吧！</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {posts.map((post) => (
            <div key={post._id} className="bg-white border border-gray-100 rounded-2xl shadow-sm hover:shadow-md transition-shadow overflow-hidden">
              {/* Media */}
              {post.fileUrl && post.fileType === "image" && (
                <img
                  src={post.fileUrl}
                  alt={post.fileName}
                  className="w-full max-h-64 object-cover"
                />
              )}
              {post.fileUrl && post.fileType === "video" && (
                <video src={post.fileUrl} controls className="w-full max-h-64 bg-black" />
              )}
              {post.fileUrl && post.fileType === "audio" && (
                <div className="px-5 pt-5">
                  <audio src={post.fileUrl} controls className="w-full" />
                </div>
              )}

              <div className="p-5">
                {/* Tool badge */}
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs px-2.5 py-0.5 bg-purple-50 text-purple-700 border border-purple-200 rounded-full font-medium">
                    🛠 {post.tool}
                  </span>
                </div>

                {/* Description */}
                <p className="text-sm text-gray-700 whitespace-pre-line leading-relaxed mb-4">
                  {post.description}
                </p>

                {/* Footer */}
                <div className="flex items-center justify-between text-xs text-gray-400">
                  <span>👤 {post.author} · {new Date(post.createdAt).toLocaleDateString("zh-CN")}</span>
                  <button
                    onClick={() => handleLike(post)}
                    disabled={isGuest}
                    className={`flex items-center gap-1 px-3 py-1 rounded-full border transition-colors disabled:cursor-default ${
                      likedSet.has(post._id)
                        ? "bg-red-50 border-red-200 text-red-500"
                        : "border-gray-200 text-gray-400 hover:text-red-400 hover:border-red-200"
                    }`}
                  >
                    {likedSet.has(post._id) ? "❤️" : "🤍"} {post.likes}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

