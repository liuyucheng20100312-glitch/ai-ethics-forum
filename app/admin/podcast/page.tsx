"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../context/AuthContext";
import { isAdminUserId } from "@/lib/admin-auth";

type EpisodeForm = {
  title: string;
  coverImage: string;
  playUrl: string;
  publishedAt: string;
  duration: string;
  description: string;
};

type AlbumForm = {
  title: string;
  host: string;
  coverImage: string;
  description: string;
  status: "approved" | "hidden";
  episodes: EpisodeForm[];
};

type AlbumRecord = AlbumForm & {
  _id: string;
  updatedAt?: string;
  createdAt?: string;
};

const EMPTY_EPISODE: EpisodeForm = {
  title: "",
  coverImage: "",
  playUrl: "",
  publishedAt: "",
  duration: "",
  description: "",
};

const EMPTY_FORM: AlbumForm = {
  title: "",
  host: "",
  coverImage: "",
  description: "",
  status: "approved",
  episodes: [{ ...EMPTY_EPISODE }],
};

export default function AdminPodcastPage() {
  const { user, authFetch } = useAuth();
  const router = useRouter();
  const coverInputRef = useRef<HTMLInputElement>(null);
  const episodeCoverRefs = useRef<Record<number, HTMLInputElement | null>>({});

  const [albums, setAlbums] = useState<AlbumRecord[]>([]);
  const [form, setForm] = useState<AlbumForm>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingAlbumCover, setUploadingAlbumCover] = useState(false);
  const [uploadingEpisodeIndex, setUploadingEpisodeIndex] = useState<number | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) return;
    if (!isAdminUserId(user.userId)) return;
    fetchAlbums();
  }, [user]);

  async function fetchAlbums() {
    setLoading(true);
    try {
      const res = await authFetch("/api/admin/podcast-albums");
      const data = await res.json();
      setAlbums(Array.isArray(data) ? data : []);
    } catch {
      setAlbums([]);
    } finally {
      setLoading(false);
    }
  }

  async function uploadCover(file: File) {
    const fd = new FormData();
    fd.append("cover", file);
    const res = await authFetch("/api/podcast/upload-cover", { method: "POST", body: fd });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Upload failed");
    return data.coverUrl as string;
  }

  async function handleAlbumCoverUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setUploadingAlbumCover(true);
      const coverUrl = await uploadCover(file);
      setForm((prev) => ({ ...prev, coverImage: coverUrl }));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadingAlbumCover(false);
      event.target.value = "";
    }
  }

  async function handleEpisodeCoverUpload(index: number, event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setUploadingEpisodeIndex(index);
      const coverUrl = await uploadCover(file);
      setForm((prev) => ({
        ...prev,
        episodes: prev.episodes.map((episode, i) => (i === index ? { ...episode, coverImage: coverUrl } : episode)),
      }));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadingEpisodeIndex(null);
      event.target.value = "";
    }
  }

  function resetForm() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError("");
  }

  function editAlbum(album: AlbumRecord) {
    setEditingId(album._id);
    setForm({
      title: album.title,
      host: album.host,
      coverImage: album.coverImage,
      description: album.description,
      status: album.status,
      episodes: album.episodes.length ? album.episodes : [{ ...EMPTY_EPISODE }],
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function updateEpisode(index: number, key: keyof EpisodeForm, value: string) {
    setForm((prev) => ({
      ...prev,
      episodes: prev.episodes.map((episode, i) => (i === index ? { ...episode, [key]: value } : episode)),
    }));
  }

  function addEpisode() {
    setForm((prev) => ({ ...prev, episodes: [...prev.episodes, { ...EMPTY_EPISODE }] }));
  }

  function removeEpisode(index: number) {
    setForm((prev) => ({
      ...prev,
      episodes: prev.episodes.length === 1 ? prev.episodes : prev.episodes.filter((_, i) => i !== index),
    }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");

    try {
      const endpoint = editingId ? `/api/admin/podcast-albums/${editingId}` : "/api/admin/podcast-albums";
      const method = editingId ? "PUT" : "POST";
      const res = await authFetch(endpoint, {
        method,
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      resetForm();
      fetchAlbums();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("确认删除这个专辑吗？")) return;
    const res = await authFetch(`/api/admin/podcast-albums/${id}`, { method: "DELETE" });
    if (res.ok) {
      if (editingId === id) resetForm();
      fetchAlbums();
      router.refresh();
    }
  }

  if (!isAdminUserId(user?.userId)) {
    return (
      <div className="text-center py-20">
        <p className="text-gray-500 mb-4">无权限访问播客专辑管理</p>
        <Link href="/admin" className="text-blue-600 hover:underline">返回后台</Link>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <Link href="/admin" className="text-blue-600 hover:underline">返回后台</Link>
        <h1 className="text-3xl font-bold mt-3">播客专辑管理</h1>
        <p className="text-gray-500 mt-2">先建专辑主介绍，再在下面一期一期添加标题、封面和播放链接。</p>
      </div>

      <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-3xl p-6 md:p-8 shadow-sm space-y-8">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">{editingId ? "编辑专辑" : "新建专辑"}</h2>
          {editingId && (
            <button type="button" onClick={resetForm} className="text-sm text-gray-500 hover:text-gray-700">
              取消编辑
            </button>
          )}
        </div>

        {error && <div className="rounded-2xl bg-red-50 border border-red-200 text-red-600 px-4 py-3 text-sm">{error}</div>}

        <div className="grid md:grid-cols-2 gap-6">
          <label className="space-y-2">
            <span className="text-sm font-medium text-gray-700">专辑标题</span>
            <input value={form.title} onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))} className="w-full rounded-2xl border border-gray-300 px-4 py-3" />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium text-gray-700">主播 / 出品方</span>
            <input value={form.host} onChange={(e) => setForm((prev) => ({ ...prev, host: e.target.value }))} className="w-full rounded-2xl border border-gray-300 px-4 py-3" />
          </label>
        </div>

        <div className="grid md:grid-cols-[280px_1fr] gap-6">
          <div className="space-y-3">
            <span className="text-sm font-medium text-gray-700 block">专辑封面</span>
            <button type="button" onClick={() => coverInputRef.current?.click()} className="rounded-2xl border border-dashed border-gray-300 w-full aspect-square flex items-center justify-center text-sm text-gray-500 hover:border-blue-400">
              {uploadingAlbumCover ? "上传中..." : "上传封面"}
            </button>
            <input ref={coverInputRef} type="file" accept="image/*" onChange={handleAlbumCoverUpload} className="hidden" />
            {form.coverImage && <img src={form.coverImage} alt="专辑封面" className="w-full aspect-square object-cover rounded-3xl border border-gray-200" />}
          </div>

          <div className="space-y-6">
            <label className="space-y-2 block">
              <span className="text-sm font-medium text-gray-700">专辑介绍</span>
              <textarea value={form.description} onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))} rows={6} className="w-full rounded-2xl border border-gray-300 px-4 py-3" />
            </label>
            <label className="space-y-2 block">
              <span className="text-sm font-medium text-gray-700">状态</span>
              <select value={form.status} onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value as "approved" | "hidden" }))} className="w-full rounded-2xl border border-gray-300 px-4 py-3">
                <option value="approved">前台可见</option>
                <option value="hidden">仅后台可见</option>
              </select>
            </label>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">分期列表</h3>
            <button type="button" onClick={addEpisode} className="rounded-full bg-slate-900 text-white text-sm px-4 py-2 hover:bg-slate-700">新增一期</button>
          </div>

          {form.episodes.map((episode, index) => (
            <div key={index} className="rounded-3xl border border-gray-200 p-5 bg-slate-50/70 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-medium text-gray-800">第 {index + 1} 期</h4>
                {form.episodes.length > 1 && (
                  <button type="button" onClick={() => removeEpisode(index)} className="text-sm text-red-500 hover:text-red-600">
                    删除本期
                  </button>
                )}
              </div>

              <div className="grid md:grid-cols-[160px_1fr] gap-5">
                <div className="space-y-3">
                  <button type="button" onClick={() => episodeCoverRefs.current[index]?.click()} className="rounded-2xl border border-dashed border-gray-300 w-full aspect-square flex items-center justify-center text-sm text-gray-500 hover:border-blue-400">
                    {uploadingEpisodeIndex === index ? "上传中..." : "上传本期封面"}
                  </button>
                  <input ref={(node) => { episodeCoverRefs.current[index] = node; }} type="file" accept="image/*" onChange={(e) => handleEpisodeCoverUpload(index, e)} className="hidden" />
                  {episode.coverImage && <img src={episode.coverImage} alt={episode.title || `episode-${index + 1}`} className="w-full aspect-square object-cover rounded-2xl border border-gray-200" />}
                </div>

                <div className="space-y-4">
                  <input value={episode.title} onChange={(e) => updateEpisode(index, "title", e.target.value)} placeholder="本期标题" className="w-full rounded-2xl border border-gray-300 px-4 py-3" />
                  <input value={episode.playUrl} onChange={(e) => updateEpisode(index, "playUrl", e.target.value)} placeholder="播放链接，例如 https://..." className="w-full rounded-2xl border border-gray-300 px-4 py-3" />
                  <div className="grid md:grid-cols-2 gap-4">
                    <input value={episode.publishedAt} onChange={(e) => updateEpisode(index, "publishedAt", e.target.value)} type="date" className="w-full rounded-2xl border border-gray-300 px-4 py-3" />
                    <input value={episode.duration} onChange={(e) => updateEpisode(index, "duration", e.target.value)} placeholder="时长，例如 69:02" className="w-full rounded-2xl border border-gray-300 px-4 py-3" />
                  </div>
                  <textarea value={episode.description} onChange={(e) => updateEpisode(index, "description", e.target.value)} rows={3} placeholder="本期简介，可选" className="w-full rounded-2xl border border-gray-300 px-4 py-3" />
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-3">
          <button type="submit" disabled={saving} className="rounded-full bg-blue-600 text-white px-6 py-3 font-medium hover:bg-blue-700 disabled:opacity-50">
            {saving ? "保存中..." : editingId ? "保存修改" : "创建专辑"}
          </button>
          <Link href="/podcast" className="rounded-full border border-gray-300 px-6 py-3 font-medium hover:bg-gray-50">查看前台</Link>
        </div>
      </form>

      <div className="space-y-4">
        <h2 className="text-xl font-semibold">已创建专辑</h2>
        {loading ? (
          <div className="text-gray-500">加载中...</div>
        ) : albums.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-gray-300 p-8 text-center text-gray-500">还没有专辑</div>
        ) : (
          <div className="grid gap-4">
            {albums.map((album) => (
              <div key={album._id} className="bg-white border border-gray-200 rounded-3xl p-5 flex flex-col md:flex-row gap-5 md:items-center">
                <img src={album.coverImage} alt={album.title} className="w-28 h-28 rounded-2xl object-cover border border-gray-200" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2 flex-wrap">
                    <h3 className="text-lg font-semibold">{album.title}</h3>
                    <span className={`text-xs px-2 py-1 rounded-full ${album.status === "approved" ? "bg-emerald-100 text-emerald-700" : "bg-gray-200 text-gray-600"}`}>
                      {album.status === "approved" ? "已发布" : "已隐藏"}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500">{album.host} · {album.episodes.length} 期</p>
                  <p className="text-sm text-gray-600 mt-2 line-clamp-2">{album.description}</p>
                </div>
                <div className="flex gap-3">
                  <button onClick={() => editAlbum(album)} className="rounded-full border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50">编辑</button>
                  <Link href={`/podcast/${album._id}`} className="rounded-full border border-blue-300 text-blue-600 px-4 py-2 text-sm hover:bg-blue-50">详情页</Link>
                  <button onClick={() => handleDelete(album._id)} className="rounded-full border border-red-300 text-red-500 px-4 py-2 text-sm hover:bg-red-50">删除</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
