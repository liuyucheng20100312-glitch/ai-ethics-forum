"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "../../../context/AuthContext";
import { useLanguage } from "../../../context/LanguageContext";

interface QuestionStat {
  questionIndex: number;
  questionText: string;
  questionType: string;
  optionCounts: Record<string, number>;
  textAnswers: string[];
  total: number;
}

interface Response {
  username: string;
  submittedAt: string;
  answers: { questionIndex: number; answer: string | string[] }[];
  additionalComment: string;
  aiAnalysis?: {
    summary: string;
    insights: string[];
    suggestions: string[];
  };
}

interface AnalysisData {
  surveyId: string;
  surveyTitle: string;
  totalResponses: number;
  questionStats: QuestionStat[];
  aiSummary: string;
  responses: Response[];
}

// 检查是否是管理员
function isAdmin(userId: string | undefined): boolean {
  return userId === "offline_admin";
}

export default function SurveyResultsPage() {
  const params = useParams();
  const { user } = useAuth();
  const { t, language } = useLanguage();
  const surveyId = params.id as string;

  const [data, setData] = useState<AnalysisData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAllResponses, setShowAllResponses] = useState(false);

  useEffect(() => {
    if (!isAdmin(user?.userId)) return;
    fetchAnalysis();
  }, [surveyId, user]);  // eslint-disable-line react-hooks/exhaustive-deps

  const fetchAnalysis = async () => {
    try {
      const response = await fetch(`/api/surveys/${surveyId}/analyze`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("ai_ethics_token")}`,
        },
      });

      if (!response.ok) {
        throw new Error("获取分析数据失败");
      }

      const analysisData = await response.json();
      setData(analysisData);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!isAdmin(user?.userId)) {
    return (
      <div className="text-center py-20">
        <p className="text-gray-500">{language === "zh" ? "无权限访问此页面" : "Access denied"}</p>
        <Link href="/surveys" className="text-blue-600 hover:underline mt-4 inline-block">{t("backToSurveys")}</Link>
      </div>
    );
  }

  if (loading) return <p className="text-center text-gray-500">{t("loading")}</p>;
  if (error || !data) return (
    <div className="text-center py-20">
      <p className="text-gray-500 mb-4">{error || "加载失败"}</p>
      <Link href="/surveys" className="text-blue-600 hover:underline">{t("backToSurveys")}</Link>
    </div>
  );

  const dateLocale = language === "en" ? "en-US" : "zh-CN";

  return (
    <div>
      {/* Back Button */}
      <Link href={`/surveys/${surveyId}`} className="text-blue-600 hover:underline mb-6 inline-block">
        {t("backToSurveys")}
      </Link>

      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-8 mb-8">
        <h1 className="text-3xl font-bold mb-2">{data.surveyTitle}</h1>
        <p className="text-gray-500">{t("totalResponses")}: {data.totalResponses}</p>
      </div>

      {/* AI Summary */}
      {data.aiSummary && (
        <div className="bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-8 mb-8">
          <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
            🤖 AI {t("surveyAnalysis")}
          </h2>
          <div className="text-gray-700 dark:text-gray-200 whitespace-pre-wrap">{data.aiSummary}</div>
        </div>
      )}

      {/* Question Statistics */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-8 mb-8">
        <h2 className="text-2xl font-bold mb-6">{t("surveyStatistics")}</h2>

        <div className="space-y-8">
          {data.questionStats.map((stat) => (
            <div key={stat.questionIndex} className="border-b border-gray-200 dark:border-gray-600 last:border-0 pb-6 last:pb-0">
              <p className="font-medium mb-4">
                {stat.questionIndex + 1}. {stat.questionText}
              </p>

              {stat.questionType !== "text" ? (
                <div className="space-y-3">
                  {Object.entries(stat.optionCounts).map(([option, count]) => {
                    const percent = stat.total > 0 ? Math.round((count / stat.total) * 100) : 0;

                    return (
                      <div key={option}>
                        <div className="flex justify-between text-sm mb-1">
                          <span>{option}</span>
                          <span className="text-gray-500">{count} ({percent}%)</span>
                        </div>
                        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-500 transition-all duration-300 flex items-center justify-end pr-2"
                            style={{ width: `${percent}%` }}
                          >
                            {percent > 15 && (
                              <span className="text-xs text-white font-medium">{percent}%</span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="mt-4">
                  {stat.textAnswers.length > 0 ? (
                    <div className="space-y-3">
                      {stat.textAnswers.slice(0, showAllResponses ? undefined : 5).map((answer, i) => (
                        <div key={i} className="bg-gray-50 dark:bg-gray-700 p-3 rounded-lg text-sm">
                          {answer}
                        </div>
                      ))}
                      {stat.textAnswers.length > 5 && !showAllResponses && (
                        <button
                          onClick={() => setShowAllResponses(true)}
                          className="text-blue-600 hover:underline text-sm"
                        >
                          {language === "zh" ? `查看全部 ${stat.textAnswers.length} 条回答` : `View all ${stat.textAnswers.length} answers`}
                        </button>
                      )}
                    </div>
                  ) : (
                    <p className="text-gray-500 text-sm">{language === "zh" ? "暂无回答" : "No answers yet"}</p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* All Responses */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold">{t("viewAllResponses")}</h2>
          <button
            onClick={() => setShowAllResponses(!showAllResponses)}
            className="text-blue-600 hover:underline text-sm"
          >
            {showAllResponses ? t("hideResponses") : t("viewAllResponses")}
          </button>
        </div>

        {showAllResponses && (
          <div className="space-y-6">
            {data.responses.map((resp, i) => (
              <div key={i} className="border border-gray-200 dark:border-gray-600 rounded-lg p-6">
                <div className="flex justify-between items-center mb-4">
                  <span className="font-medium">{resp.username}</span>
                  <span className="text-xs text-gray-500">
                    {new Date(resp.submittedAt).toLocaleString(dateLocale)}
                  </span>
                </div>

                {resp.aiAnalysis && (
                  <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                    <p className="text-sm font-medium text-blue-700 dark:text-blue-400 mb-2">AI分析摘要</p>
                    <p className="text-sm text-gray-600 dark:text-gray-300">{resp.aiAnalysis.summary}</p>
                  </div>
                )}

                {resp.additionalComment && (
                  <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-600">
                    <p className="text-sm font-medium text-gray-500 mb-1">{t("additionalComment")}</p>
                    <p className="text-sm">{resp.additionalComment}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
