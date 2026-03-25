"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";

interface Vote {
  _id: string;
  title: string;
  titleEn?: string;
  author: string;
  status: "active" | "closed";
  isVisible?: boolean;
  proCount: number;
  conCount: number;
  totalVoters: number;
  createdAt: string;
}

// 检查是否是管理员
function isAdmin(userId: string | undefined): boolean {
  return userId === "offline_admin";
}

export default function VotesPage() {
  const { isGuest, user, authFetch } = useAuth();
  const { t, language } = useLanguage();
  const router = useRouter();
  const [votes, setVotes] = useState<Vote[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "closed">("all");
  const [adminView, setAdminView] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const isUserAdmin = isAdmin(user?.userId);

  useEffect(() => {
    fetchVotes();
  }, [statusFilter, adminView]);  // eslint-disable-line react-hooks/exhaustive-deps

  const fetchVotes = async () => {
    setLoading(true);
    try {
      let url = "/api/votes";
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.append("status", statusFilter);
      if (adminView && isUserAdmin) params.append("adminView", "true");
      if (params.toString()) url += `?${params.toString()}`;

      const response = await fetch(url);
      const data = await response.json();
      setVotes(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("获取投票失败:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleVisibility = async (voteId: string, currentVisibility: boolean, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!isUserAdmin) return;

    setActionLoading(voteId);
    try {
      const response = await authFetch(`/api/votes/${voteId}`, {
        method: "PUT",
        body: JSON.stringify({ isVisible: !currentVisibility }),
      });

      if (response.ok) {
        fetchVotes();
      }
    } catch (error) {
      console.error("操作失败:", error);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteVote = async (voteId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!isUserAdmin) return;

    if (!confirm(t("adminDeleteConfirm"))) return;

    setActionLoading(voteId);
    try {
      const response = await authFetch(`/api/votes/${voteId}`, {
        method: "DELETE",
      });

      if (response.ok) {
        fetchVotes();
      }
    } catch (error) {
      console.error("删除失败:", error);
    } finally {
      setActionLoading(null);
    }
  };

  const filteredVotes = votes;

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-4">{t("votes")}</h1>
        <div className="flex gap-4 items-center flex-wrap">
          {/* Status Filter */}
          <div className="flex gap-2">
            <button
              onClick={() => setStatusFilter("all")}
              className={`px-4 py-2 rounded-full font-semibold transition ${
                statusFilter === "all"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600"
              }`}
            >
              {t("all")}
            </button>
            <button
              onClick={() => setStatusFilter("active")}
              className={`px-4 py-2 rounded-full font-semibold transition ${
                statusFilter === "active"
                  ? "bg-green-600 text-white"
                  : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600"
              }`}
            >
              {t("voteActive")}
            </button>
            <button
              onClick={() => setStatusFilter("closed")}
              className={`px-4 py-2 rounded-full font-semibold transition ${
                statusFilter === "closed"
                  ? "bg-gray-600 text-white"
                  : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600"
              }`}
            >
              {t("voteClosedLabel")}
            </button>
          </div>

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
              {t("adminVoteManage")}
            </button>
          )}

          {/* New Vote Button */}
          {!isGuest && (
            <Link
              href="/votes/new"
              className="ml-auto bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 font-bold whitespace-nowrap"
            >
              {t("newVote")}
            </Link>
          )}
        </div>
      </div>

      {/* Votes List */}
      {loading ? (
        <p className="text-center text-gray-500">{t("loading")}</p>
      ) : filteredVotes.length === 0 ? (
        <p className="text-center text-gray-500 py-8">{t("noVotes")}</p>
      ) : (
        <div className="space-y-4">
          {filteredVotes.map((vote) => {
            const displayTitle = language === "en" && vote.titleEn ? vote.titleEn : vote.title;
            const proPercent = vote.totalVoters > 0 ? Math.round((vote.proCount / vote.totalVoters) * 100) : 0;
            const conPercent = vote.totalVoters > 0 ? Math.round((vote.conCount / vote.totalVoters) * 100) : 0;
            const isHidden = vote.isVisible === false;

            return (
              <Link key={vote._id} href={`/votes/${vote._id}`}>
                <div className={`bg-white dark:bg-gray-800 border rounded-lg p-6 hover:shadow-lg hover:border-blue-400 transition cursor-pointer relative ${
                  isHidden ? "border-red-300 dark:border-red-700 opacity-75" :
                  vote.status === "closed" ? "border-gray-300 dark:border-gray-600 opacity-75" : "border-gray-200 dark:border-gray-700"
                }`}>
                  {/* Admin Badge for hidden votes */}
                  {adminView && isHidden && (
                    <div className="absolute top-2 right-2">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200 font-medium">
                        {t("isHidden")}
                      </span>
                    </div>
                  )}

                  {/* Status Badge */}
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <h3 className="text-xl font-bold text-blue-600">{displayTitle}</h3>
                    <span className={`flex-shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${
                      vote.status === "active"
                        ? "bg-green-100 text-green-700 border border-green-200"
                        : "bg-gray-100 text-gray-600 border border-gray-200"
                    }`}>
                      {vote.status === "active" ? t("voteActive") : t("voteClosedLabel")}
                    </span>
                  </div>

                  {/* Vote Progress Bar */}
                  <div className="mb-4">
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-green-600 font-medium">{t("proSide")}: {vote.proCount} ({proPercent}%)</span>
                      <span className="text-red-600 font-medium">{t("conSide")}: {vote.conCount} ({conPercent}%)</span>
                    </div>
                    <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden flex">
                      <div
                        className="bg-green-500 h-full transition-all duration-300"
                        style={{ width: `${proPercent}%` }}
                      />
                      <div
                        className="bg-red-500 h-full transition-all duration-300"
                        style={{ width: `${conPercent}%` }}
                      />
                    </div>
                  </div>

                  {/* Meta Info */}
                  <div className="flex gap-4 text-sm text-gray-500 flex-wrap">
                    <span>👤 {vote.author}</span>
                    <span>👥 {vote.totalVoters} {t("totalVoters")}</span>
                    <span>🕐 {new Date(vote.createdAt).toLocaleDateString(language === "en" ? "en-US" : "zh-CN")}</span>
                  </div>

                  {/* Admin Actions */}
                  {adminView && isUserAdmin && (
                    <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-600 flex gap-2">
                      <button
                        onClick={(e) => handleToggleVisibility(vote._id, vote.isVisible !== false, e)}
                        disabled={actionLoading === vote._id}
                        className={`px-3 py-1.5 rounded text-sm font-medium transition ${
                          isHidden
                            ? "bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400"
                            : "bg-yellow-100 text-yellow-700 hover:bg-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400"
                        } disabled:opacity-50`}
                      >
                        {actionLoading === vote._id ? t("loading") : isHidden ? t("setVisible") : t("setHidden")}
                      </button>
                      <button
                        onClick={(e) => handleDeleteVote(vote._id, e)}
                        disabled={actionLoading === vote._id}
                        className="px-3 py-1.5 rounded text-sm font-medium bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400 transition disabled:opacity-50"
                      >
                        {t("deleteVote")}
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
