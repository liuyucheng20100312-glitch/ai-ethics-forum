"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import type { TranslationKey } from "../context/LanguageContext";

type TabKey = "myPosts" | "myBookmarks" | "myLikes" | "myFollows" | "myFollowers";

const TAB_KEYS: TabKey[] = ["myPosts", "myBookmarks", "myLikes", "myFollows", "myFollowers"];
const DEFAULT_BIO = "对 AI 伦理充满好奇的探索者";

interface LikedPost {
  postId: string;
  title: string;
  author: string;
  category: string;
  createdAt: string;
  likedAt: string;
}

interface MyPost {
  _id: string;
  title: string;
  titleEn?: string;
  category: string;
  content: string;
  replies: number;
  createdAt: string;
}

interface BookmarkItem {
  itemId: string;
  itemType: "news" | "podcast" | "tool" | "video";
  title: string;
  subtitle: string;
  url?: string;
  emoji: string;
  bookmarkedAt: string;
}

function EmptyState({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center text-gray-400">
      <div className="mb-3 text-4xl">{icon}</div>
      <p className="text-sm">{text}</p>
    </div>
  );
}

function formatLocaleDate(value: string, language: "zh" | "en") {
  return new Date(value).toLocaleDateString(language === "en" ? "en-US" : "zh-CN");
}

async function prepareImageFile(
  file: File,
  options: { maxWidth: number; maxHeight: number; fileName: string; quality?: number }
) {
  return new Promise<{ file: File; previewUrl: string }>((resolve, reject) => {
    const image = new window.Image();
    const objectUrl = URL.createObjectURL(file);

    image.onload = () => {
      let { width, height } = image;
      const ratio = Math.min(options.maxWidth / width, options.maxHeight / height, 1);

      width = Math.max(1, Math.round(width * ratio));
      height = Math.max(1, Math.round(height * ratio));

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");

      if (!context) {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("Canvas is not supported"));
        return;
      }

      context.drawImage(image, 0, 0, width, height);
      canvas.toBlob((blob) => {
        URL.revokeObjectURL(objectUrl);
        if (!blob) {
          reject(new Error("Image conversion failed"));
          return;
        }

        const resizedFile = new File([blob], options.fileName, { type: "image/jpeg" });
        resolve({
          file: resizedFile,
          previewUrl: URL.createObjectURL(resizedFile),
        });
      }, "image/jpeg", options.quality ?? 0.85);
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Image load failed"));
    };

    image.src = objectUrl;
  });
}

function revokePreview(url: string | null) {
  if (url) URL.revokeObjectURL(url);
}

