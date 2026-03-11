"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import type { TranslationKey } from "../context/LanguageContext";

type TabKey = "myPosts" | "myBookmarks" | "myLikes" | "myFollows";
const TAB_KEYS: TabKey[] = ["myPosts", "myBookmarks", "myLikes", "myFollows"];
const LS_KEY = "ai_ethics_profile";

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
  itemType: "news" | "podcast" | "tool";
  title: string;
  subtitle: string;
  url?: string;
  emoji: string;
  bookmarkedAt: string;
}

function displayWidth(s: string): number {
  let w = 0;
  for (const c of s) {
    w += /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff\u3040-\u30ff\uac00-\ud7af]/.test(c) ? 2 : 1;
  }
  return w;
}
const MAX_WIDTH = 20;

interface ProfileData {
  username: string;
  bio: string;
  avatar: string;
}

function loadProfile(): ProfileData {
  if (typeof window === "undefined")
    return { username: "用户_2026", bio: "对AI伦理充满好奇的探索者", avatar: "" };
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<ProfileData & { avatarId: string }>;
      return {
        username: p.username ?? "用户_2026",
        bio: p.bio ?? "对AI伦理充满好奇的探索者",
        avatar: typeof p.avatar === "string" && p.avatar.startsWith("data:") ? p.avatar : "",
      };
    }
  } catch {}
  return { username: "用户_2026", bio: "对AI伦理充满好奇的探索者", avatar: "" };
}

function saveProfile(data: ProfileData) {
  localStorage.setItem(LS_KEY, JSON.stringify(data));
}

function EmptyState({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center text-gray-400">
      <div className="text-4xl mb-3">{icon}</div>
      <p className="text-sm">{text}</p>
    </div>
  );
}

