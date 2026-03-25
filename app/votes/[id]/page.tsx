"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "../../context/AuthContext";
import { useLanguage } from "../../context/LanguageContext";

interface Vote {
  _id: string;
  title: string;
  titleEn?: string;
  proDescription: string;
  proDescriptionEn?: string;
  conDescription: string;
  conDescriptionEn?: string;
  author: string;
  authorId: string;
  status: "active" | "closed";
  isVisible?: boolean;
  proCount: number;
  conCount: number;
  totalVoters: number;
  createdAt: string;
  comments?: Comment[];
}

interface Comment {
  _id: string;
  voteId: string;
  userId: string;
  username: string;
  side: "pro" | "con";
  content: string;
  createdAt: string;
}

// 检查是否是管理员
function isAdmin(userId: string | undefined): boolean {
  return userId === "offline_admin";
}

export default function VoteDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user, authFetch, isGuest } = useAuth();
  const { t, language } = useLanguage();
  const voteId = params.id as string;

  const [vote, setVote] = useState<Vote | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<"notfound" | "error" | null>(null);
  const [userVote, setUserVote] = useState<{ voted: boolean; side?: string; reason?: string }>({ voted: false });
  const [selectedSide, setSelectedSide] = useState<"pro" | "con" | null>(null);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showAllReasons, setShowAllReasons] = useState(true);
  const [adminActionLoading, setAdminActionLoading] = useState(false);

  const isUserAdmin = isAdmin(user?.userId);

  useEffect(() => {
    if (voteId) {
      fetchVote();
      if (user) checkUserVote();
    }
  }, [voteId, user]);  // eslint-disable-line react-hooks/exhaustive-deps

  const fetchVote = async () => {
    setFetchError(null);
    try {
      const response = await fetch(`/api/votes/${voteId}`);
      if (response.status === 404) {
        setFetchError("notfound");
        return;
      }
      if (!response.ok) {
        setFetchError("error");
        return;
      }
      const data = await response.json();
      setVote(data);
    } catch {
      setFetchError("error");
    } finally {
      setLoading(false);
    }
  };

  const checkUserVote = async () => {
    try {
      const response = await authFetch(`/api/votes/${voteId}/cast`);
      const data = await response.json();
      setUserVote(data);
      if (data.voted) {
        setSelectedSide(data.side as "pro" | "con");
        setReason(data.reason || "");
      }
    } catch {
      setUserVote({ voted: false });
    }
  };

  const handleVote = async () => {
    if (!selectedSide || !vote) return;

    setSubmitting(true);
    try {
      const response = await authFetch(`/api/votes/${voteId}/cast`, {
        method: "POST",
        body: JSON.stringify({
          side: selectedSide,
          reason: reason.trim(),
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || t("voteFailed"));
      }

      setUserVote({ voted: true, side: selectedSide, reason: reason.trim() });
      fetchVote();
      alert(t("voteSuccess"));
    } catch (error: any) {
      alert(error.message || t("voteFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleCloseVote = async () => {
    if (!vote || !user) return;

    setAdminActionLoading(true);
    try {
      const response = await authFetch(`/api/votes/${voteId}`, {
        method: "PUT",
        body: JSON.stringify({ status: vote.status === "active" ? "closed" : "active" }),
      });

      if (response.ok) {
        fetchVote();
      }
    } catch {} finally {
      setAdminActionLoading(false);
    }
  };

  const handleToggleVisibility = async () => {
    if (!vote || !isUserAdmin) return;

    setAdminActionLoading(true);
    try {
      const response = await authFetch(`/api/votes/${voteId}`, {
        method: "PUT",
        body: JSON.stringify({ isVisible: vote.isVisible !== false ? false : true }),
      });

      if (response.ok) {
        fetchVote();
      }
    } catch {} finally {
      setAdminActionLoading(false);
    }
  };

  const handleDeleteVote = async () => {
    if (!vote || !isUserAdmin) return;

    if (!confirm(t("adminDeleteConfirm"))) return;

    setAdminActionLoading(true);
    try {
      const response = await authFetch(`/api/votes/${voteId}`, {
        method: "DELETE",
      });

      if (response.ok) {
        router.push("/votes");
      }
    } catch {} finally {
      setAdminActionLoading(false);
    }
  };

  if (loading) return <p className="text-center text-gray-500">{t("loading")}</p>;
  if (fetchError === "notfound") return (
    <div className="text-center py-20">
      <p className="text-gray-500 mb-4">{language === "zh" ? "投票不存在" : "Vote not found"}</p>
      <Link href="/votes" className="text-blue-600 hover:underline">{t("backToVotes")}</Link>
    </div>
  );
  if (fetchError === "error" || !vote) return (
    <div className="text-center py-20">
      <p className="text-gray-500 mb-4">{language === "zh" ? "加载失败，请稍后重试" : "Failed to load. Please try again."}</p>
      <div className="flex gap-4 justify-center">
        <button onClick={() => { setLoading(true); fetchVote(); }} className="text-blue-600 hover:underline">
          {language === "zh" ? "重试" : "Retry"}
        </button>
        <Link href="/votes" className="text-gray-500 hover:underline">{t("backToVotes")}</Link>
      </div>
    </div>
  );

  const displayTitle = language === "en" && vote.titleEn ? vote.titleEn : vote.title;
  const displayProDesc = language === "en" && vote.proDescriptionEn ? vote.proDescriptionEn : vote.proDescription;
  const displayConDesc = language === "en" && vote.conDescriptionEn ? vote.conDescriptionEn : vote.conDescription;
  const proPercent = vote.totalVoters > 0 ? Math.round((vote.proCount / vote.totalVoters) * 100) : 0;
  const conPercent = vote.totalVoters > 0 ? Math.round((vote.conCount / vote.totalVoters) * 100) : 0;
  const dateLocale = language === "en" ? "en-US" : "zh-CN";
  const isAuthor = user?.userId === vote.authorId;
  const isHidden = vote.isVisible === false;

  // Separate comments by side
  const proComments = (vote.comments || []).filter(c => c.side === "pro");
  const conComments = (vote.comments || []).filter(c => c.side === "con");

  return (
    <div>
      {/* Back Button */}
      <Link href="/votes" className="text-blue-600 hover:underline mb-6 inline-block">
        {t("backToVotes")}
      </Link>

      {/* Vote Content */}
      <div className={`bg-white dark:bg-gray-800 border rounded-lg p-8 mb-8 relative ${
        isHidden ? "border-red-300 dark:border-red-700" : "border-gray-200 dark:border-gray-700"
      }`}>
        {/* Hidden Badge */}
        {isHidden && (
          <div className="absolute top-4 right-4">
            <span className="text-sm px-3 py-1 rounded-full bg-red-100 text-red-700 border border-red-200 font-medium">
              {t("isHidden")}
            </span>
          </div>
        )}

        {/* Header */}
        <div className="mb-6">
          <div className="flex items-start justify-between gap-4 mb-2">
            <h1 className="text-3xl font-bold">{displayTitle}</h1>
            <span className={`flex-shrink-0 text-sm px-3 py-1 rounded-full font-medium ${
              vote.status === "active"
                ? "bg-green-100 text-green-700 border border-green-200"
                : "bg-gray-100 text-gray-600 border border-gray-200"
            }`}>
              {vote.status === "active" ? t("voteActive") : t("voteClosedLabel")}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500">
            <span>👤 {vote.author}</span>
            <span>👥 {vote.totalVoters} {t("totalVoters")}</span>
            <span>🕐 {new Date(vote.createdAt).toLocaleString(dateLocale)}</span>
          </div>
        </div>

        <hr className="my-6" />

        {/* Pro & Con Arguments */}
        <div className="grid md:grid-cols-2 gap-6 mb-8">
          {/* Pro Side */}
          <div className="p-6 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
            <h3 className="text-lg font-bold text-green-700 dark:text-green-400 mb-3">
              🟢 {t("proSide")}
            </h3>
            <p className="text-gray-700 dark:text-gray-200 whitespace-pre-wrap">{displayProDesc}</p>
          </div>

          {/* Con Side */}
          <div className="p-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <h3 className="text-lg font-bold text-red-700 dark:text-red-400 mb-3">
              🔴 {t("conSide")}
            </h3>
            <p className="text-gray-700 dark:text-gray-200 whitespace-pre-wrap">{displayConDesc}</p>
          </div>
        </div>

        {/* Vote Results */}
        <div className="mb-8">
          <h3 className="text-lg font-bold mb-4">{t("voteResults")}</h3>
          <div className="flex justify-between text-sm mb-2">
            <span className="text-green-600 font-medium">{t("proSide")}: {vote.proCount} ({proPercent}%)</span>
            <span className="text-red-600 font-medium">{t("conSide")}: {vote.conCount} ({conPercent}%)</span>
          </div>
          <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden flex">
            <div
              className="bg-green-500 h-full transition-all duration-500 flex items-center justify-center text-white text-xs font-medium"
              style={{ width: `${proPercent}%` }}
            >
              {proPercent > 10 && `${proPercent}%`}
            </div>
            <div
              className="bg-red-500 h-full transition-all duration-500 flex items-center justify-center text-white text-xs font-medium"
              style={{ width: `${conPercent}%` }}
            >
              {conPercent > 10 && `${conPercent}%`}
            </div>
          </div>
        </div>

        {/* Voting Section */}
        {isGuest ? (
          <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-6 text-center">
            <p className="text-gray-500 mb-2">{t("guestCannotVote")}</p>
            <div className="flex gap-4 justify-center">
              <Link href="/login" className="text-blue-600 hover:underline">{t("loginLink")}</Link>
              <span className="text-gray-300">|</span>
              <Link href="/register" className="text-blue-600 hover:underline">{t("registerLink")}</Link>
            </div>
          </div>
        ) : userVote.voted ? (
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-6">
            <p className="text-blue-700 dark:text-blue-300 font-medium mb-2">
              ✅ {t("alreadyVoted")}: {userVote.side === "pro" ? t("proSide") : t("conSide")}
            </p>
            {userVote.reason && (
              <p className="text-gray-600 dark:text-gray-300 text-sm">
                <span className="font-medium">{t("yourReason")}:</span> {userVote.reason}
              </p>
            )}
          </div>
        ) : vote.status === "closed" ? (
          <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-6 text-center">
            <p className="text-gray-500">{t("voteClosed")}</p>
          </div>
        ) : (
          <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-6">
            <h3 className="text-lg font-bold mb-4">{t("yourVote")}</h3>

            {/* Side Selection */}
            <div className="flex gap-4 mb-4">
              <button
                onClick={() => setSelectedSide("pro")}
                className={`flex-1 py-4 rounded-lg font-bold border-2 transition-all ${
                  selectedSide === "pro"
                    ? "bg-green-100 border-green-500 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                    : "bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-500 hover:border-green-300"
                }`}
              >
                🟢 {t("voteForPro")}
              </button>
              <button
                onClick={() => setSelectedSide("con")}
                className={`flex-1 py-4 rounded-lg font-bold border-2 transition-all ${
                  selectedSide === "con"
                    ? "bg-red-100 border-red-500 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                    : "bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-500 hover:border-red-300"
                }`}
              >
                🔴 {t("voteForCon")}
              </button>
            </div>

            {/* Reason Input */}
            <div className="mb-4">
              <label className="block text-sm font-semibold mb-2">{t("yourReason")}</label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={t("reasonPlaceholder")}
                rows={3}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Submit Button */}
            <button
              onClick={handleVote}
              disabled={!selectedSide || submitting}
              className="w-full bg-blue-600 text-white py-3 rounded-lg font-bold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? t("loading") : t("submitVote")}
            </button>
          </div>
        )}

        {/* Author Actions */}
        {isAuthor && (
          <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-600">
            <button
              onClick={handleCloseVote}
              disabled={adminActionLoading}
              className={`px-4 py-2 rounded-lg font-medium ${
                vote.status === "active"
                  ? "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600"
                  : "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 hover:bg-green-200"
              } disabled:opacity-50`}
            >
              {adminActionLoading ? t("loading") : vote.status === "active" ? t("closeVote") : t("reopenVote")}
            </button>
          </div>
        )}

        {/* Admin Actions */}
        {isUserAdmin && (
          <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-600">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-sm font-semibold text-purple-600 dark:text-purple-400">🛡️ {t("adminPanel")}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={handleCloseVote}
                disabled={adminActionLoading}
                className={`px-4 py-2 rounded-lg font-medium transition disabled:opacity-50 ${
                  vote.status === "active"
                    ? "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600"
                    : "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 hover:bg-green-200"
                }`}
              >
                {vote.status === "active" ? t("closeVote") : t("reopenVote")}
              </button>
              <button
                onClick={handleToggleVisibility}
                disabled={adminActionLoading}
                className={`px-4 py-2 rounded-lg font-medium transition disabled:opacity-50 ${
                  isHidden
                    ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 hover:bg-green-200"
                    : "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 hover:bg-yellow-200"
                }`}
              >
                {isHidden ? t("setVisible") : t("setHidden")}
              </button>
              <button
                onClick={handleDeleteVote}
                disabled={adminActionLoading}
                className="px-4 py-2 rounded-lg font-medium bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 hover:bg-red-200 transition disabled:opacity-50"
              >
                {t("deleteVote")}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Vote Comments / Reasons Section */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold">💬 {t("voteComments")} ({(vote.comments || []).length})</h2>
          <button
            onClick={() => setShowAllReasons(!showAllReasons)}
            className="text-blue-600 hover:underline text-sm"
          >
            {showAllReasons ? t("hideReasons") : t("viewAllReasons")}
          </button>
        </div>

        {showAllReasons && (
          <>
            {(!vote.comments || vote.comments.length === 0) ? (
              <p className="text-gray-500 text-center py-8">{t("noComments")}</p>
            ) : (
              <div className="space-y-8">
                {/* Pro Comments */}
                {proComments.length > 0 && (
                  <div>
                    <h3 className="text-lg font-bold text-green-600 mb-4">🟢 {t("proSide")} ({proComments.length})</h3>
                    <div className="space-y-4">
                      {proComments.map((comment) => (
                        <div key={comment._id} className="border-l-4 border-green-400 pl-4 py-2">
                          <div className="flex justify-between items-start mb-2">
                            <span className="font-bold text-green-600">{comment.username}</span>
                            <span className="text-xs text-gray-500">
                              {new Date(comment.createdAt).toLocaleString(dateLocale)}
                            </span>
                          </div>
                          <p className="text-gray-700 dark:text-gray-200">{comment.content}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Con Comments */}
                {conComments.length > 0 && (
                  <div>
                    <h3 className="text-lg font-bold text-red-600 mb-4">🔴 {t("conSide")} ({conComments.length})</h3>
                    <div className="space-y-4">
                      {conComments.map((comment) => (
                        <div key={comment._id} className="border-l-4 border-red-400 pl-4 py-2">
                          <div className="flex justify-between items-start mb-2">
                            <span className="font-bold text-red-600">{comment.username}</span>
                            <span className="text-xs text-gray-500">
                              {new Date(comment.createdAt).toLocaleString(dateLocale)}
                            </span>
                          </div>
                          <p className="text-gray-700 dark:text-gray-200">{comment.content}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
