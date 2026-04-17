"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/app/context/AuthContext";
import { useLanguage } from "@/app/context/LanguageContext";
import { isAdminUserId } from "@/lib/admin-auth";

type ExamListItem = {
  id: string;
  title: string;
  subject: string;
  grade: string;
  examDate: string;
  sourceType: string;
  ocrStatus: string;
  tags: string[];
  createdAt: string;
};

type StudyWeakness = {
  topic: string;
  skill: string;
  severity: "high" | "medium" | "low";
  reason: string;
  evidence: string[];
  recommendedFocus: string;
  confidence: number;
};

type StudyMaterialRecommendation = {
  materialId?: string;
  title: string;
  url: string;
  materialType: string;
  reason: string;
  topics: string[];
  score: number;
};

type StudyPlanTask = {
  taskId: string;
  day: number;
  title: string;
  type: "review" | "practice" | "revision" | "reflection";
  minutes: number;
  focusTopics: string[];
  successCriteria: string;
};

type StudyCheckpoint = {
  day: number;
  title: string;
  metric: string;
};

type StudyPlanRecord = {
  _id: string;
  title: string;
  horizonDays: number;
  dailyMinutes: number;
  goals: string[];
  tasks: StudyPlanTask[];
  checkpoints: StudyCheckpoint[];
  completedTaskIds: string[];
  status: string;
  updatedAt?: string;
};

type StudyAnalysisRecord = {
  _id: string;
  overview: string;
  scoreSummary?: {
    totalQuestions?: number;
    wrongQuestions?: number;
    scoredPoints?: number | null;
    totalPoints?: number | null;
    accuracyRate?: number | null;
  };
  weaknesses: StudyWeakness[];
  recommendedQueries: string[];
  recommendedMaterials: StudyMaterialRecommendation[];
  analysisMode: "ai" | "fallback";
  createdAt?: string;
};

type ExamDetailResponse = {
  exam: {
    _id: string;
    title: string;
    subject: string;
    grade: string;
    examDate: string;
    rawText: string;
    sourceType: string;
    ocrStatus: string;
    questions: Array<{
      questionNumber: string;
      stem: string;
      studentAnswer: string;
      correctAnswer: string;
      score: number | null;
      maxScore: number | null;
      knowledgePoints: string[];
      teacherComment: string;
      isWrong: boolean | null;
    }>;
    tags: string[];
  };
  latestAnalysis: StudyAnalysisRecord | null;
  activePlan: StudyPlanRecord | null;
};

type UploadFormState = {
  title: string;
  subject: string;
  grade: string;
  examDate: string;
  tags: string;
  paperText: string;
  autoAnalyze: boolean;
};

type MetadataDraft = {
  title: string;
  subject: string;
  grade: string;
};

const SUBJECT_OPTIONS = [
  "",
  "Mathematics",
  "Physics",
  "Chemistry",
  "Biology",
  "Economics",
  "Computer Science",
  "Business Management",
  "English",
];

const GRADE_OPTIONS = ["", "HL", "SL", "IBDP", "MYP", "Other"];

const EMPTY_UPLOAD_FORM: UploadFormState = {
  title: "",
  subject: "",
  grade: "",
  examDate: new Date().toISOString().slice(0, 10),
  tags: "",
  paperText: "",
  autoAnalyze: true,
};

