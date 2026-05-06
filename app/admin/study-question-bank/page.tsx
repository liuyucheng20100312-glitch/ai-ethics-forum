"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/app/context/AuthContext";
import { useLanguage } from "@/app/context/LanguageContext";
import { isAdminUserId } from "@/lib/admin-auth";

type ReviewStatus = "all" | "pending_review" | "approved" | "rejected";

type QuestionBankItem = {
  _id: string;
  questionHash: string;
  title: string;
  subject: string;
  subjectCode: string;
  hlSl: string;
  questionNumber: string;
  stem: string;
  correctAnswer: string;
  knowledgePoints: string[];
  maxScore: number | null;
  qualityScore: number;
  reviewStatus: ReviewStatus;
  reviewReason?: string;
  vectorized?: boolean;
  origin?: string;
  originLabel?: string;
  sourceKind?: string;
  sourceExamId?: string;
  sourceUsername?: string;
  createdAt?: string;
  updatedAt?: string;
};

type QuestionBankResponse = {
  items: QuestionBankItem[];
  total: number;
  totalPages: number;
  currentPage: number;
  stats: {
    total: number;
    pending: number;
    approved: number;
    rejected: number;
  };
};

const STATUS_OPTIONS: Array<{ value: ReviewStatus; zh: string; en: string }> = [
  { value: "pending_review", zh: "待审核", en: "Pending" },
  { value: "approved", zh: "已批准", en: "Approved" },
  { value: "rejected", zh: "已拒绝", en: "Rejected" },
  { value: "all", zh: "全部", en: "All" },
];

function statusClass(status: ReviewStatus): string {
  if (status === "approved") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (status === "rejected") {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }
  return "border-amber-200 bg-amber-50 text-amber-700";
}

function shortDate(value?: string, locale = "zh-CN"): string {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString(locale);
}

