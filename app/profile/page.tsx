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

// ── Username validation ───────────────────────────────────────────────────────
// CJK character = 2 display units, others = 1; max total = 20 (= 10 CJK or 20 ASCII)
function displayWidth(s: string): number {
  let w = 0;
  for (const c of s) {
    w += /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff\u3040-\u30ff\uac00-\ud7af]/.test(c) ? 2 : 1;
  }
  return w;
}
const MAX_WIDTH = 20;

// ── localStorage helpers ──────────────────────────────────────────────────────
interface ProfileData {
  username: string;
  bio: string;
  avatar: string; // base64 data URL or ""
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
        // avatarId was old format — discard it
        avatar: typeof p.avatar === "string" && p.avatar.startsWith("data:") ? p.avatar : "",
      };
    }
  } catch {}
  return { username: "用户_2026", bio: "对AI伦理充满好奇的探索者", avatar: "" };
}

function saveProfile(data: ProfileData) {
  localStorage.setItem(LS_KEY, JSON.stringify(data));
}

// ── EmptyState ────────────────────────────────────────────────────────────────
function EmptyState({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center text-gray-400">
      <div className="text-4xl mb-3">{icon}</div>
      <p className="text-sm">{text}</p>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ProfilePage() {
  const { isGuest, user, authFetch } = useAuth();
  const { t, language } = useLanguage();
  const [activeTab, setActiveTab] = useState<TabKey>("myPosts");
  const [editMode, setEditMode] = useState(false);
  const [username, setUsername] = useState("用户_2026");
  const [bio, setBio] = useState("对AI伦理充满好奇的探索者");
  const [avatar, setAvatar] = useState("");
  const [draftUsername, setDraftUsername] = useState("");
  const [draftBio, setDraftBio] = useState("");
  const [usernameError, setUsernameError] = useState("");
  // API-backed data
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
    setUsername(p.username);
    setBio(p.bio);
    setAvatar(p.avatar);
    // Load initial tab data
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
    setDraftUsername(username);
    setDraftBio(bio);
    setUsernameError("");
    setEditMode(true);
  }

  function handleDraftUsernameChange(val: string) {
    setDraftUsername(val);
    if (val.trim() === "") {
      setUsernameError(t("usernameEmpty"));
    } else if (displayWidth(val) > MAX_WIDTH) {
      setUsernameError(t("usernameLimit"));
    } else {
      setUsernameError("");
    }
  }

  function handleSave() {
    const trimmed = draftUsername.trim();
    if (!trimmed || displayWidth(trimmed) > MAX_WIDTH) return;
    setUsername(trimmed);
    setBio(draftBio.trim());
    saveProfile({ username: trimmed, bio: draftBio.trim(), avatar });
    setEditMode(false);
  }

  function handleCancel() {
    setEditMode(false);
    setUsernameError("");
  }

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reject files over 2 MB
    if (file.size > 2 * 1024 * 1024) {
      alert(t("avatarSizeLimit"));
      e.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      setAvatar(dataUrl);
      saveProfile({ username, bio, avatar: dataUrl });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  const widthLeft = MAX_WIDTH - displayWidth(draftUsername);
  // Count stats from real data
  const statsCount = { posts: myPosts.length, likes: likedPosts.length, follows: followings.length, bookmarks: bookmarks.length };

  return (
    <div className="max-w-3xl space-y-8">
      {/* Guest view */}
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
          {/* Hidden file input */}
          <input
            ref={avatarInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleAvatarChange}
          />
          <div className="relative flex-shrink-0">
            {avatar ? (
              <img
                src={avatar}
                alt="头像"
                className="w-20 h-20 rounded-full object-cover border border-gray-200"
              />
            ) : (
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-400 to-indigo-600 flex items-center justify-center text-white text-3xl font-bold">
                {username[0]}
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
                <div>
                  <input
                    value={draftUsername}
                    onChange={(e) => handleDraftUsernameChange(e.target.value)}
                    className={`block w-full border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 ${
                      usernameError
                        ? "border-red-400 focus:ring-red-400"
                        : "border-gray-300 focus:ring-blue-500"
                    }`}
                    placeholder={t("username")}
                    maxLength={30}
                  />
                  <div className="flex justify-between mt-0.5">
                    {usernameError ? (
                      <p className="text-xs text-red-500">{usernameError}</p>
                    ) : (
                      <span />
                    )}
                    <p className={`text-xs ${
                      widthLeft < 0 ? "text-red-500" : widthLeft <= 4 ? "text-orange-400" : "text-gray-400"
                    }`}>
                      {Math.max(0, widthLeft)} left
                    </p>
                  </div>
                </div>
                <input
                  value={draftBio}
                  onChange={(e) => setDraftBio(e.target.value)}
                  className="block w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder={t("bioLabel")}
                  maxLength={100}
                />
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={handleSave}
                    disabled={!!usernameError || !draftUsername.trim()}
                    className="text-sm bg-blue-600 text-white px-4 py-1.5 rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    {t("saveProfile")}
                  </button>
                  <button
                    onClick={handleCancel}
                    className="text-sm border border-gray-300 px-4 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    {t("cancelEdit")}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 mb-1">
                  <h2 className="text-lg font-bold text-gray-900">{username}</h2>
                  <span className="text-xs px-2 py-0.5 bg-green-50 text-green-700 rounded-full">普通用户</span>
                </div>
                <p className="text-sm text-gray-500 mb-3">{bio}</p>
                <div className="flex gap-4 text-sm text-gray-500 mb-3">
                  <span><strong className="text-gray-900">{statsCount.posts}</strong> {t("myPosts")}</span>
                  <span><strong className="text-gray-900">{statsCount.bookmarks}</strong> {t("myBookmarks")}</span>
                  <span><strong className="text-gray-900">{statsCount.likes}</strong> {t("myLikes")}</span>
                  <span><strong className="text-gray-900">{statsCount.follows}</strong> {t("myFollows")}</span>
                </div>
                <button
                  onClick={openEdit}
                  className="text-sm border border-gray-300 px-4 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  {t("editProfile")}
                </button>
              </>
            )}
          </div>
        </div>

        {/* 校园认证 */}
        <div className="mt-5 pt-5 border-t border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <span>🎓</span>
            <span>校园身份：<strong className="text-gray-900">未认证</strong></span>
          </div>
          <button className="text-sm bg-indigo-50 text-indigo-700 border border-indigo-200 px-4 py-1.5 rounded-lg hover:bg-indigo-100 transition-colors">
            申请认证
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div>
        <div className="flex gap-1 border-b border-gray-200 mb-6">
          {TAB_KEYS.map((key) => (
            <button
              key={key}
              onClick={() => handleTabChange(key)}
              className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                activeTab === key
                  ? "border-blue-600 text-blue-700"
                  : "border-transparent text-gray-500 hover:text-gray-700"
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
                <Link
                  key={post._id}
                  href={`/post/${post._id}`}
                  className="block bg-white border border-gray-100 rounded-xl px-5 py-4 shadow-sm hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="font-medium text-gray-900">
                        {language === "en" && post.titleEn ? post.titleEn : post.title}
                      </h4>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {post.category} · {post.replies} {t("repliesCount")} · {new Date(post.createdAt).toLocaleDateString(language === "en" ? "en-US" : "zh-CN")}
                      </p>
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
                <Link
                  key={p.likedAt}
                  href={`/post/${p.postId}`}
                  className="block bg-white border border-gray-100 rounded-xl px-5 py-4 shadow-sm hover:shadow-md transition-shadow"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-medium text-gray-900">{p.title}</h4>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {p.author} · {p.category} · {t("likedAt")} {new Date(p.likedAt).toLocaleDateString(language === "en" ? "en-US" : "zh-CN")}
                      </p>
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
                      <p className="text-xs text-gray-400 mt-0.5">
                        {b.subtitle} · {new Date(b.bookmarkedAt).toLocaleDateString(language === "en" ? "en-US" : "zh-CN")}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleRemoveBookmark(b)}
                    title="取消收藏"
                    className="text-yellow-500 hover:text-gray-400 transition-colors text-xl leading-none ml-4"
                  >
                    ★
                  </button>
                </div>
              ))}
            </div>
          )
        ) : (
          activeTab === "myFollows" ? (
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
                      <p className="text-xs text-gray-400 mt-0.5">
                        {t("followedAt")} {new Date(f.followedAt).toLocaleDateString(language === "en" ? "en-US" : "zh-CN")}
                      </p>
                    </div>
                    <button
                      onClick={() => handleUnfollow(f.followingUsername)}
                      className="text-xs px-3 py-1 rounded-full border border-gray-300 text-gray-500 hover:border-red-300 hover:text-red-500 transition-colors"
                    >
                      {t("unfollow")}
                    </button>
                  </div>
                ))}
              </div>
            )
          ) : null
        )}
      </div>
      </>)} {/* end !isGuest */}
    </div>
  );
}