function formatDate(value?: string, locale = "zh-CN"): string {
  if (!value) {
    return "-";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString(locale);
}

function ocrStatusTone(status: string): string {
  switch (status) {
    case "ready":
      return "bg-emerald-100 text-emerald-700 border border-emerald-200";
    case "pending":
      return "bg-amber-100 text-amber-700 border border-amber-200";
    default:
      return "bg-slate-100 text-slate-700 border border-slate-200";
  }
}

function severityTone(severity: string): string {
  switch (severity) {
    case "high":
      return "bg-rose-100 text-rose-700 border border-rose-200";
    case "medium":
      return "bg-amber-100 text-amber-700 border border-amber-200";
    default:
      return "bg-sky-100 text-sky-700 border border-sky-200";
  }
}

function taskTypeLabel(taskType: string, language: string): string {
  const map: Record<string, { zh: string; en: string }> = {
    review: { zh: "复盘", en: "Review" },
    practice: { zh: "练习", en: "Practice" },
    revision: { zh: "巩固", en: "Revision" },
    reflection: { zh: "反思", en: "Reflection" },
  };

  const labels = map[taskType] || { zh: taskType, en: taskType };
  return language === "zh" ? labels.zh : labels.en;
}

function needsMetadataReview(exam?: ExamDetailResponse["exam"] | null): boolean {
  if (!exam) {
    return false;
  }

  const subject = (exam.subject || "").trim().toLowerCase();
  const grade = (exam.grade || "").trim().toLowerCase();

  return !subject || subject === "other" || subject === "unknown" || !grade || grade === "other" || grade === "unknown";
}

export default function AdminStudyAssistantPage() {
  const { user, authFetch } = useAuth();
  const { language } = useLanguage();
  const isUserAdmin = isAdminUserId(user?.userId);
  const locale = language === "zh" ? "zh-CN" : "en-US";

  const [exams, setExams] = useState<ExamListItem[]>([]);
  const [selectedExamId, setSelectedExamId] = useState<string>("");
  const [examDetail, setExamDetail] = useState<ExamDetailResponse | null>(null);
  const [loadingExams, setLoadingExams] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [submittingCheckIn, setSubmittingCheckIn] = useState(false);
  const [uploadForm, setUploadForm] = useState<UploadFormState>(EMPTY_UPLOAD_FORM);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [stagedCompletedTaskIds, setStagedCompletedTaskIds] = useState<string[]>([]);
  const [minutesStudied, setMinutesStudied] = useState("45");
  const [blockersInput, setBlockersInput] = useState("");
  const [reflection, setReflection] = useState("");
  const [metadataDraft, setMetadataDraft] = useState<MetadataDraft>({
    title: "",
    subject: "",
    grade: "",
  });
  const [savingMetadata, setSavingMetadata] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const activePlan = examDetail?.activePlan || null;
  const latestAnalysis = examDetail?.latestAnalysis || null;
  const metadataNeedsReview = needsMetadataReview(examDetail?.exam);

  const progressSummary = useMemo(() => {
    if (!activePlan) {
      return null;
    }

    const totalTasks = activePlan.tasks.length;
    const completed = activePlan.completedTaskIds.length;
    const completionRate = totalTasks > 0 ? Math.round((completed / totalTasks) * 100) : 0;

    return {
      totalTasks,
      completed,
      completionRate,
    };
  }, [activePlan]);

  useEffect(() => {
    if (isUserAdmin) {
      void loadExams();
    }
  }, [isUserAdmin]);

  useEffect(() => {
    if (!selectedExamId) {
      setExamDetail(null);
      return;
    }

    void loadExamDetail(selectedExamId);
  }, [selectedExamId]);

  useEffect(() => {
    setStagedCompletedTaskIds(activePlan?.completedTaskIds || []);
  }, [activePlan?._id, activePlan?.completedTaskIds]);

  useEffect(() => {
    if (!examDetail?.exam) {
      setMetadataDraft({ title: "", subject: "", grade: "" });
      return;
    }

    setMetadataDraft({
      title: examDetail.exam.title || "",
      subject: examDetail.exam.subject || "",
      grade: examDetail.exam.grade || "",
    });
  }, [examDetail?.exam?._id, examDetail?.exam?.title, examDetail?.exam?.subject, examDetail?.exam?.grade]);

  async function loadExams() {
    setLoadingExams(true);
    setErrorMessage("");

    try {
      const response = await authFetch("/api/study/exams");
      const data = await response.json();
      const items = Array.isArray(data.items) ? (data.items as ExamListItem[]) : [];
      setExams(items);
      if (!selectedExamId && items.length > 0) {
        setSelectedExamId(items[0].id);
      }
    } catch (error) {
      console.error("Failed to load study exams:", error);
      setErrorMessage(language === "zh" ? "加载试卷列表失败" : "Failed to load exams");
    } finally {
      setLoadingExams(false);
    }
  }

  async function loadExamDetail(examId: string) {
    setLoadingDetail(true);
    setErrorMessage("");

    try {
      const response = await authFetch(`/api/study/exams/${examId}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to load exam detail");
      }

      setExamDetail(data as ExamDetailResponse);
    } catch (error) {
      console.error("Failed to load study exam detail:", error);
      setErrorMessage(language === "zh" ? "加载试卷详情失败" : "Failed to load exam detail");
    } finally {
      setLoadingDetail(false);
    }
  }

  async function handleUpload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setUploading(true);
    setStatusMessage("");
    setErrorMessage("");

    try {
      const formData = new FormData();
      formData.append("title", uploadForm.title);
      if (uploadForm.subject) {
        formData.append("subject", uploadForm.subject);
      }
      if (uploadForm.grade) {
        formData.append("grade", uploadForm.grade);
      }
      formData.append("examDate", uploadForm.examDate);
      formData.append("tags", uploadForm.tags);
      formData.append("paperText", uploadForm.paperText);
      if (selectedFile) {
        formData.append("paper", selectedFile);
      }

      const response = await authFetch("/api/study/exams", {
        method: "POST",
        body: formData,
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Upload failed");
      }

      const newExamId = String(data.id);
      setUploadForm(EMPTY_UPLOAD_FORM);
      setSelectedFile(null);
      setStatusMessage(
        language === "zh"
          ? "试卷已上传，正在准备分析工作区。"
          : "Exam uploaded. Preparing the assistant workspace."
      );
      await loadExams();
      setSelectedExamId(newExamId);
      await loadExamDetail(newExamId);

      if (uploadForm.autoAnalyze && data.exam?.ocrStatus !== "pending" && !needsMetadataReview(data.exam)) {
        await handleAnalyze(newExamId);
      } else if (uploadForm.autoAnalyze && data.exam?.ocrStatus !== "pending") {
        setStatusMessage(
          language === "zh"
            ? "试卷已解析，但科目或层级不够确定。请先补充科目/HL-SL，再开始分析。"
            : "The exam was parsed, but subject or level is uncertain. Please confirm the metadata before analysis."
        );
      }
    } catch (error) {
      console.error("Failed to upload study paper:", error);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : language === "zh"
            ? "上传失败"
            : "Upload failed"
      );
    } finally {
      setUploading(false);
    }
  }

  async function handleAnalyze(examId = selectedExamId) {
    if (!examId) {
      return;
    }

    setAnalyzing(true);
    setStatusMessage("");
    setErrorMessage("");

    try {
      const response = await authFetch(`/api/study/exams/${examId}/analyze`, {
        method: "POST",
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Analyze failed");
      }

      await loadExamDetail(examId);
      await loadExams();
      setStatusMessage(
        language === "zh"
          ? "AI 已完成弱项诊断、学习计划和资料推荐。"
          : "The assistant finished the diagnosis, plan, and material recommendations."
      );
    } catch (error) {
      console.error("Failed to analyze study exam:", error);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : language === "zh"
            ? "分析失败"
            : "Analyze failed"
      );
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleCheckIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activePlan?._id) {
      return;
    }

    setSubmittingCheckIn(true);
    setStatusMessage("");
    setErrorMessage("");

    try {
      const blockers = blockersInput
        .split(/\n|,/)
        .map((item) => item.trim())
        .filter((item) => item.length > 0);

      const response = await authFetch("/api/study/check-ins", {
        method: "POST",
        body: JSON.stringify({
          planId: activePlan._id,
          completedTaskIds: stagedCompletedTaskIds,
          minutesStudied: Number(minutesStudied) || 0,
          blockers,
          reflection,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Check-in failed");
      }

      await loadExamDetail(selectedExamId);
      setBlockersInput("");
      setReflection("");
      setStatusMessage(
        data.feedback?.summary ||
          (language === "zh" ? "学习执行记录已更新。" : "Check-in recorded.")
      );
    } catch (error) {
      console.error("Failed to submit check-in:", error);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : language === "zh"
            ? "提交监督记录失败"
            : "Failed to submit check-in"
      );
    } finally {
      setSubmittingCheckIn(false);
    }
  }

  async function handleMetadataSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedExamId) {
      return;
    }

    setSavingMetadata(true);
    setStatusMessage("");
    setErrorMessage("");

    try {
      const response = await authFetch(`/api/study/exams/${selectedExamId}`, {
        method: "PATCH",
        body: JSON.stringify(metadataDraft),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to update exam metadata");
      }

      await loadExamDetail(selectedExamId);
      await loadExams();
      setStatusMessage(
        language === "zh"
          ? "试卷科目和层级已补充，现在可以重新分析。"
          : "Exam subject and level were updated. You can analyze again now."
      );
    } catch (error) {
      console.error("Failed to update study exam metadata:", error);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : language === "zh"
            ? "更新试卷信息失败"
            : "Failed to update exam metadata"
      );
    } finally {
      setSavingMetadata(false);
    }
  }

  function toggleTask(taskId: string) {
    setStagedCompletedTaskIds((previous) =>
      previous.includes(taskId)
        ? previous.filter((item) => item !== taskId)
        : [...previous, taskId]
    );
  }

  if (!isUserAdmin) {
    return (
      <div className="text-center py-20">
        <p className="text-gray-500">{language === "zh" ? "无权限访问此页面" : "Access denied"}</p>
        <Link href="/admin" className="text-blue-600 hover:underline mt-4 inline-block">
          {language === "zh" ? "返回后台" : "Back to admin"}
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="space-y-2">
          <Link href="/admin" className="text-sm text-blue-600 hover:underline">
            {language === "zh" ? "返回管理后台" : "Back to admin"}
          </Link>
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
              {language === "zh" ? "IB 学习助手工作台" : "IB Study Assistant Workspace"}
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              {language === "zh"
                ? "把试卷上传、弱项分析、学习计划、资料推荐和执行监督收进一个后台页面里，先用数理化已导入的数据验证完整闭环。"
                : "Run uploads, diagnosis, planning, material recommendation, and execution supervision in one admin workspace while the STEM dataset is already live."}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 text-sm">
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <div className="text-slate-500">{language === "zh" ? "已上传试卷" : "Uploaded Exams"}</div>
            <div className="mt-2 text-2xl font-semibold text-slate-900">{exams.length}</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <div className="text-slate-500">{language === "zh" ? "当前计划" : "Active Plan"}</div>
            <div className="mt-2 text-2xl font-semibold text-slate-900">{activePlan ? 1 : 0}</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <div className="text-slate-500">{language === "zh" ? "推荐资料" : "Recommended Materials"}</div>
            <div className="mt-2 text-2xl font-semibold text-slate-900">
              {latestAnalysis?.recommendedMaterials?.length || 0}
            </div>
          </div>
        </div>
      </div>

      {(statusMessage || errorMessage) && (
        <div
          className={`rounded-2xl border px-4 py-3 text-sm shadow-sm ${
            errorMessage
              ? "border-rose-200 bg-rose-50 text-rose-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-700"
          }`}
        >
          {errorMessage || statusMessage}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="space-y-6">
          <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-5">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-teal-600">
                {language === "zh" ? "上传入口" : "Upload Intake"}
              </p>
              <h2 className="mt-2 text-xl font-semibold text-slate-900">
                {language === "zh" ? "新建试卷分析" : "Create Exam Analysis"}
              </h2>
            </div>

            <form className="space-y-4" onSubmit={handleUpload}>
              <input
                value={uploadForm.title}
                onChange={(event) => setUploadForm((previous) => ({ ...previous, title: event.target.value }))}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-teal-400 focus:bg-white"
                placeholder={language === "zh" ? "试卷标题（可选，留空自动识别）" : "Exam title (optional, auto-detect if blank)"}
              />

              <div className="grid grid-cols-2 gap-3">
                <select
                  value={uploadForm.subject}
                  onChange={(event) => setUploadForm((previous) => ({ ...previous, subject: event.target.value }))}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-teal-400 focus:bg-white"
                >
                  {SUBJECT_OPTIONS.map((subject) => (
                    <option key={subject} value={subject}>
                      {subject || (language === "zh" ? "自动识别科目" : "Auto-detect subject")}
                    </option>
                  ))}
                </select>
                <select
                  value={uploadForm.grade}
                  onChange={(event) => setUploadForm((previous) => ({ ...previous, grade: event.target.value }))}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-teal-400 focus:bg-white"
                >
                  {GRADE_OPTIONS.map((grade) => (
                    <option key={grade} value={grade}>
                      {grade || (language === "zh" ? "自动识别层级" : "Auto-detect level")}
                    </option>
                  ))}
                </select>
              </div>

              <input
                type="date"
                value={uploadForm.examDate}
                onChange={(event) => setUploadForm((previous) => ({ ...previous, examDate: event.target.value }))}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-teal-400 focus:bg-white"
              />

              <input
                value={uploadForm.tags}
                onChange={(event) => setUploadForm((previous) => ({ ...previous, tags: event.target.value }))}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-teal-400 focus:bg-white"
                placeholder={language === "zh" ? "标签，例如：微积分, 力学" : "Tags, e.g. calculus, mechanics"}
              />

              <label className="flex cursor-pointer flex-col items-center justify-center rounded-[24px] border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center transition hover:border-teal-400 hover:bg-teal-50/40">
                <span className="text-sm font-medium text-slate-700">
                  {selectedFile
                    ? selectedFile.name
                    : language === "zh"
                      ? "点击选择图片或 PDF"
                      : "Choose an image or PDF"}
                </span>
                <input
                  type="file"
                  accept="image/*,.pdf"
                  className="hidden"
                  onChange={(event) => setSelectedFile(event.target.files?.[0] || null)}
                />
              </label>

              <textarea
                rows={5}
                value={uploadForm.paperText}
                onChange={(event) => setUploadForm((previous) => ({ ...previous, paperText: event.target.value }))}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-teal-400 focus:bg-white"
                placeholder={
                  language === "zh"
                    ? "如果已经有 OCR 文本、老师批注或题目摘录，也可以直接贴进来。"
                    : "Paste OCR text, teacher notes, or question excerpts here if available."
                }
              />

              <label className="flex items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={uploadForm.autoAnalyze}
                  onChange={(event) => setUploadForm((previous) => ({ ...previous, autoAnalyze: event.target.checked }))}
                />
                <span>{language === "zh" ? "上传成功后自动分析" : "Automatically analyze after upload"}</span>
              </label>

              <button
                type="submit"
                disabled={uploading || (!selectedFile && !uploadForm.paperText.trim())}
                className="w-full rounded-full bg-slate-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {uploading
                  ? language === "zh"
                    ? "正在上传并解析..."
                    : "Uploading and parsing..."
                  : language === "zh"
                    ? "上传到 AI 助手"
                    : "Upload to Assistant"}
              </button>
            </form>
          </section>

          <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">
                {language === "zh" ? "最近上传" : "Recent Uploads"}
              </h2>
              <button onClick={() => void loadExams()} className="text-sm text-teal-600 hover:text-teal-700">
                {language === "zh" ? "刷新" : "Refresh"}
              </button>
            </div>

            <div className="space-y-3">
              {loadingExams ? (
                <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
                  {language === "zh" ? "加载试卷中..." : "Loading exams..."}
                </div>
              ) : exams.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
                  {language === "zh" ? "还没有上传试卷" : "No uploaded exams yet"}
                </div>
              ) : (
                exams.map((exam) => (
                  <button
                    key={exam.id}
                    onClick={() => setSelectedExamId(exam.id)}
                    className={`w-full rounded-[24px] border px-4 py-4 text-left transition ${
                      selectedExamId === exam.id
                        ? "border-teal-300 bg-teal-50 shadow-sm"
                        : "border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-white"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate text-sm font-medium text-slate-900">{exam.title}</h3>
                        <p className="mt-1 text-xs text-slate-500">{exam.subject} · {exam.grade || "-"}</p>
                      </div>
                      <span className={`shrink-0 rounded-full px-2 py-1 text-[11px] ${ocrStatusTone(exam.ocrStatus)}`}>
                        {exam.ocrStatus}
                      </span>
                    </div>
                    <div className="mt-3 text-[11px] text-slate-500">{formatDate(exam.createdAt, locale)}</div>
                  </button>
                ))
              )}
            </div>
          </section>
        </aside>

        <main className="space-y-6">
          {!selectedExamId ? (
            <section className="flex min-h-[520px] items-center justify-center rounded-[32px] border border-dashed border-slate-300 bg-white px-6 py-12 text-center shadow-sm">
              <div className="max-w-xl space-y-4">
                <h2 className="text-2xl font-semibold text-slate-900">
                  {language === "zh" ? "先上传一份试卷，助手才有证据开始分析" : "Upload a paper first so the assistant has evidence to analyze"}
                </h2>
                <p className="text-sm leading-7 text-slate-500">
                  {language === "zh"
                    ? "建议先用带学生作答和老师批注的图片试卷来测试，最容易看出弱项和计划效果。"
                    : "Start with an answer-sheet image that includes student work and teacher marks for the clearest diagnosis."}
                </p>
              </div>
            </section>
          ) : loadingDetail ? (
            <section className="rounded-[32px] border border-slate-200 bg-white px-6 py-12 text-center text-sm text-slate-500 shadow-sm">
              {language === "zh" ? "正在加载试卷工作区..." : "Loading exam workspace..."}
            </section>
          ) : examDetail ? (
            <>
              <section className="overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-100 px-6 py-5">
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-3 py-1 text-xs ${ocrStatusTone(examDetail.exam.ocrStatus)}`}>
                          {examDetail.exam.ocrStatus}
                        </span>
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">
                          {examDetail.exam.subject}
                        </span>
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">
                          {examDetail.exam.grade || "-"}
                        </span>
                      </div>
                      <h2 className="mt-4 text-2xl font-semibold text-slate-900">{examDetail.exam.title}</h2>
                      <p className="mt-2 text-sm text-slate-500">
                        {language === "zh" ? "考试时间" : "Exam Date"}: {formatDate(examDetail.exam.examDate, locale)}
                      </p>
                    </div>
                    <button
                      onClick={() => void handleAnalyze()}
                      disabled={analyzing || examDetail.exam.ocrStatus === "pending" || metadataNeedsReview}
                      className="rounded-full bg-teal-600 px-5 py-3 text-sm font-medium text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {analyzing
                        ? language === "zh"
                          ? "分析中..."
                          : "Analyzing..."
                        : language === "zh"
                          ? "重新分析"
                          : "Analyze Again"}
                    </button>
                  </div>
                </div>

                {metadataNeedsReview && (
                  <form
                    onSubmit={handleMetadataSave}
                    className="border-b border-amber-100 bg-amber-50/70 px-6 py-5"
                  >
                    <div className="mb-4">
                      <h3 className="text-sm font-semibold text-amber-900">
                        {language === "zh" ? "需要补充试卷信息" : "Confirm exam metadata"}
                      </h3>
                      <p className="mt-1 text-sm leading-6 text-amber-800">
                        {language === "zh"
                          ? "这张截图可能是局部题目，AI 没有足够把握判断科目或 HL/SL。补充后再分析，可以避免推荐资料跑偏。"
                          : "This may be a partial screenshot, so the assistant is not confident about the subject or HL/SL. Confirming it first keeps retrieval accurate."}
                      </p>
                    </div>

                    <div className="grid gap-3 md:grid-cols-[1fr_180px_140px_auto]">
                      <input
                        value={metadataDraft.title}
                        onChange={(event) =>
                          setMetadataDraft((previous) => ({ ...previous, title: event.target.value }))
                        }
                        className="rounded-2xl border border-amber-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-amber-400"
                        placeholder={language === "zh" ? "试卷标题，可选" : "Exam title, optional"}
                      />
                      <select
                        value={metadataDraft.subject}
                        onChange={(event) =>
                          setMetadataDraft((previous) => ({ ...previous, subject: event.target.value }))
                        }
                        className="rounded-2xl border border-amber-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-amber-400"
                        required
                      >
                        {SUBJECT_OPTIONS.map((subject) => (
                          <option key={subject} value={subject}>
                            {subject || (language === "zh" ? "选择科目" : "Choose subject")}
                          </option>
                        ))}
                      </select>
                      <select
                        value={metadataDraft.grade}
                        onChange={(event) =>
                          setMetadataDraft((previous) => ({ ...previous, grade: event.target.value }))
                        }
                        className="rounded-2xl border border-amber-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-amber-400"
                        required
                      >
                        {GRADE_OPTIONS.map((grade) => (
                          <option key={grade} value={grade}>
                            {grade || (language === "zh" ? "选择层级" : "Choose level")}
                          </option>
                        ))}
                      </select>
                      <button
                        type="submit"
                        disabled={savingMetadata}
                        className="rounded-full bg-amber-500 px-5 py-3 text-sm font-medium text-white transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {savingMetadata
                          ? language === "zh"
                            ? "保存中..."
                            : "Saving..."
                          : language === "zh"
                            ? "保存"
                            : "Save"}
                      </button>
                    </div>
                  </form>
                )}

                <div className="grid gap-4 border-b border-slate-100 px-6 py-5 md:grid-cols-4">
                  <div>
                    <div className="text-xs uppercase tracking-[0.2em] text-slate-400">{language === "zh" ? "题目数" : "Questions"}</div>
                    <div className="mt-2 text-2xl font-semibold text-slate-900">
                      {latestAnalysis?.scoreSummary?.totalQuestions ?? examDetail.exam.questions.length}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-[0.2em] text-slate-400">{language === "zh" ? "错题/失分点" : "Missed Items"}</div>
                    <div className="mt-2 text-2xl font-semibold text-slate-900">{latestAnalysis?.scoreSummary?.wrongQuestions ?? "-"}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-[0.2em] text-slate-400">{language === "zh" ? "准确率" : "Accuracy"}</div>
                    <div className="mt-2 text-2xl font-semibold text-slate-900">
                      {latestAnalysis?.scoreSummary?.accuracyRate !== undefined && latestAnalysis?.scoreSummary?.accuracyRate !== null
                        ? `${Math.round((latestAnalysis.scoreSummary.accuracyRate || 0) * 100)}%`
                        : "-"}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-[0.2em] text-slate-400">{language === "zh" ? "分析模式" : "Analysis Mode"}</div>
                    <div className="mt-2 text-2xl font-semibold text-slate-900">{latestAnalysis?.analysisMode || "-"}</div>
                  </div>
                </div>

                <div className="px-6 py-5">
                  <h3 className="text-sm font-semibold text-slate-900">{language === "zh" ? "原始证据" : "Raw Evidence"}</h3>
                  <p className="mt-2 line-clamp-6 whitespace-pre-wrap text-sm leading-7 text-slate-600">
                    {examDetail.exam.rawText || (language === "zh" ? "当前还没有可展示的文本证据。" : "No extracted text is available yet.")}
                  </p>
                </div>
              </section>

              <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
                <div className="space-y-6">
                  <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-rose-500">
                      {language === "zh" ? "弱项诊断" : "Weakness Diagnosis"}
                    </p>
                    <h3 className="mt-2 text-xl font-semibold text-slate-900">
                      {language === "zh" ? "AI 判断出的重点突破口" : "The key pressure points identified by the assistant"}
                    </h3>

                    {latestAnalysis ? (
                      <div className="mt-5 space-y-4">
                        <div className="rounded-[24px] bg-slate-50 px-5 py-4 text-sm leading-7 text-slate-700">
                          {latestAnalysis.overview}
                        </div>

                        {latestAnalysis.weaknesses.map((weakness, index) => (
                          <div key={`${weakness.topic}-${index}`} className="rounded-[24px] border border-slate-200 px-5 py-4">
                            <div className="flex flex-wrap items-center gap-3">
                              <h4 className="text-base font-semibold text-slate-900">{weakness.topic}</h4>
                              <span className={`rounded-full px-3 py-1 text-xs ${severityTone(weakness.severity)}`}>
                                {weakness.severity}
                              </span>
                              <span className="text-xs text-slate-400">
                                {language === "zh" ? "置信度" : "Confidence"} {Math.round((weakness.confidence || 0) * 100)}%
                              </span>
                            </div>
                            <p className="mt-3 text-sm leading-7 text-slate-600">{weakness.reason}</p>
                            {weakness.evidence.length > 0 && (
                              <div className="mt-4 space-y-2">
                                {weakness.evidence.map((evidence, evidenceIndex) => (
                                  <div key={`${weakness.topic}-evidence-${evidenceIndex}`} className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
                                    {evidence}
                                  </div>
                                ))}
                              </div>
                            )}
                            <div className="mt-4 rounded-2xl bg-teal-50 px-4 py-3 text-sm text-teal-700">
                              {language === "zh" ? "建议聚焦：" : "Recommended focus:"} {weakness.recommendedFocus}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="mt-5 rounded-[24px] border border-dashed border-slate-200 px-5 py-10 text-center text-sm text-slate-500">
                        {examDetail.exam.ocrStatus === "pending"
                          ? language === "zh"
                            ? "这份试卷还在等待 OCR / 解析完成，先补图片或文本再分析。"
                            : "This exam is still waiting for OCR/parsing. Add image evidence or text, then analyze."
                          : language === "zh"
                            ? "还没有分析结果，点击上方按钮开始。"
                            : "No analysis yet. Start from the button above."}
                      </div>
                    )}
                  </section>

                  <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-indigo-500">
                      {language === "zh" ? "学习计划" : "Learning Plan"}
                    </p>
                    <div className="mt-2 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                      <div>
                        <h3 className="text-xl font-semibold text-slate-900">
                          {activePlan?.title || (language === "zh" ? "等待生成学习计划" : "Waiting for a study plan")}
                        </h3>
                        {activePlan && (
                          <p className="mt-2 text-sm text-slate-500">
                            {language === "zh"
                              ? `${activePlan.horizonDays} 天周期 · 每天 ${activePlan.dailyMinutes} 分钟`
                              : `${activePlan.horizonDays}-day horizon · ${activePlan.dailyMinutes} minutes per day`}
                          </p>
                        )}
                      </div>
                      {progressSummary && (
                        <div className="rounded-2xl bg-slate-900 px-4 py-3 text-white">
                          <div className="text-xs uppercase tracking-[0.24em] text-white/60">
                            {language === "zh" ? "完成度" : "Progress"}
                          </div>
                          <div className="mt-2 text-2xl font-semibold">{progressSummary.completionRate}%</div>
                        </div>
                      )}
                    </div>

                    {activePlan ? (
                      <div className="mt-5 space-y-5">
                        {activePlan.goals.length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {activePlan.goals.map((goal, index) => (
                              <span key={`${goal}-${index}`} className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">
                                {goal}
                              </span>
                            ))}
                          </div>
                        )}

                        <div className="space-y-3">
                          {activePlan.tasks.map((task) => {
                            const completed = stagedCompletedTaskIds.includes(task.taskId);

                            return (
                              <label
                                key={task.taskId}
                                className={`flex cursor-pointer gap-4 rounded-[24px] border px-4 py-4 transition ${
                                  completed ? "border-emerald-300 bg-emerald-50" : "border-slate-200 bg-slate-50 hover:border-slate-300"
                                }`}
                              >
                                <input type="checkbox" checked={completed} onChange={() => toggleTask(task.taskId)} className="mt-1" />
                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="rounded-full bg-white px-3 py-1 text-xs text-slate-600">
                                      {language === "zh" ? `第 ${task.day} 天` : `Day ${task.day}`}
                                    </span>
                                    <span className="rounded-full bg-white px-3 py-1 text-xs text-slate-600">
                                      {taskTypeLabel(task.type, language)}
                                    </span>
                                    <span className="text-xs text-slate-400">{task.minutes} min</span>
                                  </div>
                                  <h4 className="mt-3 text-sm font-semibold text-slate-900">{task.title}</h4>
                                  {task.focusTopics.length > 0 && (
                                    <p className="mt-2 text-sm text-slate-500">{task.focusTopics.join(" · ")}</p>
                                  )}
                                  <p className="mt-3 text-sm leading-6 text-slate-600">{task.successCriteria}</p>
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <div className="mt-5 rounded-[24px] border border-dashed border-slate-200 px-5 py-10 text-center text-sm text-slate-500">
                        {language === "zh" ? "分析完成后，这里会生成分日计划和检查点。" : "The day-by-day plan appears here after analysis."}
                      </div>
                    )}
                  </section>
                </div>

                <div className="space-y-6">
                  <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-500">
                      {language === "zh" ? "资料推荐" : "Material Recommendations"}
                    </p>
                    <h3 className="mt-2 text-xl font-semibold text-slate-900">
                      {language === "zh" ? "与弱项直接关联的内容" : "Content tied directly to the diagnosed gaps"}
                    </h3>

                    <div className="mt-5 space-y-4">
                      {latestAnalysis?.recommendedMaterials?.length ? (
                        latestAnalysis.recommendedMaterials.map((material, index) => (
                          <div key={`${material.title}-${index}`} className="rounded-[24px] border border-slate-200 px-4 py-4">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <h4 className="text-sm font-semibold text-slate-900">{material.title}</h4>
                                <p className="mt-1 text-xs uppercase tracking-[0.2em] text-slate-400">{material.materialType}</p>
                              </div>
                              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">{material.score}</span>
                            </div>
                            <p className="mt-3 text-sm leading-6 text-slate-600">{material.reason}</p>
                            {material.topics.length > 0 && (
                              <div className="mt-3 flex flex-wrap gap-2">
                                {material.topics.map((topic, topicIndex) => (
                                  <span key={`${topic}-${topicIndex}`} className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">
                                    {topic}
                                  </span>
                                ))}
                              </div>
                            )}
                            {material.url ? (
                              <a href={material.url} target="_blank" rel="noreferrer" className="mt-4 inline-flex text-sm font-medium text-teal-600 hover:text-teal-700">
                                {language === "zh" ? "打开资料" : "Open Material"}
                              </a>
                            ) : null}
                          </div>
                        ))
                      ) : (
                        <div className="rounded-[24px] border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
                          {language === "zh" ? "暂时还没有推荐资料。" : "No recommendations yet."}
                        </div>
                      )}
                    </div>
                  </section>

                  <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-500">
                      {language === "zh" ? "执行监督" : "Execution Supervision"}
                    </p>
                    <h3 className="mt-2 text-xl font-semibold text-slate-900">
                      {language === "zh" ? "学习打卡与跟进反馈" : "Check-ins and follow-up coaching"}
                    </h3>

                    {activePlan ? (
                      <form className="mt-5 space-y-4" onSubmit={handleCheckIn}>
                        <input
                          type="number"
                          min="0"
                          value={minutesStudied}
                          onChange={(event) => setMinutesStudied(event.target.value)}
                          className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-amber-400 focus:bg-white"
                          placeholder={language === "zh" ? "学习时长（分钟）" : "Minutes studied"}
                        />
                        <textarea
                          rows={3}
                          value={blockersInput}
                          onChange={(event) => setBlockersInput(event.target.value)}
                          className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-amber-400 focus:bg-white"
                          placeholder={language === "zh" ? "阻碍因素，每行一条" : "Blockers, one per line"}
                        />
                        <textarea
                          rows={4}
                          value={reflection}
                          onChange={(event) => setReflection(event.target.value)}
                          className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-amber-400 focus:bg-white"
                          placeholder={language === "zh" ? "今天的学习反思" : "Reflection"}
                        />
                        <button
                          type="submit"
                          disabled={submittingCheckIn}
                          className="w-full rounded-full bg-amber-500 px-5 py-3 text-sm font-medium text-white transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {submittingCheckIn
                            ? language === "zh"
                              ? "提交监督反馈中..."
                              : "Submitting..."
                            : language === "zh"
                              ? "提交学习打卡"
                              : "Submit Check-in"}
                        </button>
                      </form>
                    ) : (
                      <div className="mt-5 rounded-[24px] border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
                        {language === "zh" ? "先完成试卷分析，再生成可监督的学习计划。" : "Analyze an exam first so the assistant can generate a plan to supervise."}
                      </div>
                    )}
                  </section>

                  <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                      {language === "zh" ? "检索线索" : "Retrieval Queries"}
                    </p>
                    <div className="mt-4 space-y-3">
                      {latestAnalysis?.recommendedQueries?.length ? (
                        latestAnalysis.recommendedQueries.map((query, index) => (
                          <div key={`${query}-${index}`} className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
                            {query}
                          </div>
                        ))
                      ) : (
                        <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
                          {language === "zh" ? "分析后这里会展示推荐检索词。" : "Suggested retrieval prompts appear here after analysis."}
                        </div>
                      )}
                    </div>
                  </section>
                </div>
              </section>
            </>
          ) : (
            <section className="rounded-[32px] border border-slate-200 bg-white px-6 py-12 text-center text-sm text-slate-500 shadow-sm">
              {language === "zh" ? "试卷详情暂时不可用。" : "Exam detail is temporarily unavailable."}
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