export default function AdminStudyQuestionBankPage() {
  const { user, authFetch } = useAuth();
  const { language } = useLanguage();
  const [items, setItems] = useState<QuestionBankItem[]>([]);
  const [stats, setStats] = useState<QuestionBankResponse["stats"]>({
    total: 0,
    pending: 0,
    approved: 0,
    rejected: 0,
  });
  const [status, setStatus] = useState<ReviewStatus>("pending_review");
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState("");
  const [cleaning, setCleaning] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const isAdmin = isAdminUserId(user?.userId);
  const locale = language === "zh" ? "zh-CN" : "en-US";
  const statusLabelMap = useMemo(
    () => new Map(STATUS_OPTIONS.map((option) => [option.value, language === "zh" ? option.zh : option.en])),
    [language]
  );

  async function loadItems(nextStatus = status) {
    if (!isAdmin) return;
    setLoading(true);
    setErrorMessage("");

    try {
      const response = await authFetch(`/api/admin/study-question-bank?status=${nextStatus}&limit=50`);
      const data = (await response.json()) as QuestionBankResponse | { error?: string };
      if (!response.ok) {
        throw new Error("error" in data ? data.error || "Failed to load question bank." : "Failed to load question bank.");
      }

      setItems((data as QuestionBankResponse).items || []);
      setStats((data as QuestionBankResponse).stats);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load question bank.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadItems(status);
  }, [isAdmin, status]); // eslint-disable-line react-hooks/exhaustive-deps

  async function updateStatus(item: QuestionBankItem, reviewStatus: "approved" | "rejected" | "pending_review") {
    const reason =
      reviewStatus === "rejected"
        ? window.prompt(language === "zh" ? "拒绝原因（可选）" : "Reason for rejection (optional)") || ""
        : "";
    setUpdatingId(item._id);
    setErrorMessage("");

    try {
      const response = await authFetch(`/api/admin/study-question-bank/${item._id}`, {
        method: "PATCH",
        body: JSON.stringify({ reviewStatus, reason }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || "Failed to update review status.");
      }
      await loadItems(status);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to update review status.");
    } finally {
      setUpdatingId("");
    }
  }

  async function cleanupCurrentAutoLearnedItems() {
    const label = statusLabelMap.get(status) || status;
    const confirmed = window.confirm(
      language === "zh"
        ? `确认清理当前筛选范围（${label}）下所有从试卷上传自动学习产生的数据吗？这会删除审核队列、MongoDB 知识库元数据和对应 Zilliz 向量。`
        : `Clean all auto-learned uploaded-exam data in the current filter (${label})? This removes review items, MongoDB knowledge metadata, and matching Zilliz vectors.`
    );

    if (!confirmed) return;

    setCleaning(true);
    setErrorMessage("");

    try {
      const response = await authFetch(
        `/api/admin/study-question-bank?origin=study_upload_auto_learn&status=${status}`,
        { method: "DELETE" }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || "Failed to cleanup auto-learned data.");
      }
      await loadItems(status);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to cleanup auto-learned data.");
    } finally {
      setCleaning(false);
    }
  }

  if (!isAdmin) {
    return (
      <div className="py-20 text-center">
        <p className="text-slate-500">{language === "zh" ? "无权限访问此页面" : "Access denied"}</p>
        <Link href="/admin" className="mt-4 inline-flex text-sm font-medium text-teal-600">
          {language === "zh" ? "返回管理后台" : "Back to admin"}
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <Link href="/admin" className="text-sm font-medium text-teal-600">
            {language === "zh" ? "返回管理后台" : "Back to admin"}
          </Link>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
            {language === "zh" ? "学习题库审核" : "Study Question Review"}
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            {language === "zh"
              ? "审核自动学习捕获的高质量题目。批准后会写入 MongoDB 元数据并同步到 Zilliz 向量库，后续资料推荐会优先使用。"
              : "Review auto-captured questions. Approved items are published to MongoDB metadata and Zilliz vectors for future recommendations."}
          </p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">{language === "zh" ? "总计" : "Total"}</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{stats.total}</p>
        </div>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm text-amber-700">{language === "zh" ? "待审核" : "Pending"}</p>
          <p className="mt-2 text-2xl font-semibold text-amber-900">{stats.pending}</p>
        </div>
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-sm text-emerald-700">{language === "zh" ? "已批准" : "Approved"}</p>
          <p className="mt-2 text-2xl font-semibold text-emerald-900">{stats.approved}</p>
        </div>
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4">
          <p className="text-sm text-rose-700">{language === "zh" ? "已拒绝" : "Rejected"}</p>
          <p className="mt-2 text-2xl font-semibold text-rose-900">{stats.rejected}</p>
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap gap-2">
          {STATUS_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setStatus(option.value)}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                status === option.value
                  ? "bg-slate-950 text-white"
                  : "border border-slate-200 bg-white text-slate-600 hover:border-slate-300"
              }`}
            >
              {language === "zh" ? option.zh : option.en}
            </button>
          ))}
        </div>
        <button
          type="button"
          disabled={cleaning || loading}
          onClick={cleanupCurrentAutoLearnedItems}
          className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-medium text-rose-700 disabled:opacity-50"
        >
          {language === "zh" ? "清理当前筛选的自动学习数据" : "Cleanup filtered auto-learned data"}
        </button>
      </div>

      {errorMessage ? (
        <div className="mt-5 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {errorMessage}
        </div>
      ) : null}

      <div className="mt-6 space-y-4">
        {loading ? (
          <div className="rounded-lg border border-dashed border-slate-200 bg-white px-4 py-12 text-center text-sm text-slate-500">
            {language === "zh" ? "正在加载审核队列..." : "Loading review queue..."}
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 bg-white px-4 py-12 text-center text-sm text-slate-500">
            {language === "zh" ? "当前没有需要展示的题目。" : "No questions for this filter."}
          </div>
        ) : (
          items.map((item) => (
            <article key={item._id} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-lg border px-3 py-1 text-xs font-medium ${statusClass(item.reviewStatus)}`}>
                      {statusLabelMap.get(item.reviewStatus) || item.reviewStatus}
                    </span>
                    <span className="rounded-lg bg-slate-100 px-3 py-1 text-xs text-slate-600">
                      {item.subjectCode || item.subject || "IB"} / {item.hlSl || "BOTH"}
                    </span>
                    <span className="rounded-lg bg-slate-100 px-3 py-1 text-xs text-slate-600">
                      {language === "zh" ? "质量分" : "Quality"} {item.qualityScore || 0}
                    </span>
                    {item.vectorized ? (
                      <span className="rounded-lg bg-emerald-100 px-3 py-1 text-xs text-emerald-700">
                        Zilliz
                      </span>
                    ) : null}
                    <span className="rounded-lg bg-cyan-50 px-3 py-1 text-xs text-cyan-700">
                      {item.originLabel || item.origin || "Manual / legacy"}
                    </span>
                  </div>
                  <h2 className="mt-3 text-lg font-semibold text-slate-950">
                    {item.title || `${item.subject || "IB"} Q${item.questionNumber}`}
                  </h2>
                  <p className="mt-1 text-xs text-slate-500">
                    {language === "zh" ? "来源" : "Source"}: {item.sourceUsername || "-"} · {shortDate(item.createdAt, locale)}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  {item.reviewStatus !== "approved" ? (
                    <button
                      type="button"
                      disabled={updatingId === item._id}
                      onClick={() => updateStatus(item, "approved")}
                      className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                    >
                      {language === "zh" ? "批准入库" : "Approve"}
                    </button>
                  ) : null}
                  {item.reviewStatus !== "rejected" ? (
                    <button
                      type="button"
                      disabled={updatingId === item._id}
                      onClick={() => updateStatus(item, "rejected")}
                      className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-medium text-rose-700 disabled:opacity-50"
                    >
                      {language === "zh" ? "拒绝" : "Reject"}
                    </button>
                  ) : null}
                  {item.reviewStatus !== "pending_review" ? (
                    <button
                      type="button"
                      disabled={updatingId === item._id}
                      onClick={() => updateStatus(item, "pending_review")}
                      className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 disabled:opacity-50"
                    >
                      {language === "zh" ? "退回待审" : "Move to pending"}
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                <section className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {language === "zh" ? "题干" : "Question stem"}
                  </p>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-800">{item.stem || "-"}</p>
                </section>
                <section className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {language === "zh" ? "标准答案 / 评分说明" : "Standard answer / marking notes"}
                  </p>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-800">{item.correctAnswer || "-"}</p>
                </section>
              </div>

              <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-600">
                {(item.knowledgePoints || []).map((point, index) => (
                  <span key={`${item._id}-${point}-${index}`} className="rounded-lg bg-slate-100 px-3 py-1">
                    {point}
                  </span>
                ))}
                {item.maxScore !== null && item.maxScore !== undefined ? (
                  <span className="rounded-lg bg-slate-100 px-3 py-1">
                    {language === "zh" ? "分值" : "Marks"} {item.maxScore}
                  </span>
                ) : null}
                {item.reviewReason ? (
                  <span className="rounded-lg bg-rose-100 px-3 py-1 text-rose-700">
                    {item.reviewReason}
                  </span>
                ) : null}
              </div>
            </article>
          ))
        )}
      </div>
    </div>
  );
}