export default function ProfilePage() {
  const { isGuest, user, authFetch, refreshUser } = useAuth();
  const { t, language } = useLanguage();
  const [activeTab, setActiveTab] = useState<TabKey>("myPosts");
  const [editMode, setEditMode] = useState(false);
  const [bio, setBio] = useState(DEFAULT_BIO);
  const [avatar, setAvatar] = useState("");
  const [backgroundImage, setBackgroundImage] = useState("");
  const [draftBio, setDraftBio] = useState("");
  const [likedPosts, setLikedPosts] = useState<LikedPost[]>([]);
  const [myPosts, setMyPosts] = useState<MyPost[]>([]);
  const [bookmarks, setBookmarks] = useState<BookmarkItem[]>([]);
  const [followings, setFollowings] = useState<{ followingUsername: string; followedAt: string }[]>([]);
  const [followers, setFollowers] = useState<{ followerUsername: string; followerId: string; followedAt: string }[]>([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [likesLoading, setLikesLoading] = useState(false);
  const [bookmarksLoading, setBookmarksLoading] = useState(false);
  const [followsLoading, setFollowsLoading] = useState(false);
  const [followersLoading, setFollowersLoading] = useState(false);
  const [pendingAvatar, setPendingAvatar] = useState<string | null>(null);
  const [pendingAvatarFile, setPendingAvatarFile] = useState<File | null>(null);
  const [avatarSaving, setAvatarSaving] = useState(false);
  const [pendingBackground, setPendingBackground] = useState<string | null>(null);
  const [pendingBackgroundFile, setPendingBackgroundFile] = useState<File | null>(null);
  const [backgroundSaving, setBackgroundSaving] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const backgroundInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isGuest || !user) return;

    if (user.avatar) setAvatar(user.avatar);
    if (user.backgroundImage) setBackgroundImage(user.backgroundImage);

    authFetch("/api/profile")
      .then((response) => response.json())
      .then((data) => {
        if (data.bio !== undefined) setBio(data.bio || DEFAULT_BIO);
        if (data.avatar !== undefined) setAvatar(data.avatar || "");
        if (data.backgroundImage !== undefined) setBackgroundImage(data.backgroundImage || "");
      })
      .catch(() => {});

    fetchMyPosts();
    fetchMyFollows();
    fetchMyFollowers();
    fetchMyBookmarks();
  }, [authFetch, isGuest, user]);

  useEffect(() => {
    return () => {
      revokePreview(pendingAvatar);
      revokePreview(pendingBackground);
    };
  }, [pendingAvatar, pendingBackground]);

  async function fetchMyPosts() {
    if (!user) return;
    setPostsLoading(true);
    try {
      const response = await fetch(`/api/posts?author=${encodeURIComponent(user.username)}`);
      const data = await response.json();
      setMyPosts(Array.isArray(data) ? data : []);
    } catch {
      setMyPosts([]);
    } finally {
      setPostsLoading(false);
    }
  }

  async function fetchMyLikes() {
    setLikesLoading(true);
    try {
      const response = await authFetch("/api/likes");
      const data = await response.json();
      setLikedPosts(Array.isArray(data) ? data : []);
    } catch {
      setLikedPosts([]);
    } finally {
      setLikesLoading(false);
    }
  }

  async function fetchMyFollows() {
    setFollowsLoading(true);
    try {
      const response = await authFetch("/api/follows?type=following");
      const data = await response.json();
      setFollowings(Array.isArray(data) ? data : []);
    } catch {
      setFollowings([]);
    } finally {
      setFollowsLoading(false);
    }
  }

  async function fetchMyFollowers() {
    setFollowersLoading(true);
    try {
      const response = await authFetch("/api/follows?type=followers");
      const data = await response.json();
      setFollowers(Array.isArray(data) ? data : []);
    } catch {
      setFollowers([]);
    } finally {
      setFollowersLoading(false);
    }
  }

  async function fetchMyBookmarks() {
    setBookmarksLoading(true);
    try {
      const response = await authFetch("/api/bookmarks");
      const data = await response.json();
      setBookmarks(Array.isArray(data) ? data : []);
    } catch {
      setBookmarks([]);
    } finally {
      setBookmarksLoading(false);
    }
  }

  async function handleRemoveBookmark(item: BookmarkItem) {
    await authFetch(`/api/bookmarks/${encodeURIComponent(item.itemId)}?type=${item.itemType}`, { method: "DELETE" });
    setBookmarks((previous) => previous.filter((bookmark) => !(bookmark.itemId === item.itemId && bookmark.itemType === item.itemType)));
  }

  async function handleUnfollow(username: string) {
    await authFetch(`/api/follows/${encodeURIComponent(username)}`, { method: "DELETE" });
    setFollowings((previous) => previous.filter((following) => following.followingUsername !== username));
  }

  function handleTabChange(tab: TabKey) {
    setActiveTab(tab);
    if (tab === "myLikes") fetchMyLikes();
    if (tab === "myPosts") fetchMyPosts();
    if (tab === "myFollows") fetchMyFollows();
    if (tab === "myFollowers") fetchMyFollowers();
    if (tab === "myBookmarks") fetchMyBookmarks();
  }

  function openEdit() {
    setDraftBio(bio);
    setEditMode(true);
  }

  async function handleSave() {
    const trimmedBio = draftBio.trim();
    setBio(trimmedBio || DEFAULT_BIO);
    setEditMode(false);
    try {
      await authFetch("/api/profile", {
        method: "PUT",
        body: JSON.stringify({ bio: trimmedBio }),
      });
    } catch {}
  }

  function handleCancel() {
    setEditMode(false);
  }

  async function handleAvatarChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      alert(language === "zh" ? "图片不能超过 10MB" : "Image must be under 10MB");
      event.target.value = "";
      return;
    }

    try {
      const prepared = await prepareImageFile(file, {
        maxWidth: 400,
        maxHeight: 400,
        fileName: "avatar.jpg",
      });
      revokePreview(pendingAvatar);
      setPendingAvatarFile(prepared.file);
      setPendingAvatar(prepared.previewUrl);
    } catch {
      alert(language === "zh" ? "头像处理失败，请重试" : "Failed to process avatar");
    }

    event.target.value = "";
  }

  async function handleAvatarSave() {
    if (!pendingAvatarFile) return;
    setAvatarSaving(true);
    try {
      const formData = new FormData();
      formData.append("avatar", pendingAvatarFile);
      const response = await authFetch("/api/profile/avatar", {
        method: "POST",
        body: formData,
      });
      const data = await response.json();
      if (!response.ok) {
        alert(data.error ?? (language === "zh" ? "保存失败，请重试" : "Save failed, please try again"));
        return;
      }

      setAvatar(data.avatar);
      revokePreview(pendingAvatar);
      setPendingAvatar(null);
      setPendingAvatarFile(null);
      await refreshUser();
    } catch {
      alert(language === "zh" ? "上传失败，请重试" : "Upload failed, please try again");
    } finally {
      setAvatarSaving(false);
    }
  }

  function handleAvatarCancel() {
    revokePreview(pendingAvatar);
    setPendingAvatar(null);
    setPendingAvatarFile(null);
  }

  async function handleBackgroundChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      alert(language === "zh" ? "图片不能超过 10MB" : "Image must be under 10MB");
      event.target.value = "";
      return;
    }

    try {
      const prepared = await prepareImageFile(file, {
        maxWidth: 1600,
        maxHeight: 900,
        fileName: "profile-background.jpg",
        quality: 0.82,
      });
      revokePreview(pendingBackground);
      setPendingBackgroundFile(prepared.file);
      setPendingBackground(prepared.previewUrl);
    } catch {
      alert(language === "zh" ? "背景图处理失败，请重试" : "Failed to process background image");
    }

    event.target.value = "";
  }

  async function handleBackgroundSave() {
    if (!pendingBackgroundFile) return;
    setBackgroundSaving(true);
    try {
      const formData = new FormData();
      formData.append("background", pendingBackgroundFile);
      const response = await authFetch("/api/profile/background", {
        method: "POST",
        body: formData,
      });
      const data = await response.json();
      if (!response.ok) {
        alert(data.error ?? (language === "zh" ? "保存失败，请重试" : "Save failed, please try again"));
        return;
      }

      setBackgroundImage(data.backgroundImage);
      revokePreview(pendingBackground);
      setPendingBackground(null);
      setPendingBackgroundFile(null);
      await refreshUser();
    } catch {
      alert(language === "zh" ? "上传失败，请重试" : "Upload failed, please try again");
    } finally {
      setBackgroundSaving(false);
    }
  }

  function handleBackgroundCancel() {
    revokePreview(pendingBackground);
    setPendingBackground(null);
    setPendingBackgroundFile(null);
  }

  const statsCount = {
    posts: myPosts.length,
    likes: likedPosts.length,
    follows: followings.length,
    followers: followers.length,
    bookmarks: bookmarks.length,
  };

  const displayName = user?.verified && user?.realName ? user.realName : user?.username ?? "";
  const visibleBackground = pendingBackground ?? backgroundImage;

  return (
    <div className="max-w-3xl space-y-8">
      {isGuest && (
        <div className="rounded-2xl border border-gray-100 bg-white p-8 text-center shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-gray-100 text-4xl dark:bg-gray-700">👤</div>
          <h2 className="mb-1 text-xl font-bold text-gray-800 dark:text-gray-100">{t("guestTitle")}</h2>
          <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">{t("guestDesc")}</p>
          <div className="flex justify-center gap-3">
            <Link href="/login" className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700">
              {t("loginAccount")}
            </Link>
            <Link href="/register" className="rounded-lg border border-blue-600 px-6 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20">
              {t("registerAccount")}
            </Link>
          </div>
          <p className="mt-4 text-xs text-gray-400 dark:text-gray-500">{t("guestRegisterHint")}</p>
        </div>
      )}

      {!isGuest && (
        <>
          <div className={`relative overflow-hidden rounded-2xl border border-gray-100 shadow-sm ${visibleBackground ? "bg-transparent" : "bg-white"}`}>
            {visibleBackground && (
              <>
                <img
                  src={visibleBackground}
                  alt={language === "zh" ? "个人主页背景图" : "Profile background"}
                  className="absolute inset-0 h-full w-full object-cover object-center"
                />
                <div className="absolute inset-0 bg-gradient-to-b from-white/45 via-white/30 to-white/22 backdrop-blur-[0.5px]" />
              </>
            )}
            <div className="relative z-10">
            <div className={`relative h-52 overflow-hidden ${visibleBackground ? "bg-transparent" : "bg-[linear-gradient(90deg,#ff7a2f_0%,#ffc793_24%,#fffaf6_52%,#ffe4ed_76%,#f5a3c7_100%)]"}`}>
              {!visibleBackground && (
                <>
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_52%_42%,rgba(255,255,255,0.96)_0%,rgba(255,255,255,0.78)_20%,rgba(255,255,255,0)_54%)]" />
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_78%,rgba(255,255,255,0.18)_0%,rgba(255,255,255,0)_34%)]" />
                </>
              )}
              <div className={`absolute inset-0 ${visibleBackground ? "bg-transparent" : "bg-gradient-to-t from-white/14 via-white/4 to-transparent"}`} />
              <input ref={backgroundInputRef} type="file" accept="image/*" className="hidden" onChange={handleBackgroundChange} />
              <button
                type="button"
                onClick={() => backgroundInputRef.current?.click()}
                className="absolute right-4 top-4 rounded-full border border-white/30 bg-black/35 px-3 py-1.5 text-xs font-medium text-white backdrop-blur hover:bg-black/45"
              >
                {language === "zh" ? "更换背景图" : "Change Background"}
              </button>
              {pendingBackground && (
                <div className="absolute bottom-4 right-4 flex gap-2">
                  <button
                    type="button"
                    onClick={handleBackgroundSave}
                    disabled={backgroundSaving}
                    className="rounded-full bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-60"
                  >
                    {backgroundSaving ? (language === "zh" ? "保存中..." : "Saving...") : t("saveProfile")}
                  </button>
                  <button
                    type="button"
                    onClick={handleBackgroundCancel}
                    className="rounded-full border border-white/40 bg-white/15 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/25"
                  >
                    {t("cancelEdit")}
                  </button>
                </div>
              )}
            </div>

            <div className="px-6 pb-6">
              <div className="-mt-10 flex flex-col gap-5 md:flex-row md:items-start">
                <div className="shrink-0">
                  <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
                  <div className="relative">
                    {(pendingAvatar ?? avatar) ? (
                      <img
                        src={pendingAvatar ?? avatar}
                        alt={language === "zh" ? "头像" : "Avatar"}
                        className={`h-24 w-24 rounded-full border-4 bg-white object-cover shadow-lg ${pendingAvatar ? "border-blue-400" : "border-white"}`}
                      />
                    ) : (
                      <div className="flex h-24 w-24 items-center justify-center rounded-full border-4 border-white bg-gradient-to-br from-blue-400 to-indigo-600 text-3xl font-bold text-white shadow-lg">
                        {displayName[0] ?? "U"}
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => avatarInputRef.current?.click()}
                      title={t("changeAvatar")}
                      className="absolute bottom-0 right-0 flex h-7 w-7 items-center justify-center rounded-full border border-gray-200 bg-white text-xs shadow hover:bg-gray-50"
                    >
                      📷
                    </button>
                  </div>
                  {pendingAvatar && (
                    <div className="mt-2 flex gap-1">
                      <button
                        type="button"
                        onClick={handleAvatarSave}
                        disabled={avatarSaving}
                        className="rounded-lg bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-700 disabled:opacity-60"
                      >
                        {avatarSaving ? (language === "zh" ? "保存中..." : "Saving...") : (language === "zh" ? "保存头像" : "Save Avatar")}
                      </button>
                      <button
                        type="button"
                        onClick={handleAvatarCancel}
                        className="rounded-lg border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50"
                      >
                        {t("cancelEdit")}
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex-1 pt-2">
                  {editMode ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5">
                        <span className="text-sm text-gray-500">{language === "zh" ? "用户名：" : "Username:"}</span>
                        <span className="text-sm font-medium text-gray-700">{user?.username}</span>
                        <span className="ml-1 text-xs text-gray-400">{language === "zh" ? "(不可修改)" : "(read only)"}</span>
                      </div>
                      <input
                        value={draftBio}
                        onChange={(event) => setDraftBio(event.target.value)}
                        className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder={t("bioLabel")}
                        maxLength={100}
                      />
                      <div className="flex gap-2 pt-1">
                        <button type="button" onClick={handleSave} className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm text-white hover:bg-blue-700">
                          {t("saveProfile")}
                        </button>
                        <button type="button" onClick={handleCancel} className="rounded-lg border border-gray-300 px-4 py-1.5 text-sm hover:bg-gray-50">
                          {t("cancelEdit")}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <h2 className="text-3xl font-semibold tracking-tight text-slate-900/95">{displayName}</h2>
                        {user?.isAdmin ? (
                          <span className="inline-flex items-center rounded-full border border-red-200/80 bg-red-50/85 px-2.5 py-0.5 text-[13px] font-medium text-red-700">
                            {language === "zh" ? "管理员" : "Admin"}
                          </span>
                        ) : user?.verified ? (
                          <span className="inline-flex items-center rounded-full border border-blue-200/80 bg-blue-50/85 px-2.5 py-0.5 text-[13px] font-medium text-blue-700">
                            {language === "zh" ? "校园认证" : "Verified"}
                          </span>
                        ) : (
                          <span className="rounded-full bg-gray-100/85 px-2.5 py-0.5 text-[13px] text-gray-600">
                            {language === "zh" ? "普通用户" : "Member"}
                          </span>
                        )}
                      </div>
                      {user?.verified && !user?.isAdmin && (
                        <p className="mb-1 text-xs text-gray-400">
                          @{user.username}
                          {user.classId && (
                            <span className="ml-2 rounded bg-indigo-50 px-1.5 py-0.5 text-xs text-indigo-600">{user.classId}</span>
                          )}
                        </p>
                      )}
                      <p className="mb-3 text-base leading-7 text-slate-600/90">{bio || (language === "zh" ? "暂无简介" : "No bio yet")}</p>
                      <div className="mb-3 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-600/90">
                        <span><strong className="font-semibold text-slate-900 tabular-nums">{statsCount.posts}</strong> {t("myPosts")}</span>
                        <span><strong className="font-semibold text-slate-900 tabular-nums">{statsCount.bookmarks}</strong> {t("myBookmarks")}</span>
                        <span><strong className="font-semibold text-slate-900 tabular-nums">{statsCount.likes}</strong> {t("myLikes")}</span>
                        <span><strong className="font-semibold text-slate-900 tabular-nums">{statsCount.follows}</strong> {t("myFollows")}</span>
                        <span><strong className="font-semibold text-slate-900 tabular-nums">{statsCount.followers}</strong> {language === "zh" ? "粉丝" : "Followers"}</span>
                      </div>
                      <button
                        type="button"
                        onClick={openEdit}
                        className="rounded-full border border-white/50 bg-white/12 px-4 py-1.5 text-sm font-medium text-slate-700/95 backdrop-blur-sm transition hover:bg-white/20"
                      >
                        {t("editProfile")}
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div className="mt-5 pt-4">
                {user?.isAdmin ? (
                  <div className="flex items-center gap-3 rounded-2xl border border-white/55 bg-white/22 p-4 backdrop-blur-md shadow-[0_8px_24px_rgba(15,23,42,0.12)]">
                    <span className="text-2xl">🛡️</span>
                    <div>
                      <p className="text-xl font-semibold tracking-tight text-slate-800">{language === "zh" ? "管理员认证" : "Admin verified"}</p>
                      <p className="mt-0.5 text-base text-slate-700/90">{language === "zh" ? "拥有论坛最高管理权限" : "Has full forum administration access"}</p>
                    </div>
                  </div>
                ) : user?.verified ? (
                  <div className="flex items-center gap-3 rounded-2xl border border-white/55 bg-white/22 p-4 backdrop-blur-md shadow-[0_8px_24px_rgba(15,23,42,0.12)]">
                    <span className="text-2xl">🎓</span>
                    <div>
                      <p className="text-xl font-semibold tracking-tight text-slate-800">{language === "zh" ? "校园身份认证通过" : "School identity verified"}</p>
                      <p className="mt-0.5 text-base text-slate-700/90">
                        {language === "zh"
                          ? `真实姓名：${user.realName ?? "-"}，所在班级：${user.classId ?? "-"}`
                          : `Name: ${user.realName ?? "-"}, Class: ${user.classId ?? "-"}`}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <span>🎓</span>
                      <span>{language === "zh" ? "校园身份：未认证" : "School identity: not verified"}</span>
                    </div>
                    <span className="text-xs text-gray-400">{language === "zh" ? "名单内用户注册后可获得认证" : "Eligible campus users can be verified after registration"}</span>
                  </div>
                )}
              </div>
            </div>
            </div>
          </div>

          <div>
            <div className="mb-6 flex gap-1 border-b border-gray-200">
              {TAB_KEYS.map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => handleTabChange(key)}
                  className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
                    activeTab === key ? "border-blue-600 text-blue-700" : "border-transparent text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {t(key as TranslationKey)}
                </button>
              ))}
            </div>

            {activeTab === "myPosts" ? (
              postsLoading ? (
                <div className="flex justify-center py-12"><span className="text-sm text-gray-400">{t("loading")}</span></div>
              ) : myPosts.length === 0 ? (
                <EmptyState icon="📝" text={t("noPostsTab")} />
              ) : (
                <div className="space-y-3">
                  {myPosts.map((post) => (
                    <Link key={post._id} href={`/post/${post._id}`} className="block rounded-xl border border-gray-100 bg-white px-5 py-4 shadow-sm transition-shadow hover:shadow-md">
                      <div className="flex items-start justify-between">
                        <div>
                          <h4 className="font-medium text-gray-900">{language === "en" && post.titleEn ? post.titleEn : post.title}</h4>
                          <p className="mt-0.5 text-xs text-gray-400">
                            {post.category} 路 {post.replies} {t("repliesCount")} 路 {formatLocaleDate(post.createdAt, language)}
                          </p>
                        </div>
                        <span className="text-sm text-blue-400">📝</span>
                      </div>
                    </Link>
                  ))}
                </div>
              )
            ) : activeTab === "myLikes" ? (
              likesLoading ? (
                <div className="flex justify-center py-12"><span className="text-sm text-gray-400">{t("loading")}</span></div>
              ) : likedPosts.length === 0 ? (
                <EmptyState icon="❤️" text={t("noLikes")} />
              ) : (
                <div className="space-y-3">
                  {[...likedPosts].reverse().map((post) => (
                    <Link key={post.likedAt} href={`/post/${post.postId}`} className="block rounded-xl border border-gray-100 bg-white px-5 py-4 shadow-sm transition-shadow hover:shadow-md">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-medium text-gray-900">{post.title}</h4>
                          <p className="mt-0.5 text-xs text-gray-400">
                            {post.author} 路 {post.category} 路 {t("likedAt")} {formatLocaleDate(post.likedAt, language)}
                          </p>
                        </div>
                        <span className="text-sm text-red-400">❤</span>
                      </div>
                    </Link>
                  ))}
                </div>
              )
            ) : activeTab === "myBookmarks" ? (
              bookmarksLoading ? (
                <div className="flex justify-center py-12"><span className="text-sm text-gray-400">{t("loading")}</span></div>
              ) : bookmarks.length === 0 ? (
                <EmptyState icon="⭐" text={t("noBookmarks")} />
              ) : (
                <div className="space-y-3">
                  {bookmarks.map((bookmark) => (
                    <div key={`${bookmark.itemType}-${bookmark.itemId}`} className="flex items-center justify-between rounded-xl border border-gray-100 bg-white px-5 py-4 shadow-sm transition-shadow hover:shadow-md">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{bookmark.emoji}</span>
                        <div>
                          <p className="text-sm font-medium text-gray-900">{bookmark.title}</p>
                          <p className="mt-0.5 text-xs text-gray-400">
                            {bookmark.subtitle} 路 {formatLocaleDate(bookmark.bookmarkedAt, language)}
                          </p>
                        </div>
                      </div>
                      <button type="button" onClick={() => handleRemoveBookmark(bookmark)} className="ml-4 text-xl leading-none text-yellow-500 transition-colors hover:text-gray-400">
                        ★
                      </button>
                    </div>
                  ))}
                </div>
              )
            ) : activeTab === "myFollows" ? (
              followsLoading ? (
                <div className="flex justify-center py-12"><span className="text-sm text-gray-400">{t("loading")}</span></div>
              ) : followings.length === 0 ? (
                <EmptyState icon="👥" text={t("noFollows")} />
              ) : (
                <div className="space-y-3">
                  {followings.map((following) => (
                    <div key={following.followingUsername} className="flex items-center justify-between rounded-xl border border-gray-100 bg-white px-5 py-4 shadow-sm">
                      <Link href={`/user/${following.followingUsername}`} className="transition-colors hover:text-blue-600">
                        <p className="font-medium text-gray-900">{following.followingUsername}</p>
                        <p className="mt-0.5 text-xs text-gray-400">{t("followedAt")} {formatLocaleDate(following.followedAt, language)}</p>
                      </Link>
                      <button type="button" onClick={() => handleUnfollow(following.followingUsername)} className="rounded-full border border-gray-300 px-3 py-1 text-xs text-gray-500 transition-colors hover:border-red-300 hover:text-red-500">
                        {t("unfollow")}
                      </button>
                    </div>
                  ))}
                </div>
              )
            ) : followersLoading ? (
              <div className="flex justify-center py-12"><span className="text-sm text-gray-400">{t("loading")}</span></div>
            ) : followers.length === 0 ? (
              <EmptyState icon="👤" text={language === "zh" ? "还没有粉丝" : "No followers yet"} />
            ) : (
              <div className="space-y-3">
                {followers.map((follower) => (
                  <div key={follower.followerId} className="flex items-center justify-between rounded-xl border border-gray-100 bg-white px-5 py-4 shadow-sm">
                    <div>
                      <p className="font-medium text-gray-900">{follower.followerUsername}</p>
                      <p className="mt-0.5 text-xs text-gray-400">
                        {language === "zh" ? "关注于" : "Followed at"} {formatLocaleDate(follower.followedAt, language)}
                      </p>
                    </div>
                    <Link href={`/user/${follower.followerUsername}`} className="rounded-full border border-blue-300 px-3 py-1 text-xs text-blue-600 transition-colors hover:bg-blue-50">
                      {language === "zh" ? "查看主页" : "View Profile"}
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