export default function ProfilePage() {
  const { isGuest, user, authFetch } = useAuth();
  const { t, language } = useLanguage();
  const [activeTab, setActiveTab] = useState<TabKey>("myPosts");
  const [editMode, setEditMode] = useState(false);
  const [bio, setBio] = useState("对AI伦理充满好奇的探索者");
  const [avatar, setAvatar] = useState("");
  const [draftBio, setDraftBio] = useState("");
  const [likedPosts, setLikedPosts] = useState<LikedPost[]>([]);
  const [myPosts, setMyPosts] = useState<MyPost[]>([]);
  const [bookmarks, setBookmarks] = useState<BookmarkItem[]>([]);
  const [followings, setFollowings] = useState<{ followingUsername: string; followedAt: string }[]>([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [likesLoading, setLikesLoading] = useState(false);
  const [bookmarksLoading, setBookmarksLoading] = useState(false);
  const [followsLoading, setFollowsLoading] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isGuest || !user) return;
    const p = loadProfile();
    setBio(p.bio);
    setAvatar(p.avatar);
    fetchMyPosts();
    fetchMyFollows();
    fetchMyBookmarks();
  }, [isGuest, user]);  // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchMyPosts() {
    if (!user) return;
    setPostsLoading(true);
    try {
      const res = await fetch(`/api/posts?author=${encodeURIComponent(user.username)}`);
      const data = await res.json();
      setMyPosts(Array.isArray(data) ? data : []);
    } catch {}
    finally { setPostsLoading(false); }
  }

  async function fetchMyLikes() {
    setLikesLoading(true);
    try {
      const res = await authFetch("/api/likes");
      const data = await res.json();
      setLikedPosts(Array.isArray(data) ? data : []);
    } catch {}
    finally { setLikesLoading(false); }
  }

  async function fetchMyFollows() {
    setFollowsLoading(true);
    try {
      const res = await authFetch("/api/follows");
      const data = await res.json();
      setFollowings(Array.isArray(data) ? data : []);
    } catch {}
    finally { setFollowsLoading(false); }
  }

  async function fetchMyBookmarks() {
    setBookmarksLoading(true);
    try {
      const res = await authFetch("/api/bookmarks");
      const data = await res.json();
      setBookmarks(Array.isArray(data) ? data : []);
    } catch {}
    finally { setBookmarksLoading(false); }
  }

  async function handleRemoveBookmark(item: BookmarkItem) {
    await authFetch(`/api/bookmarks/${encodeURIComponent(item.itemId)}?type=${item.itemType}`, { method: "DELETE" });
    setBookmarks((prev) => prev.filter((b) => !(b.itemId === item.itemId && b.itemType === item.itemType)));
  }

  async function handleUnfollow(username: string) {
    await authFetch(`/api/follows/${encodeURIComponent(username)}`, { method: "DELETE" });
    setFollowings((prev) => prev.filter((f) => f.followingUsername !== username));
  }

  function handleTabChange(tab: TabKey) {
    setActiveTab(tab);
    if (tab === "myLikes") fetchMyLikes();
    if (tab === "myPosts") fetchMyPosts();
    if (tab === "myFollows") fetchMyFollows();
    if (tab === "myBookmarks") fetchMyBookmarks();
  }

  function openEdit() {
    setDraftBio(bio);
    setEditMode(true);
  }

  function handleSave() {
    const trimmedBio = draftBio.trim();
    setBio(trimmedBio);
    saveProfile({ username: user?.username ?? "", bio: trimmedBio, avatar });
    setEditMode(false);
  }

  function handleCancel() {
    setEditMode(false);
  }

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      alert(t("avatarSizeLimit"));
      e.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      setAvatar(dataUrl);
      saveProfile({ username: user?.username ?? "", bio, avatar: dataUrl });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  const statsCount = { posts: myPosts.length, likes: likedPosts.length, follows: followings.length, bookmarks: bookmarks.length };
  const displayName = user?.verified && user?.realName ? user.realName : user?.username ?? "";

  return (
    <div className="max-w-3xl space-y-8">
      {isGuest && (
        <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl p-8 shadow-sm text-center">
          <div className="w-20 h-20 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-4xl mx-auto mb-4">👤</div>
          <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-1">{t("guestTitle")}</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">{t("guestDesc")}</p>
          <div className="flex gap-3 justify-center">
            <Link href="/login" className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 font-medium text-sm">{t("loginAccount")}</Link>
            <Link href="/register" className="border border-blue-600 text-blue-600 px-6 py-2 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 font-medium text-sm">{t("registerAccount")}</Link>
          </div>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-4">{t("guestRegisterHint")}</p>
        </div>
      )}

      {!isGuest && (<>
      <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm">
        <div className="flex items-start gap-5">
          <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
          <div className="relative flex-shrink-0">
            {avatar ? (
              <img src={avatar} alt="头像" className="w-20 h-20 rounded-full object-cover border border-gray-200" />
            ) : (
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-400 to-indigo-600 flex items-center justify-center text-white text-3xl font-bold">
                {displayName[0]}
              </div>
            )}
            <button
              onClick={() => avatarInputRef.current?.click()}
              title={t("changeAvatar")}
              className="absolute bottom-0 right-0 w-6 h-6 bg-white border border-gray-200 rounded-full flex items-center justify-center text-xs shadow hover:bg-gray-50 transition-colors"
            >
              📷
            </button>
          </div>

          <div className="flex-1">
            {editMode ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg">
                  <span className="text-sm text-gray-500">用户名：</span>
                  <span className="text-sm font-medium text-gray-700">{user?.username}</span>
                  <span className="text-xs text-gray-400 ml-1">(不可修改)</span>
                </div>
                <input
                  value={draftBio}
                  onChange={(e) => setDraftBio(e.target.value)}
                  className="block w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder={t("bioLabel")}
                  maxLength={100}
                />
                <div className="flex gap-2 pt-1">
                  <button onClick={handleSave} className="text-sm bg-blue-600 text-white px-4 py-1.5 rounded-lg hover:bg-blue-700 transition-colors">
                    {t("saveProfile")}
                  </button>
                  <button onClick={handleCancel} className="text-sm border border-gray-300 px-4 py-1.5 rounded-lg hover:bg-gray-50 transition-colors">
                    {t("cancelEdit")}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                  <h2 className="text-lg font-bold text-gray-900">{displayName}</h2>
                  {user?.isAdmin ? (
                    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-red-50 text-red-700 border border-red-200 rounded-full font-medium">
                      🛡️ 管理员
                    </span>
                  ) : user?.verified ? (
                    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-full font-medium">
                      🎓 校园身份认证
                    </span>
                  ) : (
                    <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full">
                      普通用户
                    </span>
                  )}
                </div>
                {user?.verified && !user?.isAdmin && (
                  <p className="text-xs text-gray-400 mb-1">
                    用户名：{user.username}
                    {user.classId && (
                      <span className="ml-2 px-1.5 py-0.5 bg-indigo-50 text-indigo-600 rounded text-xs">{user.classId}</span>
                    )}
                  </p>
                )}
                <p className="text-sm text-gray-500 mb-3">{bio}</p>
                <div className="flex gap-4 text-sm text-gray-500 mb-3">
                  <span><strong className="text-gray-900">{statsCount.posts}</strong> {t("myPosts")}</span>
                  <span><strong className="text-gray-900">{statsCount.bookmarks}</strong> {t("myBookmarks")}</span>
                  <span><strong className="text-gray-900">{statsCount.likes}</strong> {t("myLikes")}</span>
                  <span><strong className="text-gray-900">{statsCount.follows}</strong> {t("myFollows")}</span>
                </div>
                <button onClick={openEdit} className="text-sm border border-gray-300 px-4 py-1.5 rounded-lg hover:bg-gray-50 transition-colors">
                  {t("editProfile")}
                </button>
              </>
            )}
          </div>
        </div>

        <div className="mt-5 pt-5 border-t border-gray-100">
          {user?.isAdmin ? (
            <div className="flex items-center gap-3 p-3 bg-red-50 border border-red-100 rounded-xl">
              <span className="text-2xl">🛡️</span>
              <div>
                <p className="text-sm font-semibold text-red-800">管理员认证</p>
                <p className="text-xs text-red-500 mt-0.5">拥有论坛最高管理权限</p>
              </div>
              <span className="ml-auto text-red-400 text-lg">✅</span>
            </div>
          ) : user?.verified ? (
            <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-100 rounded-xl">
              <span className="text-2xl">🎓</span>
              <div>
                <p className="text-sm font-semibold text-blue-800">校园身份认证通过</p>
                <p className="text-xs text-blue-600 mt-0.5">真实姓名：{user.realName}　所在班级：{user.classId}</p>
              </div>
              <span className="ml-auto text-blue-400 text-lg">✅</span>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <span>🎓</span>
                <span>校园身份：<strong className="text-gray-700">未认证</strong></span>
              </div>
              <span className="text-xs text-gray-400">仅限名单内用户注册可获得认证</span>
            </div>
          )}
        </div>
      </div>

      <div>
        <div className="flex gap-1 border-b border-gray-200 mb-6">
          {TAB_KEYS.map((key) => (
            <button
              key={key}
              onClick={() => handleTabChange(key)}
              className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                activeTab === key ? "border-blue-600 text-blue-700" : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {t(key as TranslationKey)}
            </button>
          ))}
        </div>

        {activeTab === "myPosts" ? (
          postsLoading ? (
            <div className="flex justify-center py-12"><span className="text-gray-400 text-sm">{t("loading") || "Loading…"}</span></div>
          ) : myPosts.length === 0 ? (
            <EmptyState icon="📝" text={t("noPostsTab")} />
          ) : (
            <div className="space-y-3">
              {myPosts.map((post) => (
                <Link key={post._id} href={`/post/${post._id}`} className="block bg-white border border-gray-100 rounded-xl px-5 py-4 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="font-medium text-gray-900">{language === "en" && post.titleEn ? post.titleEn : post.title}</h4>
                      <p className="text-xs text-gray-400 mt-0.5">{post.category} · {post.replies} {t("repliesCount")} · {new Date(post.createdAt).toLocaleDateString(language === "en" ? "en-US" : "zh-CN")}</p>
                    </div>
                    <span className="text-blue-400 text-sm">📝</span>
                  </div>
                </Link>
              ))}
            </div>
          )
        ) : activeTab === "myLikes" ? (
          likesLoading ? (
            <div className="flex justify-center py-12"><span className="text-gray-400 text-sm">{t("loading") || "Loading…"}</span></div>
          ) : likedPosts.length === 0 ? (
            <EmptyState icon="👍" text={t("noLikes")} />
          ) : (
            <div className="space-y-3">
              {[...likedPosts].reverse().map((p) => (
                <Link key={p.likedAt} href={`/post/${p.postId}`} className="block bg-white border border-gray-100 rounded-xl px-5 py-4 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-medium text-gray-900">{p.title}</h4>
                      <p className="text-xs text-gray-400 mt-0.5">{p.author} · {p.category} · {t("likedAt")} {new Date(p.likedAt).toLocaleDateString(language === "en" ? "en-US" : "zh-CN")}</p>
                    </div>
                    <span className="text-red-400 text-sm">❤️</span>
                  </div>
                </Link>
              ))}
            </div>
          )
        ) : activeTab === "myBookmarks" ? (
          bookmarksLoading ? (
            <div className="flex justify-center py-12"><span className="text-gray-400 text-sm">{t("loading")}</span></div>
          ) : bookmarks.length === 0 ? (
            <EmptyState icon="⭐" text={t("noBookmarks")} />
          ) : (
            <div className="space-y-3">
              {bookmarks.map((b) => (
                <div key={`${b.itemType}-${b.itemId}`} className="flex items-center justify-between bg-white border border-gray-100 rounded-xl px-5 py-4 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{b.emoji}</span>
                    <div>
                      <p className="font-medium text-gray-900 text-sm">{b.title}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{b.subtitle} · {new Date(b.bookmarkedAt).toLocaleDateString(language === "en" ? "en-US" : "zh-CN")}</p>
                    </div>
                  </div>
                  <button onClick={() => handleRemoveBookmark(b)} title="取消收藏" className="text-yellow-500 hover:text-gray-400 transition-colors text-xl leading-none ml-4">★</button>
                </div>
              ))}
            </div>
          )
        ) : activeTab === "myFollows" ? (
          followsLoading ? (
            <div className="flex justify-center py-12"><span className="text-gray-400 text-sm">{t("loading")}</span></div>
          ) : followings.length === 0 ? (
            <EmptyState icon="👥" text={t("noFollows")} />
          ) : (
            <div className="space-y-3">
              {followings.map((f) => (
                <div key={f.followingUsername} className="flex items-center justify-between bg-white border border-gray-100 rounded-xl px-5 py-4 shadow-sm">
                  <div>
                    <p className="font-medium text-gray-900">{f.followingUsername}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{t("followedAt")} {new Date(f.followedAt).toLocaleDateString(language === "en" ? "en-US" : "zh-CN")}</p>
                  </div>
                  <button onClick={() => handleUnfollow(f.followingUsername)} className="text-xs px-3 py-1 rounded-full border border-gray-300 text-gray-500 hover:border-red-300 hover:text-red-500 transition-colors">
                    {t("unfollow")}
                  </button>
                </div>
              ))}
            </div>
          )
        ) : null}
      </div>
      </>)}
    </div>
  );
}
