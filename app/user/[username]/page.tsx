"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/app/context/AuthContext";
import { useLanguage } from "@/app/context/LanguageContext";

interface UserProfile {
  username: string;
  bio: string;
  avatar: string;
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

// 检查是否是管理员
function isAdmin(userId: string | undefined): boolean {
  return userId === "offline_admin";
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
  const isUserAdmin = isAdmin(user?.userId);

  useEffect(() => {
    fetchProfile();
    fetchPosts();
    fetchFollowStats();
    if (user && !isOwnProfile) {
      checkFollowing();
    }
  }, [username, user]);  // eslint-disable-line react-hooks/exhaustive-deps

  const fetchProfile = async () => {
    try {
      const res = await fetch(`/api/users/${encodeURIComponent(username)}`);
      if (res.ok) {
        const data = await res.json();
        setProfile(data);
      }
    } catch {} finally {
      setLoading(false);
    }
  };

  const fetchPosts = async () => {
    try {
      const res = await fetch(`/api/posts?author=${encodeURIComponent(username)}`);
      const data = await res.json();
      setPosts(Array.isArray(data) ? data : []);
    } catch {}
  };

  const fetchFollowStats = async () => {
    try {
      // 获取该用户的关注数
      const followingRes = await fetch(`/api/users/${encodeURIComponent(username)}/follows?type=following`);
      if (followingRes.ok) {
        const data = await followingRes.json();
        setFollowingCount(Array.isArray(data) ? data.length : 0);
      }
      // 获取该用户的粉丝数
      const followersRes = await fetch(`/api/users/${encodeURIComponent(username)}/follows?type=followers`);
      if (followersRes.ok) {
        const data = await followersRes.json();
        setFollowersCount(Array.isArray(data) ? data.length : 0);
      }
    } catch {}
  };

  const checkFollowing = async () => {
    try {
      const res = await authFetch("/api/follows?type=following");
      const data = await res.json();
      const found = Array.isArray(data) && data.some((f: any) => f.followingUsername === username);
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
        setFollowersCount((prev) => Math.max(0, prev - 1));
      } else {
        await authFetch("/api/follows", {
          method: "POST",
          body: JSON.stringify({ username }),
        });
        setIsFollowing(true);
        setFollowersCount((prev) => prev + 1);
      }
    } catch {} finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return <div className="text-center py-20 text-gray-500">{t("loading")}</div>;
  }

  if (!profile) {
    return (
      <div className="text-center py-20">
        <p className="text-gray-500 mb-4">{language === "zh" ? "用户不存在" : "User not found"}</p>
        <Link href="/" className="text-blue-600 hover:underline">{t("home")}</Link>
      </div>
    );
  }

  const displayName = profile.verified && profile.realName ? profile.realName : profile.username;
  const dateLocale = language === "en" ? "en-US" : "zh-CN";

  return (
    <div className="max-w-3xl space-y-8">
      {/* Profile Card */}
      <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl p-6 shadow-sm">
        <div className="flex items-start gap-5">
          <div className="flex-shrink-0">
            {profile.avatar ? (
              <img src={profile.avatar} alt={displayName} className="w-20 h-20 rounded-full object-cover border-2 border-gray-200 dark:border-gray-600" />
            ) : (
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-400 to-indigo-600 flex items-center justify-center text-white text-3xl font-bold">
                {displayName[0]}
              </div>
            )}
          </div>

          <div className="flex-1">
            <div className="flex items-center gap-2 mb-0.5 flex-wrap">
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">{displayName}</h2>
              {profile.isAdmin ? (
                <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-red-50 text-red-700 border border-red-200 rounded-full font-medium">
                  🛡️ {language === "zh" ? "管理员" : "Admin"}
                </span>
              ) : profile.verified ? (
                <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-full font-medium">
                  🎓 {language === "zh" ? "已认证" : "Verified"}
                </span>
              ) : null}
            </div>
            {profile.verified && !profile.isAdmin && (
              <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">
                @{profile.username}
                {profile.classId && (
                  <span className="ml-2 px-1.5 py-0.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded text-xs">{profile.classId}</span>
                )}
              </p>
            )}
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">{profile.bio || (language === "zh" ? "暂无简介" : "No bio yet")}</p>
            <div className="flex gap-4 text-sm text-gray-500 dark:text-gray-400 mb-3">
              <span><strong className="text-gray-900 dark:text-gray-100">{posts.length}</strong> {t("myPosts")}</span>
              <span><strong className="text-gray-900 dark:text-gray-100">{followingCount}</strong> {t("myFollows")}</span>
              <span><strong className="text-gray-900 dark:text-gray-100">{followersCount}</strong> {language === "zh" ? "粉丝" : "Followers"}</span>
            </div>

            {/* Action Buttons */}
            {!isOwnProfile && !isGuest && (
              <button
                onClick={handleFollow}
                disabled={actionLoading}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition ${
                  isFollowing
                    ? "border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:border-red-300 hover:text-red-500"
                    : "bg-blue-600 text-white hover:bg-blue-700"
                } disabled:opacity-50`}
              >
                {actionLoading
                  ? t("loading")
                  : isFollowing
                    ? t("unfollow")
                    : t("follow")}
              </button>
            )}
            {isGuest && (
              <p className="text-xs text-gray-400">
                {t("guestCannotFollow")}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* User's Posts */}
      <div>
        <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-4">
          📝 {language === "zh" ? "发布的帖子" : "Posts"} ({posts.length})
        </h3>
        {posts.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            {language === "zh" ? "暂无帖子" : "No posts yet"}
          </div>
        ) : (
          <div className="space-y-3">
            {posts.map((post) => (
              <Link key={post._id} href={`/post/${post._id}`} className="block bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl px-5 py-4 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="font-medium text-gray-900 dark:text-gray-100">
                      {language === "en" && post.titleEn ? post.titleEn : post.title}
                    </h4>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                      {post.category} · {post.replies} {t("repliesCount")} · {new Date(post.createdAt).toLocaleDateString(dateLocale)}
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
