"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/app/context/AuthContext";
import { useLanguage } from "@/app/context/LanguageContext";

interface UserProfile {
  username: string;
  bio: string;
  avatar: string;
  backgroundImage?: string;
  verified?: boolean;
  realName?: string;
  classId?: string;
  isAdmin?: boolean;
}

interface Post {
  _id: string;
  title: string;
  titleEn?: string;
  category: string;
  replies: number;
  createdAt: string;
}

export default function UserProfilePage() {
  const params = useParams();
  const { user, authFetch, isGuest } = useAuth();
  const { t, language } = useLanguage();
  const username = decodeURIComponent(params.username as string);

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [isFollowing, setIsFollowing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const isOwnProfile = user?.username === username;

  useEffect(() => {
    fetchProfile();
    fetchPosts();
    fetchFollowStats();
    if (user && !isOwnProfile) {
      checkFollowing();
    }
  }, [username, user]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchProfile = async () => {
    try {
      const response = await fetch(`/api/users/${encodeURIComponent(username)}`);
      if (response.ok) {
        const data = await response.json();
        setProfile(data);
      }
    } catch {
      setProfile(null);
    } finally {
      setLoading(false);
    }
  };

  const fetchPosts = async () => {
    try {
      const response = await fetch(`/api/posts?author=${encodeURIComponent(username)}`);
      const data = await response.json();
      setPosts(Array.isArray(data) ? data : []);
    } catch {
      setPosts([]);
    }
  };

  const fetchFollowStats = async () => {
    try {
      const followingResponse = await fetch(`/api/users/${encodeURIComponent(username)}/follows?type=following`);
      if (followingResponse.ok) {
        const data = await followingResponse.json();
        setFollowingCount(Array.isArray(data) ? data.length : 0);
      }

      const followersResponse = await fetch(`/api/users/${encodeURIComponent(username)}/follows?type=followers`);
      if (followersResponse.ok) {
        const data = await followersResponse.json();
        setFollowersCount(Array.isArray(data) ? data.length : 0);
      }
    } catch {}
  };

  const checkFollowing = async () => {
    try {
      const response = await authFetch("/api/follows?type=following");
      const data = await response.json();
      const found = Array.isArray(data) && data.some((item: { followingUsername?: string }) => item.followingUsername === username);
      setIsFollowing(found);
    } catch {}
  };

  const handleFollow = async () => {
    if (isGuest || !user) return;

    setActionLoading(true);
    try {
      if (isFollowing) {
        await authFetch(`/api/follows/${encodeURIComponent(username)}`, { method: "DELETE" });
        setIsFollowing(false);
        setFollowersCount((previous) => Math.max(0, previous - 1));
      } else {
        await authFetch("/api/follows", {
          method: "POST",
          body: JSON.stringify({ username }),
        });
        setIsFollowing(true);
        setFollowersCount((previous) => previous + 1);
      }
    } catch {
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return <div className="py-20 text-center text-gray-500">{t("loading")}</div>;
  }

  if (!profile) {
    return (
      <div className="py-20 text-center">
        <p className="mb-4 text-gray-500">{language === "zh" ? "用户不存在" : "User not found"}</p>
        <Link href="/" className="text-blue-600 hover:underline">{t("home")}</Link>
      </div>
    );
  }

  const displayName = profile.verified && profile.realName ? profile.realName : profile.username;
  const dateLocale = language === "en" ? "en-US" : "zh-CN";

  return (
    <div className="max-w-3xl space-y-8">
      <div className={`relative overflow-hidden rounded-2xl border border-gray-100 shadow-sm dark:border-gray-700 ${profile.backgroundImage ? "bg-transparent" : "bg-white dark:bg-gray-800"}`}>
        {profile.backgroundImage && (
          <>
            <img
              src={profile.backgroundImage}
              alt={language === "zh" ? "个人主页背景图" : "Profile background"}
              className="absolute inset-0 h-full w-full object-cover object-center"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-white/45 via-white/30 to-white/22 backdrop-blur-[0.5px] dark:from-gray-900/40 dark:via-gray-900/30 dark:to-gray-900/24" />
          </>
        )}
        <div className="relative z-10">
        <div className={`relative h-52 overflow-hidden ${profile.backgroundImage ? "bg-transparent" : "bg-[linear-gradient(90deg,#ff7a2f_0%,#ffc793_24%,#fffaf6_52%,#ffe4ed_76%,#f5a3c7_100%)]"}`}>
          {!profile.backgroundImage && (
            <>
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_52%_42%,rgba(255,255,255,0.96)_0%,rgba(255,255,255,0.78)_20%,rgba(255,255,255,0)_54%)]" />
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_78%,rgba(255,255,255,0.18)_0%,rgba(255,255,255,0)_34%)]" />
            </>
          )}
          <div className={`absolute inset-0 ${profile.backgroundImage ? "bg-transparent" : "bg-gradient-to-t from-white/14 via-white/4 to-transparent"}`} />
        </div>

        <div className="px-6 pb-6">
          <div className="-mt-10 flex flex-col gap-5 md:flex-row md:items-start">
            <div className="shrink-0">
              {profile.avatar ? (
                <img
                  src={profile.avatar}
                  alt={displayName}
                  className="h-24 w-24 rounded-full border-4 border-white bg-white object-cover shadow-lg dark:border-gray-800"
                />
              ) : (
                <div className="flex h-24 w-24 items-center justify-center rounded-full border-4 border-white bg-gradient-to-br from-blue-400 to-indigo-600 text-3xl font-bold text-white shadow-lg dark:border-gray-800">
                  {displayName[0]}
                </div>
              )}
            </div>

            <div className="flex-1 pt-2">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <h2 className="text-3xl font-semibold tracking-tight text-slate-900/95 dark:text-gray-100">{displayName}</h2>
                {profile.isAdmin ? (
                  <span className="inline-flex items-center rounded-full border border-red-200/80 bg-red-50/85 px-2.5 py-0.5 text-[13px] font-medium text-red-700">
                    {language === "zh" ? "管理员" : "Admin"}
                  </span>
                ) : profile.verified ? (
                  <span className="inline-flex items-center rounded-full border border-blue-200/80 bg-blue-50/85 px-2.5 py-0.5 text-[13px] font-medium text-blue-700">
                    {language === "zh" ? "已认证" : "Verified"}
                  </span>
                ) : null}
              </div>

              {profile.verified && !profile.isAdmin && (
                <p className="mb-1 text-xs text-gray-400 dark:text-gray-500">
                  @{profile.username}
                  {profile.classId && (
                    <span className="ml-2 rounded bg-indigo-50 px-1.5 py-0.5 text-xs text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400">
                      {profile.classId}
                    </span>
                  )}
                </p>
              )}

              <p className="mb-3 text-base leading-7 text-slate-600/90 dark:text-gray-300">{profile.bio || (language === "zh" ? "暂无简介" : "No bio yet")}</p>
              <div className="mb-3 flex gap-6 text-sm text-slate-600/90 dark:text-gray-300">
                <span><strong className="font-semibold text-slate-900 tabular-nums dark:text-gray-100">{posts.length}</strong> {t("myPosts")}</span>
                <span><strong className="font-semibold text-slate-900 tabular-nums dark:text-gray-100">{followingCount}</strong> {t("myFollows")}</span>
                <span><strong className="font-semibold text-slate-900 tabular-nums dark:text-gray-100">{followersCount}</strong> {language === "zh" ? "粉丝" : "Followers"}</span>
              </div>

              {!isOwnProfile && !isGuest && (
                <button
                  type="button"
                  onClick={handleFollow}
                  disabled={actionLoading}
                  className={`rounded-lg px-4 py-1.5 text-sm font-medium transition ${
                    isFollowing
                      ? "border border-gray-300 text-gray-700 hover:border-red-300 hover:text-red-500 dark:border-gray-600 dark:text-gray-200"
                      : "bg-blue-600 text-white hover:bg-blue-700"
                  } disabled:opacity-50`}
                >
                  {actionLoading ? t("loading") : isFollowing ? t("unfollow") : t("follow")}
                </button>
              )}

              {isGuest && (
                <p className="text-xs text-gray-400">{t("guestCannotFollow")}</p>
              )}
            </div>
          </div>
        </div>
        </div>
      </div>

      <div>
        <h3 className="mb-4 text-lg font-bold text-gray-800 dark:text-gray-100">
          📝 {language === "zh" ? "发布的帖子" : "Posts"} ({posts.length})
        </h3>
        {posts.length === 0 ? (
          <div className="py-12 text-center text-gray-400">
            {language === "zh" ? "暂无帖子" : "No posts yet"}
          </div>
        ) : (
          <div className="space-y-3">
            {posts.map((post) => (
              <Link key={post._id} href={`/post/${post._id}`} className="block rounded-xl border border-gray-100 bg-white px-5 py-4 shadow-sm transition-shadow hover:shadow-md dark:border-gray-700 dark:bg-gray-800">
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="font-medium text-gray-900 dark:text-gray-100">
                      {language === "en" && post.titleEn ? post.titleEn : post.title}
                    </h4>
                    <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
                      {post.category} 路 {post.replies} {t("repliesCount")} 路 {new Date(post.createdAt).toLocaleDateString(dateLocale)}
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

