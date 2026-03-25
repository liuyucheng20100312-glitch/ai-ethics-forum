"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";

interface Survey {
  _id: string;
  title: string;
  titleEn?: string;
  description?: string;
  descriptionEn?: string;
  author: string;
  status: "draft" | "published" | "closed";
  isVisible?: boolean;
  responseCount: number;
  createdAt: string;
}

// 检查是否是管理员
function isAdmin(userId: string | undefined): boolean {
  return userId === "offline_admin";
}

export default function SurveysPage() {
  const { isGuest, user, authFetch } = useAuth();
  const { t, language } = useLanguage();
  const router = useRouter();
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"all" | "published" | "closed">("all");
  const [adminView, setAdminView] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const isUserAdmin = isAdmin(user?.userId);

  useEffect(() => {
    fetchSurveys();
  }, [statusFilter, adminView]);  // eslint-disable-line react-hooks/exhaustive-deps

  const fetchSurveys = async () => {
    setLoading(true);
    try {
      let url = "/api/surveys";
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.append("status", statusFilter);
      if (adminView && isUserAdmin) params.append("adminView", "true");
      if (params.toString()) url += `?${params.toString()}`;

      const response = await fetch(url);
      const data = await response.json();
      setSurveys(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("获取问卷失败:", error);
    } finally {
      setLoading(false);
    }
  };

  const handlePublish = async (surveyId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!isUserAdmin) return;
    if (!confirm(t("surveyPublishConfirm"))) return;

    setActionLoading(surveyId);
    try {
      const response = await authFetch(`/api/surveys/${surveyId}`, {
        method: "PUT",
        body: JSON.stringify({ status: "published" }),
      });

      if (response.ok) {
        fetchSurveys();
      }
    } catch (error) {
      console.error("发布失败:", error);
    } finally {
      setActionLoading(null);
    }
  };

  const handleToggleVisibility = async (surveyId: string, currentVisibility: boolean, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!isUserAdmin) return;

    setActionLoading(surveyId);
    try {
      const response = await authFetch(`/api/surveys/${surveyId}`, {
        method: "PUT",
        body: JSON.stringify({ isVisible: !currentVisibility }),
      });

      if (response.ok) {
        fetchSurveys();
      }
    } catch (error) {
      console.error("操作失败:", error);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteSurvey = async (surveyId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!isUserAdmin) return;

    if (!confirm(t("surveyDeleteConfirm"))) return;

    setActionLoading(surveyId);
    try {
      const response = await authFetch(`/api/surveys/${surveyId}`, {
        method: "DELETE",
      });

      if (response.ok) {
        fetchSurveys();
      }
    } catch (error) {
      console.error("删除失败:", error);
    } finally {
      setActionLoading(null);
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "draft": return t("surveyDraft");
      case "published": return t("surveyPublished");
      case "closed": return t("surveyClosed");
      default: return status;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "draft": return "bg-yellow-100 text-yellow-700 border border-yellow-200";
      case "published": return "bg-green-100 text-green-700 border border-green-200";
      case "closed": return "bg-gray-100 text-gray-600 border border-gray-200";
      default: return "bg-gray-100 text-gray-600 border border-gray-200";
    }
  };

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-4">{t("surveys")}</h1>
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
              onClick={() => setStatusFilter("published")}
              className={`px-4 py-2 rounded-full font-semibold transition ${
                statusFilter === "published"
                  ? "bg-green-600 text-white"
                  : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600"
              }`}
            >
              {t("surveyPublished")}
            </button>
            <button
              onClick={() => setStatusFilter("closed")}
              className={`px-4 py-2 rounded-full font-semibold transition ${
                statusFilter === "closed"
                  ? "bg-gray-600 text-white"
                  : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600"
              }`}
            >
              {t("surveyClosed")}
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
              {t("adminSurveyManage")}
            </button>
          )}

          {/* New Survey Button (Admin only) */}
          {isUserAdmin && (
            <Link
              href="/surveys/new"
              className="ml-auto bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 font-bold whitespace-nowrap"
            >
              {t("newSurvey")}
            </Link>
          )}
        </div>
      </div>

      {/* Surveys List */}
      {loading ? (
        <p className="text-center text-gray-500">{t("loading")}</p>
      ) : surveys.length === 0 ? (
        <p className="text-center text-gray-500 py-8">{t("noSurveys")}</p>
      ) : (
        <div className="space-y-4">
          {surveys.map((survey) => {
            const displayTitle = language === "en" && survey.titleEn ? survey.titleEn : survey.title;
            const displayDesc = language === "en" && survey.descriptionEn ? survey.descriptionEn : survey.description;
            const isHidden = survey.isVisible === false;

            return (
              <Link key={survey._id} href={`/surveys/${survey._id}`}>
                <div className={`bg-white dark:bg-gray-800 border rounded-lg p-6 hover:shadow-lg hover:border-blue-400 transition cursor-pointer relative ${
                  isHidden ? "border-red-300 dark:border-red-700 opacity-75" : "border-gray-200 dark:border-gray-700"
                }`}>
                  {/* Hidden Badge */}
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
                    <span className={`flex-shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${getStatusColor(survey.status)}`}>
                      {getStatusLabel(survey.status)}
                    </span>
                  </div>

                  {/* Description */}
                  {displayDesc && (
                    <p className="text-gray-600 dark:text-gray-300 mb-4 line-clamp-2">{displayDesc}</p>
                  )}

                  {/* Meta Info */}
                  <div className="flex gap-4 text-sm text-gray-500 flex-wrap">
                    <span>👤 {survey.author}</span>
                    <span>📝 {survey.responseCount} {t("totalResponses")}</span>
                    <span>🕐 {new Date(survey.createdAt).toLocaleDateString(language === "en" ? "en-US" : "zh-CN")}</span>
                  </div>

                  {/* Admin Actions */}
                  {adminView && isUserAdmin && (
                    <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-600 flex flex-wrap gap-2">
                      {survey.status === "draft" && (
                        <button
                          onClick={(e) => handlePublish(survey._id, e)}
                          disabled={actionLoading === survey._id}
                          className="px-3 py-1.5 rounded text-sm font-medium bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400 transition disabled:opacity-50"
                        >
                          {t("publishSurvey")}
                        </button>
                      )}
                      <button
                        onClick={(e) => handleToggleVisibility(survey._id, survey.isVisible !== false, e)}
                        disabled={actionLoading === survey._id}
                        className={`px-3 py-1.5 rounded text-sm font-medium transition disabled:opacity-50 ${
                          isHidden
                            ? "bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400"
                            : "bg-yellow-100 text-yellow-700 hover:bg-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400"
                        }`}
                      >
                        {isHidden ? t("setVisible") : t("setHidden")}
                      </button>
                      <button
                        onClick={(e) => handleDeleteSurvey(survey._id, e)}
                        disabled={actionLoading === survey._id}
                        className="px-3 py-1.5 rounded text-sm font-medium bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400 transition disabled:opacity-50"
                      >
                        {t("deleteSurvey")}
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
