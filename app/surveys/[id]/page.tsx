"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "../../context/AuthContext";
import { useLanguage } from "../../context/LanguageContext";

interface Question {
  index: number;
  text: string;
  textEn?: string;
  type: "single" | "multiple" | "text";
  section?: string;
  options: string[];
  optionsEn?: string[];
  required: boolean;
}

interface QuestionStat {
  questionIndex: number;
  optionCounts: Record<string, number>;
  total: number;
}

interface Survey {
  _id: string;
  title: string;
  titleEn?: string;
  description?: string;
  descriptionEn?: string;
  questions: Question[];
  sections?: { title: string; titleEn?: string }[];
  author: string;
  status: "draft" | "published" | "closed";
  isVisible?: boolean;
  responseCount: number;
  createdAt: string;
  questionStats?: QuestionStat[];
}

interface AIAnalysis {
  summary: string;
  insights: string[];
  suggestions: string[];
}

// 检查是否是管理员
function isAdmin(userId: string | undefined): boolean {
  return userId === "offline_admin";
}

export default function SurveyDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user, authFetch, isGuest } = useAuth();
  const { t, language } = useLanguage();
  const surveyId = params.id as string;

  const [survey, setSurvey] = useState<Survey | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<"notfound" | "error" | null>(null);
  const [answers, setAnswers] = useState<Record<number, string | string[]>>({});
  const [additionalComment, setAdditionalComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<AIAnalysis | null>(null);
  const [showStats, setShowStats] = useState(false);

  const isUserAdmin = isAdmin(user?.userId);

  useEffect(() => {
    if (surveyId) {
      fetchSurvey();
      if (user) checkSubmitted();
    }
  }, [surveyId, user]);  // eslint-disable-line react-hooks/exhaustive-deps

  const fetchSurvey = async () => {
    setFetchError(null);
    try {
      const response = await fetch(`/api/surveys/${surveyId}`);
      if (response.status === 404) {
        setFetchError("notfound");
        return;
      }
      if (!response.ok) {
        setFetchError("error");
        return;
      }
      const data = await response.json();
      setSurvey(data);
    } catch {
      setFetchError("error");
    } finally {
      setLoading(false);
    }
  };

  const checkSubmitted = async () => {
    try {
      const response = await authFetch(`/api/surveys/${surveyId}/submit`);
      const data = await response.json();
      if (data.submitted) {
        setSubmitted(true);
        if (data.aiAnalysis) {
          setAiAnalysis(data.aiAnalysis);
        }
      }
    } catch {
      // Not submitted yet
    }
  };

  const handleAnswerChange = (questionIndex: number, value: string | string[]) => {
    setAnswers((prev) => ({
      ...prev,
      [questionIndex]: value,
    }));
  };

  const handleMultipleChange = (questionIndex: number, option: string, checked: boolean) => {
    setAnswers((prev) => {
      const current = (prev[questionIndex] as string[]) || [];
      if (checked) {
        return { ...prev, [questionIndex]: [...current, option] };
      } else {
        return { ...prev, [questionIndex]: current.filter((o) => o !== option) };
      }
    });
  };

  const handleSubmit = async () => {
    if (!survey) return;

    // 验证必答题
    for (const q of survey.questions) {
      if (q.required) {
        const answer = answers[q.index];
        if (!answer || (Array.isArray(answer) && answer.length === 0)) {
          alert(`${t("questionNumber")}${q.index + 1}${t("question")}: ${t("requiredQuestion")}`);
          return;
        }
      }
    }

    setSubmitting(true);
    setAnalyzing(true); // 开始显示AI分析中
    try {
      const formattedAnswers = survey.questions.map((q) => ({
        questionIndex: q.index,
        answer: answers[q.index] || (q.type === "multiple" ? [] : ""),
        answerOption: typeof answers[q.index] === "string" ? answers[q.index] : undefined,
      }));

      const response = await authFetch(`/api/surveys/${surveyId}/submit`, {
        method: "POST",
        body: JSON.stringify({
          answers: formattedAnswers,
          additionalComment: additionalComment.trim(),
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || t("networkError"));
      }

      const data = await response.json();
      setSubmitted(true);
      if (data.aiAnalysis) {
        setAiAnalysis(data.aiAnalysis);
      }
      // 重新获取问卷数据以更新统计
      await fetchSurvey();
      alert(t("surveySubmitSuccess"));
    } catch (error: any) {
      alert(error.message || t("networkError"));
    } finally {
      setSubmitting(false);
      setAnalyzing(false);
    }
  };

  if (loading) return <p className="text-center text-gray-500">{t("loading")}</p>;
  if (fetchError === "notfound") return (
    <div className="text-center py-20">
      <p className="text-gray-500 mb-4">{t("surveyNotFound")}</p>
      <Link href="/surveys" className="text-blue-600 hover:underline">{t("backToSurveys")}</Link>
    </div>
  );
  if (fetchError === "error" || !survey) return (
    <div className="text-center py-20">
      <p className="text-gray-500 mb-4">{language === "zh" ? "加载失败，请稍后重试" : "Failed to load. Please try again."}</p>
      <div className="flex gap-4 justify-center">
        <button onClick={() => { setLoading(true); fetchSurvey(); }} className="text-blue-600 hover:underline">
          {language === "zh" ? "重试" : "Retry"}
        </button>
        <Link href="/surveys" className="text-gray-500 hover:underline">{t("backToSurveys")}</Link>
      </div>
    </div>
  );

  const displayTitle = language === "en" && survey.titleEn ? survey.titleEn : survey.title;
  const displayDesc = language === "en" && survey.descriptionEn ? survey.descriptionEn : survey.description;
  const dateLocale = language === "en" ? "en-US" : "zh-CN";

  // 按section分组问题
  const questionsBySection: Record<string, Question[]> = {};
  survey.questions.forEach((q) => {
    const section = q.section || "";
    if (!questionsBySection[section]) {
      questionsBySection[section] = [];
    }
    questionsBySection[section].push(q);
  });

  // 获取选项百分比
  const getOptionPercent = (questionIndex: number, option: string) => {
    const stat = survey.questionStats?.find((s) => s.questionIndex === questionIndex);
    if (!stat || stat.total === 0) return 0;
    const count = stat.optionCounts[option] || 0;
    return Math.round((count / stat.total) * 100);
  };

  return (
    <div>
      {/* AI Analyzing Modal */}
      {analyzing && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-8 max-w-md w-full mx-4 text-center shadow-2xl">
            <div className="animate-spin w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-6"></div>
            <h3 className="text-xl font-bold text-gray-800 dark:text-gray-200 mb-2">
              🤖 {t("aiAnalysisLoading")}
            </h3>
            <p className="text-gray-500 dark:text-gray-400">
              {language === "zh" ? "请稍候，AI正在分析您的回答..." : "Please wait while AI analyzes your responses..."}
            </p>
          </div>
        </div>
      )}

      {/* Back Button */}
      <Link href="/surveys" className="text-blue-600 hover:underline mb-6 inline-block">
        {t("backToSurveys")}
      </Link>

      {/* Survey Header */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-8 mb-8">
        <div className="mb-4">
          <h1 className="text-3xl font-bold mb-2">{displayTitle}</h1>
          <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500">
            <span>👤 {survey.author}</span>
            <span>📝 {survey.responseCount} {t("totalResponses")}</span>
            <span>🕐 {new Date(survey.createdAt).toLocaleString(dateLocale)}</span>
          </div>
        </div>

        {displayDesc && (
          <p className="text-gray-600 dark:text-gray-300 whitespace-pre-wrap">{displayDesc}</p>
        )}
      </div>

      {/* Already Submitted */}
      {submitted ? (
        <div className="space-y-8">
          {/* AI Analysis */}
          {aiAnalysis && (
            <div className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-8">
              <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
                🤖 {t("aiAnalysisTitle")}
              </h2>

              {aiAnalysis.summary && (
                <div className="mb-6">
                  <h3 className="text-lg font-bold text-blue-700 dark:text-blue-400 mb-2">{t("aiSummary")}</h3>
                  <p className="text-gray-700 dark:text-gray-200">{aiAnalysis.summary}</p>
                </div>
              )}

              {aiAnalysis.insights && aiAnalysis.insights.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-lg font-bold text-green-700 dark:text-green-400 mb-2">{t("aiInsights")}</h3>
                  <ul className="list-disc list-inside space-y-2">
                    {aiAnalysis.insights.map((insight, i) => (
                      <li key={i} className="text-gray-700 dark:text-gray-200">{insight}</li>
                    ))}
                  </ul>
                </div>
              )}

              {aiAnalysis.suggestions && aiAnalysis.suggestions.length > 0 && (
                <div>
                  <h3 className="text-lg font-bold text-purple-700 dark:text-purple-400 mb-2">{t("aiSuggestions")}</h3>
                  <ul className="list-disc list-inside space-y-2">
                    {aiAnalysis.suggestions.map((suggestion, i) => (
                      <li key={i} className="text-gray-700 dark:text-gray-200">{suggestion}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* View Statistics Toggle */}
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-8">
            <button
              onClick={() => setShowStats(!showStats)}
              className="text-blue-600 hover:underline font-medium"
            >
              {showStats ? t("hideResponses") : t("viewResults")}
            </button>

            {showStats && survey.questionStats && (
              <div className="mt-6 space-y-6">
                {survey.questions.map((q) => {
                  const stat = survey.questionStats?.find((s) => s.questionIndex === q.index);
                  const qText = language === "en" && q.textEn ? q.textEn : q.text;

                  return (
                    <div key={q.index} className="border-b border-gray-200 dark:border-gray-600 pb-4 last:border-0">
                      <p className="font-medium mb-3">{q.index + 1}. {qText}</p>

                      {q.type !== "text" && q.options?.map((opt) => {
                        const optText = language === "en" && q.optionsEn?.[q.options.indexOf(opt)]
                          ? q.optionsEn[q.options.indexOf(opt)]
                          : opt;
                        const percent = getOptionPercent(q.index, opt);
                        const count = stat?.optionCounts[opt] || 0;

                        return (
                          <div key={opt} className="mb-2">
                            <div className="flex justify-between text-sm mb-1">
                              <span>{optText}</span>
                              <span className="text-gray-500">{count} ({percent}%)</span>
                            </div>
                            <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-blue-500 transition-all duration-300"
                                style={{ width: `${percent}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : survey.status !== "published" ? (
        <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-8 text-center">
          <p className="text-gray-500">{t("surveyNotPublished")}</p>
        </div>
      ) : survey.isVisible === false ? (
        <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-8 text-center">
          <p className="text-gray-500">{t("isHidden")}</p>
        </div>
      ) : isGuest ? (
        <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-8 text-center">
          <p className="text-gray-500 mb-2">{language === "zh" ? "请登录后参与问卷" : "Please log in to participate"}</p>
          <div className="flex gap-4 justify-center">
            <Link href="/login" className="text-blue-600 hover:underline">{t("loginLink")}</Link>
            <span className="text-gray-300">|</span>
            <Link href="/register" className="text-blue-600 hover:underline">{t("registerLink")}</Link>
          </div>
        </div>
      ) : (
        <>
          {/* Questions */}
          <div className="space-y-8">
            {Object.entries(questionsBySection).map(([section, questions]) => (
              <div key={section}>
                {section && (
                  <h2 className="text-xl font-bold mb-4 text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-gray-600 pb-2">
                    {section}
                  </h2>
                )}

                <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6 space-y-6">
                  {questions.map((q) => {
                    const qText = language === "en" && q.textEn ? q.textEn : q.text;

                    return (
                      <div key={q.index} className="border-b border-gray-100 dark:border-gray-700 last:border-0 last:pb-0 pb-6">
                        <p className="font-medium mb-3">
                          {q.index + 1}. {qText}
                          {q.required && <span className="text-red-500 ml-1">*</span>}
                        </p>

                        {q.type === "single" && q.options?.map((opt) => {
                          const optText = language === "en" && q.optionsEn?.[q.options.indexOf(opt)]
                            ? q.optionsEn[q.options.indexOf(opt)]
                            : opt;

                          return (
                            <label key={opt} className="flex items-center gap-3 py-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 px-2 rounded">
                              <input
                                type="radio"
                                name={`question-${q.index}`}
                                value={opt}
                                checked={answers[q.index] === opt}
                                onChange={() => handleAnswerChange(q.index, opt)}
                                className="w-4 h-4 text-blue-600"
                              />
                              <span>{optText}</span>
                            </label>
                          );
                        })}

                        {q.type === "multiple" && q.options?.map((opt) => {
                          const optText = language === "en" && q.optionsEn?.[q.options.indexOf(opt)]
                            ? q.optionsEn[q.options.indexOf(opt)]
                            : opt;

                          return (
                            <label key={opt} className="flex items-center gap-3 py-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 px-2 rounded">
                              <input
                                type="checkbox"
                                checked={((answers[q.index] as string[]) || []).includes(opt)}
                                onChange={(e) => handleMultipleChange(q.index, opt, e.target.checked)}
                                className="w-4 h-4 text-blue-600 rounded"
                              />
                              <span>{optText}</span>
                            </label>
                          );
                        })}

                        {q.type === "text" && (
                          <textarea
                            value={(answers[q.index] as string) || ""}
                            onChange={(e) => handleAnswerChange(q.index, e.target.value)}
                            rows={4}
                            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder={language === "zh" ? "请输入您的回答..." : "Enter your answer..."}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            {/* Additional Comment */}
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
              <label className="block font-medium mb-3">{t("additionalComment")}</label>
              <textarea
                value={additionalComment}
                onChange={(e) => setAdditionalComment(e.target.value)}
                rows={4}
                placeholder={t("additionalCommentPlaceholder")}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Submit Button */}
          <div className="mt-8">
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full bg-blue-600 text-white py-4 rounded-lg font-bold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? t("surveySubmitting") : t("surveySubmit")}
            </button>
          </div>
        </>
      )}

      {/* Admin Actions */}
      {isUserAdmin && (
        <div className="mt-8 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-6">
          <div className="flex items-center gap-2 mb-4">
            <span className="font-semibold text-purple-600 dark:text-purple-400">🛡️ {t("adminPanel")}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/surveys/${surveyId}/results`}
              className="px-4 py-2 rounded-lg font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 hover:bg-blue-200 transition"
            >
              {t("viewResults")}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
