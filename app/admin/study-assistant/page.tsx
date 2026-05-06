"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/app/context/AuthContext";
import { useLanguage } from "@/app/context/LanguageContext";
import { isAdminUserId } from "@/lib/admin-auth";
import { getPublicMaterialUrl } from "@/lib/study-material-links";

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
  chunkId?: string;
  title: string;
  url: string;
  materialType: string;
  reason: string;
  topics: string[];
  score: number;
  sourceTitle?: string;
  questionRef?: string;
  excerpt?: string;
  actionLabel?: string;
  estimatedMinutes?: number;
  sourceType?: string;
  workflowSteps?: string[];
  expectedOutcome?: string;
  pairedMarkschemeTitle?: string;
  pairedMarkschemeChunkId?: string;
};

type StudyStandardizedGoal = {
  test: string;
  currentScore: string;
  targetScore: string;
  examDate: string;
  priority: string;
};

type StudyPlanningProfile = {
  subjectStrengths: string[];
  subjectWeaknesses: string[];
  standardizedGoals: StudyStandardizedGoal[];
  targetMajors: string[];
  activityThemes: string[];
  apFocuses: string[];
  notes: string;
};

type StudyPlanTableRow = {
  category: string;
  item: string;
  currentState: string;
  targetState: string;
  nextAction: string;
  cadence: string;
  priority: string;
};

type StudyPlanTask = {
  taskId: string;
  day: number;
  title: string;
  type: "review" | "practice" | "revision" | "reflection";
  minutes: number;
  focusTopics: string[];
  successCriteria: string;
  instructions?: string[];
  deliverable?: string;
  practiceItems?: string[];
  linkedMaterialTitles?: string[];
  linkedMaterialChunkIds?: string[];
  linkedMaterialIds?: string[];
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
  strategicOverview?: string;
  planTable: StudyPlanTableRow[];
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
    planningProfile?: StudyPlanningProfile;
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
  subjectStrengths: string;
  subjectWeaknesses: string;
  standardizedGoals: string;
  targetMajors: string;
  activityThemes: string;
  apFocuses: string;
  plannerNotes: string;
  paperText: string;
  autoAnalyze: boolean;
};

type ImageQualityLevel = "good" | "warn" | "bad";

type ImageQualityReport = {
  fileName: string;
  originalFileName?: string;
  splitFrom?: string;
  cropRegion?: "left" | "right";
  width: number;
  height: number;
  megapixels: number;
  brightness: number;
  contrast: number;
  sharpness: number;
  level: ImageQualityLevel;
  warnings: string[];
  processed: boolean;
};

type MetadataDraft = {
  title: string;
  subject: string;
  grade: string;
};

type AssistantRunPhase = "idle" | "uploading" | "opening" | "analyzing" | "finalizing";

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
  subjectStrengths: "",
  subjectWeaknesses: "",
  standardizedGoals: "",
  targetMajors: "",
  activityThemes: "",
  apFocuses: "",
  plannerNotes: "",
  paperText: "",
  autoAnalyze: true,
};

const IMAGE_QUALITY_SAMPLE_EDGE = 480;
const IMAGE_PREPROCESS_MAX_EDGE = 2400;
const IMAGE_AUTO_SPLIT_ASPECT_RATIO = 1.55;
const IMAGE_AUTO_SPLIT_OVERLAP_RATIO = 0.04;

function isPdfUploadFile(file: File): boolean {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

function isImageUploadFile(file: File): boolean {
  return (file.type || "").startsWith("image/");
}

function loadUploadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Unable to read image: ${file.name}`));
    };
    image.src = url;
  });
}

function buildPreparedImageFileName(sourceFile: File, suffix: string): string {
  const baseName = sourceFile.name.replace(/\.[^.]+$/i, "");
  return `${baseName}.${suffix}.jpg`;
}

function canvasToJpegFile(canvas: HTMLCanvasElement, sourceFile: File, suffix = "ocr"): Promise<File> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error(`Unable to prepare image: ${sourceFile.name}`));
          return;
        }

        resolve(
          new File([blob], buildPreparedImageFileName(sourceFile, suffix), {
            type: "image/jpeg",
            lastModified: sourceFile.lastModified || Date.now(),
          })
        );
      },
      "image/jpeg",
      0.9
    );
  });
}

function buildImageQualityReport(
  fileName: string,
  width: number,
  height: number,
  luminance: number[],
  processed: boolean
): ImageQualityReport {
  const count = Math.max(1, luminance.length);
  const brightness = luminance.reduce((sum, value) => sum + value, 0) / count;
  const variance =
    luminance.reduce((sum, value) => sum + (value - brightness) ** 2, 0) / count;
  const contrast = Math.sqrt(variance);
  const sampleWidth = Math.max(1, Math.round(Math.sqrt(count)));
  let edgeDiff = 0;
  let edgeCount = 0;

  for (let index = 1; index < luminance.length; index += 1) {
    if (index % sampleWidth !== 0) {
      edgeDiff += Math.abs(luminance[index] - luminance[index - 1]);
      edgeCount += 1;
    }
    if (index >= sampleWidth) {
      edgeDiff += Math.abs(luminance[index] - luminance[index - sampleWidth]);
      edgeCount += 1;
    }
  }

  const sharpness = edgeCount > 0 ? edgeDiff / edgeCount : 0;
  const megapixels = (width * height) / 1_000_000;
  const warnings: string[] = [];
  const minDimension = Math.min(width, height);
  const aspectRatio = Math.max(width, height) / Math.max(1, minDimension);

  if (minDimension < 900 || megapixels < 1.2) {
    warnings.push("图片分辨率偏低，建议一页一张靠近重拍。");
  }
  if (brightness < 65) {
    warnings.push("画面偏暗，建议补光后重拍。");
  }
  if (brightness > 220) {
    warnings.push("画面可能过曝或反光，建议避开强光。");
  }
  if (contrast < 28) {
    warnings.push("文字和纸面反差偏低，建议提高对焦和光线。");
  }
  if (sharpness < 8) {
    warnings.push("画面可能有模糊或抖动，建议对焦后再拍。");
  }
  if (aspectRatio > 1.65) {
    warnings.push("画面过宽，疑似两页同拍；建议拆成一页一张。");
  }

  const level: ImageQualityLevel =
    warnings.length >= 3 || minDimension < 700 ? "bad" : warnings.length > 0 ? "warn" : "good";

  return {
    fileName,
    width,
    height,
    megapixels: Number(megapixels.toFixed(2)),
    brightness: Number(brightness.toFixed(1)),
    contrast: Number(contrast.toFixed(1)),
    sharpness: Number(sharpness.toFixed(1)),
    level,
    warnings,
    processed,
  };
}

async function analyzeUploadImageQuality(file: File, processed = false): Promise<ImageQualityReport> {
  const image = await loadUploadImage(file);
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  const scale = Math.min(1, IMAGE_QUALITY_SAMPLE_EDGE / Math.max(width, height));
  const sampleWidth = Math.max(1, Math.round(width * scale));
  const sampleHeight = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = sampleWidth;
  canvas.height = sampleHeight;
  const context = canvas.getContext("2d", { willReadFrequently: true });

  if (!context) {
    throw new Error(`Unable to inspect image: ${file.name}`);
  }

  context.drawImage(image, 0, 0, sampleWidth, sampleHeight);
  const imageData = context.getImageData(0, 0, sampleWidth, sampleHeight).data;
  const luminance: number[] = [];

  for (let index = 0; index < imageData.length; index += 4) {
    luminance.push(imageData[index] * 0.299 + imageData[index + 1] * 0.587 + imageData[index + 2] * 0.114);
  }

  return buildImageQualityReport(file.name, width, height, luminance, processed);
}

async function preprocessUploadImage(file: File): Promise<File> {
  const image = await loadUploadImage(file);
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  const scale = Math.min(1, IMAGE_PREPROCESS_MAX_EDGE / Math.max(width, height));
  const targetWidth = Math.max(1, Math.round(width * scale));
  const targetHeight = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const context = canvas.getContext("2d", { willReadFrequently: true });

  if (!context) {
    return file;
  }

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, targetWidth, targetHeight);
  context.drawImage(image, 0, 0, targetWidth, targetHeight);

  const imageData = context.getImageData(0, 0, targetWidth, targetHeight);
  const data = imageData.data;
  const contrast = 1.12;
  const bias = 6;

  for (let index = 0; index < data.length; index += 4) {
    data[index] = Math.max(0, Math.min(255, 128 + (data[index] - 128) * contrast + bias));
    data[index + 1] = Math.max(0, Math.min(255, 128 + (data[index + 1] - 128) * contrast + bias));
    data[index + 2] = Math.max(0, Math.min(255, 128 + (data[index + 2] - 128) * contrast + bias));
  }

  context.putImageData(imageData, 0, 0);
  return canvasToJpegFile(canvas, file);
}

function shouldAutoSplitImage(report: ImageQualityReport): boolean {
  const aspectRatio = Math.max(report.width, report.height) / Math.max(1, Math.min(report.width, report.height));

  return (
    report.width > report.height &&
    report.width >= 1400 &&
    report.height >= 700 &&
    aspectRatio >= IMAGE_AUTO_SPLIT_ASPECT_RATIO
  );
}

async function cropUploadImageSide(file: File, side: "left" | "right"): Promise<File> {
  const image = await loadUploadImage(file);
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  const overlap = Math.round(width * IMAGE_AUTO_SPLIT_OVERLAP_RATIO);
  const halfWidth = Math.round(width / 2);
  const cropX = side === "left" ? 0 : Math.max(0, halfWidth - overlap);
  const cropWidth =
    side === "left"
      ? Math.min(width, halfWidth + overlap)
      : Math.max(1, width - cropX);
  const canvas = document.createElement("canvas");
  canvas.width = cropWidth;
  canvas.height = height;
  const context = canvas.getContext("2d");

  if (!context) {
    return file;
  }

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, cropWidth, height);
  context.drawImage(image, cropX, 0, cropWidth, height, 0, 0, cropWidth, height);

  return canvasToJpegFile(canvas, file, side === "left" ? "left-page" : "right-page");
}

async function prepareUploadImages(files: File[]): Promise<{
  files: File[];
  reports: ImageQualityReport[];
}> {
  const reports: ImageQualityReport[] = [];
  const processedFiles: File[] = [];
  const yieldToBrowser = () =>
    new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));

  for (const file of files) {
    const report = await analyzeUploadImageQuality(file);
    await yieldToBrowser();
    const candidates = shouldAutoSplitImage(report)
      ? [
          { file: await cropUploadImageSide(file, "left"), cropRegion: "left" as const },
          { file: await cropUploadImageSide(file, "right"), cropRegion: "right" as const },
        ]
      : [{ file, cropRegion: undefined }];

    for (const candidate of candidates) {
      await yieldToBrowser();
      const candidateReport =
        candidate.file === file
          ? report
          : await analyzeUploadImageQuality(candidate.file);
      const processedFile = await preprocessUploadImage(candidate.file);
      processedFiles.push(processedFile);
      reports.push({
        ...candidateReport,
        fileName: processedFile.name || candidateReport.fileName,
        originalFileName: file.name,
        splitFrom: candidate.cropRegion ? file.name : undefined,
        cropRegion: candidate.cropRegion,
        warnings: candidate.cropRegion
          ? [
              ...candidateReport.warnings,
              `系统已从原图自动切出${candidate.cropRegion === "left" ? "左" : "右"}半页，识别时按单页处理。`,
            ]
          : candidateReport.warnings,
        processed: true,
      });
    }
  }

  return {
    files: processedFiles,
    reports,
  };
}

function formatElapsed(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remain = seconds % 60;
  return `${minutes}:${String(remain).padStart(2, "0")}`;
}

function formatStudyAccuracy(value: number | null | undefined, language: string): string {
  if (value === null || value === undefined) {
    return "-";
  }

  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    return language === "zh" ? "需确认" : "Review";
  }

  return `${Math.round(value * 100)}%`;
}

function formatMissedItems(analysis: StudyAnalysisRecord | null): string {
  if (!analysis) {
    return "-";
  }

  const wrongQuestions = analysis.scoreSummary?.wrongQuestions;
  const weaknessCount = analysis.weaknesses?.length || 0;
  const safeWrongQuestions =
    typeof wrongQuestions === "number" && Number.isFinite(wrongQuestions) && wrongQuestions > 0
      ? wrongQuestions
      : 0;
  const missedItems = Math.max(safeWrongQuestions, weaknessCount);

  return missedItems > 0 ? String(missedItems) : "-";
}

function estimateUploadPhaseSeconds(fileCount: number): { min: number; max: number } {
  const normalizedCount = Math.max(1, fileCount || 1);
  const min = 35 + normalizedCount * 18;
  const max = 75 + normalizedCount * 35;
  return { min, max };
}

function estimateAnalyzePhaseSeconds(fileCount: number): { min: number; max: number } {
  const normalizedCount = Math.max(1, fileCount || 1);
  const min = 45 + normalizedCount * 20;
  const max = 90 + normalizedCount * 36;
  return { min, max };
}

function formatEtaRange(language: string, range: { min: number; max: number }): string {
  const formatSeconds = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remain = seconds % 60;
    if (minutes <= 0) {
      return language === "zh" ? `${remain} 秒` : `${remain}s`;
    }
    if (remain === 0) {
      return language === "zh" ? `${minutes} 分钟` : `${minutes} min`;
    }
    return language === "zh" ? `${minutes} 分 ${remain} 秒` : `${minutes}m ${remain}s`;
  };

  return `${formatSeconds(range.min)} - ${formatSeconds(range.max)}`;
}

function buildRunPhaseCopy(
  language: string,
  phase: AssistantRunPhase,
  elapsedSeconds: number,
  fileCount: number,
  autoAnalyze: boolean
) {
  const parsingActive = phase === "uploading" && elapsedSeconds >= 8;
  const uploadEta = formatEtaRange(language, estimateUploadPhaseSeconds(fileCount));
  const analyzeEta = formatEtaRange(language, estimateAnalyzePhaseSeconds(fileCount));

  if (phase === "uploading") {
    return {
      title:
        language === "zh"
          ? parsingActive
            ? "正在解析试卷内容"
            : "正在上传试卷文件"
          : parsingActive
            ? "Parsing exam evidence"
            : "Uploading exam files",
      description:
        language === "zh"
          ? `已接收 ${fileCount || 1} 个文件，当前会先做 OCR，再抽取学生作答与老师批注。按现在这条链路估算，这一阶段通常需要 ${uploadEta}。`
          : `${fileCount || 1} file(s) received. The assistant is running OCR first, then separating student work from teacher annotations. For this pipeline, this stage usually takes about ${uploadEta}.`,
      progress: parsingActive ? 45 : 20,
      steps:
        language === "zh"
          ? [
              { label: "整理上传文件", state: "done" },
              { label: "发送到服务器", state: parsingActive ? "done" : "active" },
              { label: "逐页 OCR 与批注识别", state: parsingActive ? "active" : "pending" },
              { label: autoAnalyze ? "等待进入 AI 分析" : "等待你确认后分析", state: "pending" },
            ]
          : [
              { label: "Prepare files", state: "done" },
              { label: "Send to server", state: parsingActive ? "done" : "active" },
              { label: "Page OCR and annotation parsing", state: parsingActive ? "active" : "pending" },
              { label: autoAnalyze ? "Wait for AI analysis" : "Wait for your confirmation", state: "pending" },
            ],
    };
  }

  if (phase === "opening") {
    return {
      title: language === "zh" ? "正在整理试卷工作区" : "Preparing the exam workspace",
      description:
        language === "zh"
          ? "OCR 已完成，正在刷新列表并载入这份试卷的详情。"
          : "OCR is done. The assistant is refreshing the list and loading the exam detail.",
      progress: 65,
      steps:
        language === "zh"
          ? [
              { label: "整理上传文件", state: "done" },
              { label: "逐页 OCR 与批注识别", state: "done" },
              { label: "载入试卷详情", state: "active" },
              { label: autoAnalyze ? "等待 AI 分析" : "等待你确认后分析", state: "pending" },
            ]
          : [
              { label: "Prepare files", state: "done" },
              { label: "Page OCR and annotation parsing", state: "done" },
              { label: "Load exam detail", state: "active" },
              { label: autoAnalyze ? "Wait for AI analysis" : "Wait for your confirmation", state: "pending" },
            ],
    };
  }

  if (phase === "analyzing") {
    return {
      title: language === "zh" ? "AI 正在生成弱项诊断与学习计划" : "AI is generating diagnosis and study plan",
      description:
        language === "zh"
          ? `当前正在结合试卷证据、学生作答和老师批注，生成弱项分析、学习计划和资料推荐。按 ${fileCount || 1} 张图的规模，分析阶段通常还需要 ${analyzeEta}。`
          : `The assistant is using the exam evidence, student work, and teacher annotations to generate the diagnosis, plan, and recommendations. For a ${fileCount || 1}-page upload, this analysis stage usually takes about ${analyzeEta}.`,
      progress: 82,
      steps:
        language === "zh"
          ? [
              { label: "试卷 OCR 完成", state: "done" },
              { label: "抽取题目与证据", state: "done" },
              { label: "生成弱项诊断", state: "active" },
              { label: "输出计划与资料推荐", state: "pending" },
            ]
          : [
              { label: "Exam OCR done", state: "done" },
              { label: "Extract evidence", state: "done" },
              { label: "Generate weakness diagnosis", state: "active" },
              { label: "Produce plan and recommendations", state: "pending" },
            ],
    };
  }

  if (phase === "finalizing") {
    return {
      title: language === "zh" ? "正在完成最后整理" : "Finalizing results",
      description:
        language === "zh"
          ? "结果已经生成，正在刷新页面状态。"
          : "Results are ready. The page is refreshing the final state.",
      progress: 96,
      steps:
        language === "zh"
          ? [
              { label: "试卷 OCR 完成", state: "done" },
              { label: "生成弱项诊断", state: "done" },
              { label: "学习计划已生成", state: "done" },
              { label: "刷新工作台", state: "active" },
            ]
          : [
              { label: "Exam OCR done", state: "done" },
              { label: "Diagnosis generated", state: "done" },
              { label: "Plan generated", state: "done" },
              { label: "Refresh workspace", state: "active" },
            ],
    };
  }

  return null;
}

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

function splitFlexibleList(value: string): string[] {
  return value
    .split(/\n|,|，|;|；/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function parseStandardizedGoalsInput(value: string): StudyStandardizedGoal[] {
  return value
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [test = "", currentScore = "", targetScore = "", examDate = "", priority = "medium"] = line
        .split("|")
        .map((item) => item.trim());

      return {
        test,
        currentScore,
        targetScore,
        examDate,
        priority: priority || "medium",
      } satisfies StudyStandardizedGoal;
    })
    .filter((goal) => goal.test || goal.targetScore);
}

function buildPlanningProfilePayload(form: UploadFormState): StudyPlanningProfile {
  return {
    subjectStrengths: splitFlexibleList(form.subjectStrengths),
    subjectWeaknesses: splitFlexibleList(form.subjectWeaknesses),
    standardizedGoals: parseStandardizedGoalsInput(form.standardizedGoals),
    targetMajors: splitFlexibleList(form.targetMajors),
    activityThemes: splitFlexibleList(form.activityThemes),
    apFocuses: splitFlexibleList(form.apFocuses),
    notes: form.plannerNotes.trim(),
  };
}

function hasPlanningProfile(profile?: StudyPlanningProfile): boolean {
  if (!profile) {
    return false;
  }

  return (
    profile.subjectStrengths.length > 0 ||
    profile.subjectWeaknesses.length > 0 ||
    profile.standardizedGoals.length > 0 ||
    profile.targetMajors.length > 0 ||
    profile.activityThemes.length > 0 ||
    profile.apFocuses.length > 0 ||
    Boolean(profile.notes)
  );
}

function priorityTone(priority: string): string {
  switch (priority) {
    case "high":
      return "bg-rose-100 text-rose-700 border border-rose-200";
    case "low":
      return "bg-sky-100 text-sky-700 border border-sky-200";
    default:
      return "bg-amber-100 text-amber-700 border border-amber-200";
  }
}

function materialTypeLabel(materialType: string, language: string): string {
  if (language !== "zh") {
    return materialType;
  }
  const map: Record<string, string> = {
    PRACTICE_PACK: "练习包",
    PAST_PAPER: "真题",
    MARK_SCHEME: "评分细则",
    VERIFIED_QUESTION: "已审核题目",
    search_query: "检索建议",
    reference: "参考资料",
  };
  return map[materialType] || materialType;
}

function materialLinkUnavailableReason(material: StudyMaterialRecommendation, language: string): string {
  const raw = (material.url || "").trim();
  if (!raw) {
    return language === "zh"
      ? "该资料仅保存了向量片段与元信息，未保存可访问源链接。"
      : "Only chunk metadata is available; no source URL was saved.";
  }
  if (/^[a-z]:\\/i.test(raw) || raw.startsWith("\\\\")) {
    return language === "zh"
      ? "该链接是本地导入路径，服务器端无法直接对外访问。"
      : "This is a local filesystem path and is not externally accessible.";
  }
  if (raw.startsWith("/")) {
    return language === "zh"
      ? "该链接是站内相对路径，但当前没有对应的下载路由。"
      : "This is a relative path without a matching download route.";
  }
  return language === "zh" ? "该链接格式暂不支持直接打开。" : "Unsupported URL format.";
}

function explainMaterialLinkStatus(material: StudyMaterialRecommendation, language: string): string {
  const raw = (material.url || "").trim();
  if (!raw) {
    return language === "zh"
      ? "该资料仅保存了向量片段与元信息，未保存可访问源链接。"
      : "Only chunk metadata is available; no source URL was saved.";
  }
  if (/^[a-z]:\\/i.test(raw) || raw.startsWith("\\\\")) {
    return language === "zh"
      ? "该链接是本地导入路径，服务器端无法直接对外访问。"
      : "This is a local filesystem path and is not externally accessible.";
  }
  if (raw.startsWith("/")) {
    return language === "zh"
      ? "该链接是站内相对路径，但当前没有对应的下载路由。"
      : "This is a relative path without a matching download route.";
  }
  if (!getPublicMaterialUrl(raw)) {
    return language === "zh"
      ? "该资料仅支持站内片段预览，暂无可直接打开的原始资料链接。"
      : "Only the in-app preview is available; no public source link is accessible.";
  }
  return materialLinkUnavailableReason(material, language);
}

function safeFileNamePart(value: string): string {
  return value
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildMaterialPreviewPath(material: StudyMaterialRecommendation): string {
  const params = new URLSearchParams();
  if (material.chunkId) {
    params.set("chunkId", material.chunkId);
  }
  if (material.materialId) {
    params.set("materialId", material.materialId);
  }
  if (material.pairedMarkschemeChunkId) {
    params.set("pairedMarkschemeChunkId", material.pairedMarkschemeChunkId);
  }
  if (material.title) {
    params.set("title", material.title);
  }
  if (material.pairedMarkschemeTitle) {
    params.set("pairedTitle", material.pairedMarkschemeTitle);
  }
  const query = params.toString();
  return query ? `/admin/study-assistant/material-preview?${query}` : "";
}

function buildAbsoluteMaterialPreviewUrl(material: StudyMaterialRecommendation): string {
  const previewPath = buildMaterialPreviewPath(material);
  if (!previewPath || typeof window === "undefined") {
    return previewPath;
  }
  return new URL(previewPath, window.location.origin).toString();
}

function resolveTaskLinkedMaterials(
  task: StudyPlanTask,
  recommendations: StudyMaterialRecommendation[]
): StudyMaterialRecommendation[] {
  if (!recommendations.length) {
    return [];
  }

  const chunkIdSet = new Set((task.linkedMaterialChunkIds || []).map((item) => item.trim()).filter(Boolean));
  const materialIdSet = new Set((task.linkedMaterialIds || []).map((item) => item.trim()).filter(Boolean));
  const titleSet = new Set((task.linkedMaterialTitles || []).map((item) => item.trim()).filter(Boolean));
  const selected: StudyMaterialRecommendation[] = [];
  const seen = new Set<string>();

  const pushUnique = (material: StudyMaterialRecommendation) => {
    const signature = material.chunkId || material.materialId || `${material.title}-${material.sourceTitle || ""}`;
    if (!signature || seen.has(signature)) {
      return;
    }
    seen.add(signature);
    selected.push(material);
  };

  if (chunkIdSet.size > 0) {
    for (const material of recommendations) {
      if (material.chunkId && chunkIdSet.has(material.chunkId)) {
        pushUnique(material);
      }
    }
  }

  if (selected.length === 0 && materialIdSet.size > 0) {
    for (const material of recommendations) {
      if (material.materialId && materialIdSet.has(material.materialId)) {
        pushUnique(material);
      }
    }
  }

  if (selected.length === 0 && titleSet.size > 0) {
    for (const material of recommendations) {
      if (titleSet.has(material.title) || (material.sourceTitle && titleSet.has(material.sourceTitle))) {
        pushUnique(material);
      }
    }
  }

  if (selected.length === 0) {
    const topicTerms = (task.focusTopics || []).map((item) => item.toLowerCase());
    const ranked = recommendations
      .map((material) => {
        const haystack = [material.title, material.reason, ...(material.topics || [])].join(" ").toLowerCase();
        const score = topicTerms.reduce((total, term) => total + (term && haystack.includes(term) ? 1 : 0), 0);
        return { material, score };
      })
      .sort((left, right) => right.score - left.score)
      .map((item) => item.material);
    for (const material of ranked) {
      pushUnique(material);
    }
  }

  return selected.slice(0, 3);
}

function buildInferredPlanningHighlights(
  exam: ExamDetailResponse["exam"] | null,
  analysis: StudyAnalysisRecord | null,
  plan: StudyPlanRecord | null,
  language: string
): string[] {
  const highlights: string[] = [];

  if (exam?.subject) {
    highlights.push(
      language === "zh"
        ? `当前核心学科：${exam.subject}${exam.grade ? ` / ${exam.grade}` : ""}`
        : `Current academic lane: ${exam.subject}${exam.grade ? ` / ${exam.grade}` : ""}`
    );
  }

  if (analysis?.weaknesses?.length) {
    const topWeaknesses = analysis.weaknesses
      .slice(0, 3)
      .map((item) => item.topic)
      .filter(Boolean)
      .join(language === "zh" ? "、" : ", ");

    if (topWeaknesses) {
      highlights.push(
        language === "zh"
          ? `自动识别的当前优先突破口：${topWeaknesses}`
          : `Auto-detected immediate priorities: ${topWeaknesses}`
      );
    }
  }

  if (plan?.strategicOverview) {
    highlights.push(plan.strategicOverview);
  }

  if (plan?.planTable?.length) {
    const topRows = plan.planTable
      .slice(0, 3)
      .map((row) => row.item)
      .filter(Boolean)
      .join(language === "zh" ? "、" : ", ");

    if (topRows) {
      highlights.push(
        language === "zh"
          ? `当前计划已经关联：${topRows}`
          : `Current plan already covers: ${topRows}`
      );
    }
  }

  return highlights;
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
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [imageQualityReports, setImageQualityReports] = useState<ImageQualityReport[]>([]);
  const [preparingImages, setPreparingImages] = useState(false);
  const [stagedCompletedTaskIds, setStagedCompletedTaskIds] = useState<string[]>([]);
  const [minutesStudied, setMinutesStudied] = useState("45");
  const [blockersInput, setBlockersInput] = useState("");
  const [reflection, setReflection] = useState("");
  const [metadataDraft, setMetadataDraft] = useState<MetadataDraft>({
    title: "",
    subject: "",
    grade: "",
  });
  const [showAllTasks, setShowAllTasks] = useState(true);
  const [showWeaknessDetails, setShowWeaknessDetails] = useState(false);
  const [materialViewMode, setMaterialViewMode] = useState<"task" | "all">("task");
  const [savingMetadata, setSavingMetadata] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [runPhase, setRunPhase] = useState<AssistantRunPhase>("idle");
  const [operationStartedAt, setOperationStartedAt] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const activePlan = examDetail?.activePlan || null;
  const latestAnalysis = examDetail?.latestAnalysis || null;
  const examPlanningProfile = examDetail?.exam?.planningProfile;
  const inferredPlanningHighlights = useMemo(
    () => buildInferredPlanningHighlights(examDetail?.exam || null, latestAnalysis, activePlan, language),
    [activePlan, examDetail?.exam, language, latestAnalysis]
  );
  const hasExplicitPlanningProfile = hasPlanningProfile(examPlanningProfile);
  const metadataNeedsReview = needsMetadataReview(examDetail?.exam);
  const runPhaseCopy = useMemo(
    () =>
      buildRunPhaseCopy(
        language,
        runPhase,
        elapsedSeconds,
        selectedFiles.length,
        uploadForm.autoAnalyze
      ),
    [elapsedSeconds, language, runPhase, selectedFiles.length, uploadForm.autoAnalyze]
  );

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

  const orderedPlanTasks = useMemo(() => {
    if (!activePlan?.tasks?.length) {
      return [] as StudyPlanTask[];
    }
    return [...activePlan.tasks].sort((left, right) => left.day - right.day);
  }, [activePlan?.tasks]);

  const currentTask = useMemo(() => {
    if (!orderedPlanTasks.length) {
      return null;
    }
    return orderedPlanTasks.find((task) => !stagedCompletedTaskIds.includes(task.taskId)) || orderedPlanTasks[0];
  }, [orderedPlanTasks, stagedCompletedTaskIds]);

  const currentTaskCompleted = useMemo(() => {
    if (!currentTask) {
      return false;
    }
    return stagedCompletedTaskIds.includes(currentTask.taskId);
  }, [currentTask, stagedCompletedTaskIds]);

  const tasksToRender = useMemo(() => {
    if (!orderedPlanTasks.length) {
      return [] as StudyPlanTask[];
    }
    if (showAllTasks) {
      return orderedPlanTasks;
    }
    const pending = orderedPlanTasks.filter((task) => !stagedCompletedTaskIds.includes(task.taskId));
    if (pending.length > 0) {
      return pending.slice(0, 4);
    }
    return orderedPlanTasks.slice(0, 4);
  }, [orderedPlanTasks, showAllTasks, stagedCompletedTaskIds]);

  const taskLinkedMaterialsMap = useMemo(() => {
    const map = new Map<string, StudyMaterialRecommendation[]>();
    if (!activePlan?.tasks?.length || !latestAnalysis?.recommendedMaterials?.length) {
      return map;
    }
    for (const task of activePlan.tasks) {
      map.set(task.taskId, resolveTaskLinkedMaterials(task, latestAnalysis.recommendedMaterials));
    }
    return map;
  }, [activePlan?.tasks, latestAnalysis?.recommendedMaterials]);

  const currentTaskLinkedMaterials = useMemo(() => {
    if (!currentTask) {
      return [] as StudyMaterialRecommendation[];
    }
    return taskLinkedMaterialsMap.get(currentTask.taskId) || [];
  }, [currentTask, taskLinkedMaterialsMap]);

  const currentTaskPanelMaterials = useMemo(() => {
    if (currentTaskLinkedMaterials.length > 0) {
      return currentTaskLinkedMaterials;
    }
    return (latestAnalysis?.recommendedMaterials || []).slice(0, 3);
  }, [currentTaskLinkedMaterials, latestAnalysis?.recommendedMaterials]);

  const displayedRecommendations = useMemo(() => {
    const all = latestAnalysis?.recommendedMaterials || [];
    if (materialViewMode === "task" && currentTaskLinkedMaterials.length > 0) {
      return currentTaskLinkedMaterials;
    }
    return all;
  }, [currentTaskLinkedMaterials, latestAnalysis?.recommendedMaterials, materialViewMode]);

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
    setShowAllTasks((activePlan?.tasks?.length || 0) <= 14);
    setMaterialViewMode("task");
  }, [activePlan?._id, activePlan?.tasks?.length]);

  useEffect(() => {
    setShowWeaknessDetails(false);
  }, [latestAnalysis?._id]);

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

  useEffect(() => {
    if (runPhase === "idle" || operationStartedAt === null) {
      setElapsedSeconds(0);
      return;
    }

    setElapsedSeconds(Math.max(0, Math.floor((Date.now() - operationStartedAt) / 1000)));
    const timer = window.setInterval(() => {
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - operationStartedAt) / 1000)));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [operationStartedAt, runPhase]);

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
    setRunPhase("uploading");
    setOperationStartedAt(Date.now());
    setStatusMessage("");
    setErrorMessage("");

    try {
      const formData = new FormData();
      const planningProfile = buildPlanningProfilePayload(uploadForm);
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
      formData.append("planningProfile", JSON.stringify(planningProfile));
      if (imageQualityReports.length > 0) {
        formData.append("imageQualityReports", JSON.stringify(imageQualityReports));
      }
      for (const file of selectedFiles) {
        formData.append("paper", file);
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
      setSelectedFiles([]);
      setImageQualityReports([]);
      setRunPhase("opening");
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
        setRunPhase("idle");
        setOperationStartedAt(null);
        setStatusMessage(
          language === "zh"
            ? "试卷已解析，但科目或层级不够确定。请先补充科目/HL-SL，再开始分析。"
            : "The exam was parsed, but subject or level is uncertain. Please confirm the metadata before analysis."
        );
      } else {
        setRunPhase("idle");
        setOperationStartedAt(null);
      }
    } catch (error) {
      console.error("Failed to upload study paper:", error);
      setRunPhase("idle");
      setOperationStartedAt(null);
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

  async function handleFileSelection(event: React.ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const files = Array.from(event.target.files || []);
    const pdfFiles = files.filter(isPdfUploadFile);
    const imageFiles = files.filter(isImageUploadFile);
    setImageQualityReports([]);

    if (pdfFiles.length > 1) {
      setErrorMessage(language === "zh" ? "一次只能上传一个 PDF，或上传多张图片。" : "Upload a single PDF or multiple images.");
      setSelectedFiles([]);
      input.value = "";
      return;
    }

    if (pdfFiles.length === 1 && files.length > 1) {
      setErrorMessage(
        language === "zh"
          ? "PDF 不能和图片混合上传，请上传一个 PDF 或多张图片。"
          : "Do not mix a PDF with images. Upload one PDF or multiple images."
      );
      setSelectedFiles([]);
      input.value = "";
      return;
    }

    if (files.length > 0 && imageFiles.length !== files.length && pdfFiles.length === 0) {
      setErrorMessage(language === "zh" ? "只支持图片或 PDF 文件。" : "Only images or PDF files are supported.");
      setSelectedFiles([]);
      input.value = "";
      return;
    }

    setErrorMessage("");
    if (imageFiles.length === 0) {
      setSelectedFiles(files);
      return;
    }

    setPreparingImages(true);
    setStatusMessage(language === "zh" ? "正在检查并增强图片质量..." : "Checking and enhancing image quality...");
    try {
      const prepared = await prepareUploadImages(imageFiles);
      setSelectedFiles(prepared.files);
      setImageQualityReports(prepared.reports);
      const riskyCount = prepared.reports.filter((report) => report.level !== "good").length;
      const splitCount = prepared.reports.filter((report) => report.splitFrom).length;
      const splitNote =
        splitCount > 0
          ? language === "zh"
            ? `，并自动切出 ${splitCount} 张单页图`
            : ` and auto-split ${splitCount} single-page crops`
          : "";
      setStatusMessage(
        riskyCount > 0
          ? language === "zh"
            ? `已自动增强 ${prepared.files.length} 张图片${splitNote}，其中 ${riskyCount} 张仍有拍照风险；如果结果不准，建议按提示重拍。`
            : `Enhanced ${prepared.files.length} images${splitNote}. ${riskyCount} still have capture risks; retake if results look off.`
          : language === "zh"
            ? `已自动增强 ${prepared.files.length} 张图片${splitNote}，质量看起来可以进入识别。`
            : `Enhanced ${prepared.files.length} images${splitNote}. Quality looks ready for OCR.`
      );
    } catch (error) {
      console.error("Failed to prepare upload images:", error);
      setSelectedFiles([]);
      setImageQualityReports([]);
      input.value = "";
      setErrorMessage(
        error instanceof Error
          ? error.message
          : language === "zh"
            ? "图片预处理失败，请重新选择图片。"
            : "Image preprocessing failed. Please choose the images again."
      );
    } finally {
      setPreparingImages(false);
    }
  }

  async function handleAnalyze(examId = selectedExamId) {
    if (!examId) {
      return;
    }

    setAnalyzing(true);
    setRunPhase("analyzing");
    setOperationStartedAt((previous) => previous ?? Date.now());
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
      setRunPhase("finalizing");
      setStatusMessage(
        language === "zh"
          ? "AI 已完成弱项诊断、学习计划和资料推荐。"
          : "The assistant finished the diagnosis, plan, and material recommendations."
      );
    } catch (error) {
      console.error("Failed to analyze study exam:", error);
      setRunPhase("idle");
      setOperationStartedAt(null);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : language === "zh"
            ? "分析失败"
            : "Analyze failed"
      );
    } finally {
      setAnalyzing(false);
      window.setTimeout(() => {
        setRunPhase("idle");
        setOperationStartedAt(null);
      }, 1200);
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

  function handleCompleteCurrentTask() {
    if (!currentTask) {
      return;
    }
    setStagedCompletedTaskIds((previous) => {
      if (previous.includes(currentTask.taskId)) {
        return previous;
      }
      return [...previous, currentTask.taskId];
    });
    setStatusMessage(
      language === "zh"
        ? `已标记完成：第 ${currentTask.day} 天任务。记得在下方提交打卡保存。`
        : `Marked Day ${currentTask.day} task as complete. Submit a check-in below to save.`
    );
  }

  function handleDownloadCurrentTaskPack() {
    if (!currentTask) {
      setErrorMessage(language === "zh" ? "当前没有可下载的任务包。" : "No task package available.");
      return;
    }
    const examTitle = examDetail?.exam?.title || "study-exam";
    const materials = currentTaskPanelMaterials;
    const now = new Date();
    const instructions = currentTask.instructions?.length
      ? currentTask.instructions
      : [language === "zh" ? "按任务要求完成练习并订正。" : "Complete and review the assigned practice."];
    const generatedAt = now.toLocaleString(language === "zh" ? "zh-CN" : "en-US");
    const materialsHtml =
      materials.length > 0
        ? materials
            .map((material, index) => {
              const externalLink = getPublicMaterialUrl(material.url);
              const previewLink = buildAbsoluteMaterialPreviewUrl(material);
              const actionLinks = [
                previewLink
                  ? `<a href="${escapeHtml(previewLink)}" target="_blank" rel="noreferrer">${language === "zh" ? "站内打开片段" : "Open in app"}</a>`
                  : "",
                externalLink
                  ? `<a href="${escapeHtml(externalLink)}" target="_blank" rel="noreferrer">${language === "zh" ? "打开原资料链接" : "Open source link"}</a>`
                  : "",
              ].filter(Boolean);

              return `
                <section class="material-card">
                  <div class="material-head">
                    <h3>${index + 1}. ${escapeHtml(material.title)}</h3>
                    <span>${escapeHtml(materialTypeLabel(material.materialType, language))}</span>
                  </div>
                  <p><strong>${language === "zh" ? "来源" : "Source"}:</strong> ${escapeHtml(material.sourceTitle || "-")}</p>
                  <p><strong>${language === "zh" ? "题号" : "Question Ref"}:</strong> ${escapeHtml(material.questionRef || "-")}</p>
                  <p><strong>${language === "zh" ? "建议动作" : "Action"}:</strong> ${escapeHtml(material.actionLabel || material.reason || "-")}</p>
                  ${
                    actionLinks.length > 0
                      ? `<div class="action-links">${actionLinks.join("")}</div>`
                      : `<p class="muted">${escapeHtml(explainMaterialLinkStatus(material, language))}</p>`
                  }
                  ${
                    material.excerpt
                      ? `<div class="excerpt"><div class="eyebrow">${language === "zh" ? "片段预览" : "Excerpt"}</div><p>${escapeHtml(material.excerpt)}</p></div>`
                      : ""
                  }
                </section>
              `;
            })
            .join("")
        : `<div class="empty">${language === "zh" ? "暂无可关联资料，建议先完成核心题目再复盘。" : "No linked materials yet."}</div>`;

    const html = `<!DOCTYPE html>
<html lang="${language === "zh" ? "zh-CN" : "en"}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(examTitle)} - ${escapeHtml(currentTask.title)}</title>
    <style>
      :root { color-scheme: light; }
      body { margin: 0; font-family: "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; background: #f8fafc; color: #0f172a; }
      .wrap { max-width: 960px; margin: 0 auto; padding: 32px 20px 48px; }
      .hero, .section, .material-card { border-radius: 24px; background: white; border: 1px solid #e2e8f0; box-shadow: 0 10px 30px rgba(15, 23, 42, 0.06); }
      .hero { padding: 28px; background: linear-gradient(135deg, #ecfeff 0%, #ffffff 55%, #f8fafc 100%); }
      .eyebrow { font-size: 12px; font-weight: 700; letter-spacing: 0.18em; text-transform: uppercase; color: #0891b2; }
      h1 { margin: 12px 0 8px; font-size: 32px; line-height: 1.2; }
      .meta { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-top: 20px; }
      .meta-card { border-radius: 18px; background: rgba(255,255,255,0.9); border: 1px solid #dbeafe; padding: 14px 16px; }
      .meta-card strong { display: block; font-size: 12px; color: #475569; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 6px; }
      .section { margin-top: 20px; padding: 24px; }
      .section h2 { margin: 0 0 14px; font-size: 22px; }
      ol { margin: 0; padding-left: 22px; }
      li { margin: 10px 0; line-height: 1.7; }
      .material-list { display: grid; gap: 16px; }
      .material-card { padding: 20px; }
      .material-head { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 10px; align-items: center; }
      .material-head h3 { margin: 0; font-size: 20px; }
      .material-head span { border-radius: 999px; background: #e0f2fe; color: #0c4a6e; padding: 6px 10px; font-size: 12px; font-weight: 600; }
      .material-card p { margin: 10px 0 0; line-height: 1.7; }
      .action-links { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 16px; }
      .action-links a { text-decoration: none; border-radius: 999px; background: #0891b2; color: white; padding: 10px 14px; font-size: 14px; font-weight: 600; }
      .excerpt { margin-top: 16px; border-radius: 18px; background: #f8fafc; border: 1px solid #e2e8f0; padding: 16px; }
      .excerpt p { white-space: pre-wrap; }
      .muted, .empty { margin-top: 16px; color: #64748b; }
    </style>
  </head>
  <body>
    <div class="wrap">
      <section class="hero">
        <div class="eyebrow">${language === "zh" ? "任务练习包" : "Task Practice Pack"}</div>
        <h1>${escapeHtml(currentTask.title)}</h1>
        <p>${escapeHtml(language === "zh" ? "这不是一份说明文档，而是一份可直接执行的任务包。先做题，再对照，再订正，再复做。" : "This is an executable task pack: practice, compare, correct, then redo.")}</p>
        <div class="meta">
          <div class="meta-card"><strong>${language === "zh" ? "生成时间" : "Generated at"}</strong>${escapeHtml(generatedAt)}</div>
          <div class="meta-card"><strong>${language === "zh" ? "试卷" : "Exam"}</strong>${escapeHtml(examTitle)}</div>
          <div class="meta-card"><strong>${language === "zh" ? "任务" : "Task"}</strong>${escapeHtml(`${language === "zh" ? `第 ${currentTask.day} 天` : `Day ${currentTask.day}`} - ${currentTask.title}`)}</div>
          <div class="meta-card"><strong>${language === "zh" ? "预计时长" : "Estimated time"}</strong>${escapeHtml(`${currentTask.minutes} ${language === "zh" ? "分钟" : "min"}`)}</div>
        </div>
      </section>

      <section class="section">
        <h2>${language === "zh" ? "完成标准" : "Success Criteria"}</h2>
        <p>${escapeHtml(currentTask.successCriteria || (language === "zh" ? "完成任务并记录结果。" : "Complete the task and record outcomes."))}</p>
      </section>

      <section class="section">
        <h2>${language === "zh" ? "执行步骤" : "Execution Steps"}</h2>
        <ol>
          ${instructions.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}
        </ol>
      </section>

      <section class="section">
        <h2>${language === "zh" ? "推荐资料片段" : "Linked Materials"}</h2>
        <div class="material-list">${materialsHtml}</div>
      </section>
    </div>
  </body>
</html>`;

    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const objectUrl = URL.createObjectURL(blob);
    const fileName = `${safeFileNamePart(examTitle)}-day-${currentTask.day}-${safeFileNamePart(currentTask.title || "task")}.html`;
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = fileName || "study-task-pack.html";
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(objectUrl);
    setStatusMessage(language === "zh" ? "已生成可点击打开的 HTML 任务练习包。" : "A clickable HTML task pack has been generated.");
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

      {runPhaseCopy && (
        <div className="fixed inset-0 z-40 bg-slate-950/45 backdrop-blur-sm" />
      )}

      {runPhaseCopy && (
        <section className="fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-3xl -translate-x-1/2 -translate-y-1/2 rounded-[32px] border border-white/70 bg-white px-5 py-5 shadow-2xl shadow-slate-900/25 md:px-7 md:py-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-3 w-3 animate-pulse rounded-full bg-teal-500" />
                <h2 className="text-lg font-semibold text-slate-900">{runPhaseCopy.title}</h2>
              </div>
              <p className="max-w-2xl text-sm leading-6 text-slate-600">{runPhaseCopy.description}</p>
            </div>
            <div className="shrink-0 rounded-2xl bg-slate-900 px-4 py-3 text-white">
              <div className="text-[11px] uppercase tracking-[0.24em] text-white/60">
                {language === "zh" ? "已耗时" : "Elapsed"}
              </div>
              <div className="mt-2 text-2xl font-semibold">{formatElapsed(elapsedSeconds)}</div>
            </div>
          </div>

          <div className="mt-5 h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-gradient-to-r from-teal-500 via-cyan-500 to-sky-500 transition-all duration-700"
              style={{ width: `${runPhaseCopy.progress}%` }}
            />
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-4">
            {runPhaseCopy.steps.map((step) => (
              <div
                key={step.label}
                className={`rounded-2xl border px-4 py-3 text-sm ${
                  step.state === "done"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : step.state === "active"
                      ? "border-teal-200 bg-teal-50 text-teal-700"
                      : "border-slate-200 bg-slate-50 text-slate-500"
                }`}
              >
                <div className="text-[11px] uppercase tracking-[0.24em]">
                  {step.state === "done"
                    ? language === "zh"
                      ? "已完成"
                      : "Done"
                    : step.state === "active"
                      ? language === "zh"
                        ? "进行中"
                        : "Active"
                      : language === "zh"
                        ? "等待中"
                        : "Pending"}
                </div>
                <div className="mt-2 font-medium">{step.label}</div>
              </div>
            ))}
          </div>

          <p className="mt-5 text-center text-xs leading-5 text-slate-400">
            {language === "zh"
              ? "请保持当前页面打开，处理完成后弹窗会自动关闭并刷新结果。"
              : "Keep this page open. The dialog will close automatically when results are refreshed."}
          </p>
        </section>
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
                  {preparingImages
                    ? language === "zh"
                      ? "正在检查并增强图片..."
                      : "Checking and enhancing images..."
                    : selectedFiles.length > 0
                    ? selectedFiles.length === 1
                      ? selectedFiles[0].name
                      : language === "zh"
                        ? `已选择 ${selectedFiles.length} 张图片`
                        : `${selectedFiles.length} images selected`
                    : language === "zh"
                      ? "点击选择多张图片或单个 PDF"
                      : "Choose multiple images or one PDF"}
                </span>
                {selectedFiles.length > 1 ? (
                  <span className="mt-2 text-xs text-slate-500">
                    {selectedFiles.slice(0, 3).map((file) => file.name).join(" / ")}
                    {selectedFiles.length > 3 ? (language === "zh" ? " 等" : " ...") : ""}
                  </span>
                ) : null}
                <input
                  type="file"
                  accept="image/*,.pdf"
                  multiple
                  className="hidden"
                  onChange={handleFileSelection}
                />
              </label>

              {imageQualityReports.length > 0 ? (
                <div className="rounded-[24px] border border-slate-200 bg-white p-4 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-900">
                        {language === "zh" ? "拍照质量预检" : "Image Quality Check"}
                      </p>
                      <p className="mt-1 text-xs leading-5 text-slate-500">
                        {language === "zh"
                          ? "已在浏览器端自动提亮、增强对比并压缩成适合识别的图片。"
                          : "Images were brightened, contrast-enhanced, and compressed in the browser before OCR."}
                      </p>
                    </div>
                    <span className="rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-700">
                      {imageQualityReports.filter((report) => report.level === "good").length}/{imageQualityReports.length}
                    </span>
                  </div>
                  <div className="mt-3 space-y-2">
                    {imageQualityReports.map((report) => {
                      const tone =
                        report.level === "bad"
                          ? "border-rose-200 bg-rose-50 text-rose-700"
                          : report.level === "warn"
                            ? "border-amber-200 bg-amber-50 text-amber-700"
                            : "border-emerald-200 bg-emerald-50 text-emerald-700";

                      return (
                        <div key={report.fileName} className={`rounded-2xl border px-3 py-2 ${tone}`}>
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-medium">{report.fileName}</span>
                            <span className="text-xs">
                              {report.width}x{report.height} · {report.megapixels}MP
                            </span>
                          </div>
                          {report.splitFrom ? (
                            <p className="mt-1 rounded-full bg-white/70 px-2 py-1 text-xs">
                              {language === "zh"
                                ? `已从 ${report.splitFrom} 自动切出${report.cropRegion === "left" ? "左页" : "右页"}`
                                : `Auto-split ${report.cropRegion} page from ${report.splitFrom}`}
                            </p>
                          ) : null}
                          <p className="mt-1 text-xs opacity-80">
                            {language === "zh"
                              ? `亮度 ${Math.round(report.brightness)} / 对比 ${Math.round(report.contrast)} / 清晰度 ${Math.round(report.sharpness)}`
                              : `brightness ${Math.round(report.brightness)} / contrast ${Math.round(report.contrast)} / sharpness ${Math.round(report.sharpness)}`}
                          </p>
                          {report.warnings.length > 0 ? (
                            <ul className="mt-2 space-y-1 text-xs leading-5">
                              {report.warnings.slice(0, 3).map((warning) => (
                                <li key={warning}>{warning}</li>
                              ))}
                            </ul>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}

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

              <div className="rounded-[24px] border border-slate-200 bg-slate-50/70 p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                  {language === "zh" ? "目标补充（可选）" : "Goal Notes (Optional)"}
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  {language === "zh"
                    ? "默认不需要填写，AI 会先根据试卷自动分析当前学业情况。只有像雅思/托福/SAT、目标专业、活动方向、AP 计划这些试卷里看不出来的信息，才建议在这里补充。"
                    : "You can usually leave this blank. The assistant will infer the current academic picture from the uploaded exam first. Only add information here for things the paper cannot reveal, such as IELTS/TOEFL/SAT, majors, activities, or AP plans."}
                </p>
                <textarea
                  rows={4}
                  value={uploadForm.plannerNotes}
                  onChange={(event) =>
                    setUploadForm((previous) => ({ ...previous, plannerNotes: event.target.value }))
                  }
                  className="mt-4 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-teal-400"
                  placeholder={
                    language === "zh"
                      ? "例如：IELTS 目标 7.5，申请 Economics / Data Science，活动主线是 research + debate，AP 还要兼顾 Macro/Micro/BC。"
                      : "For example: IELTS target 7.5, applying for Economics / Data Science, main activities are research + debate, and AP Macro/Micro/BC should also stay in the plan."
                  }
                />
              </div>

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
                disabled={uploading || preparingImages || (selectedFiles.length === 0 && !uploadForm.paperText.trim())}
                className="w-full rounded-full bg-slate-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {preparingImages
                  ? language === "zh"
                    ? "正在增强图片..."
                    : "Preparing images..."
                  : uploading
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
                      {examDetail.exam.questions.length || latestAnalysis?.scoreSummary?.totalQuestions || 0}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-[0.2em] text-slate-400">{language === "zh" ? "错题/失分点" : "Missed Items"}</div>
                    <div className="mt-2 text-2xl font-semibold text-slate-900">{formatMissedItems(latestAnalysis)}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-[0.2em] text-slate-400">{language === "zh" ? "准确率" : "Accuracy"}</div>
                    <div className="mt-2 text-2xl font-semibold text-slate-900">
                      {formatStudyAccuracy(latestAnalysis?.scoreSummary?.accuracyRate, language)}
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

              <section id="study-weakness-section" className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-rose-500">
                      {language === "zh" ? "弱项诊断" : "Weakness Diagnosis"}
                    </p>
                    <h3 className="mt-2 text-xl font-semibold text-slate-900">
                      {language === "zh" ? "先看清这份试卷暴露出的核心弱项" : "Start with the core weaknesses revealed by this paper"}
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-slate-500">
                      {language === "zh"
                        ? "先明确失分点和最该优先修复的能力，再进入任务、资料和打卡，学生会更清楚为什么现在要做这些。"
                        : "Understand the scoring gaps first, then move into tasks, materials, and check-ins with clearer intent."}
                    </p>
                  </div>
                  {latestAnalysis?.weaknesses?.length ? (
                    <div className="flex items-center gap-3">
                      <p className="text-xs text-slate-500">
                        {language === "zh"
                          ? showWeaknessDetails
                            ? "已展开完整弱项证据"
                            : "默认先展示核心弱项，避免信息过载"
                          : showWeaknessDetails
                            ? "Detailed weakness evidence expanded"
                            : "Core weaknesses only by default to reduce overload"}
                      </p>
                      <button
                        type="button"
                        onClick={() => setShowWeaknessDetails((previous) => !previous)}
                        className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 hover:border-slate-300"
                      >
                        {showWeaknessDetails
                          ? language === "zh"
                            ? "收起证据"
                            : "Collapse details"
                          : language === "zh"
                            ? "展开证据"
                            : "Expand details"}
                      </button>
                    </div>
                  ) : null}
                </div>

                {latestAnalysis ? (
                  <div className="mt-5 space-y-4">
                    <div className="rounded-[24px] bg-slate-50 px-5 py-4 text-sm leading-7 text-slate-700">
                      {latestAnalysis.overview}
                    </div>

                    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_320px]">
                      <div className="space-y-4">
                        {(showWeaknessDetails ? latestAnalysis.weaknesses : latestAnalysis.weaknesses.slice(0, 2)).map((weakness, index) => (
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

                      <div className="rounded-[24px] border border-rose-200 bg-rose-50/70 px-5 py-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-rose-600">
                          {language === "zh" ? "结果使用顺序" : "How to use this result"}
                        </p>
                        <div className="mt-4 space-y-3">
                          <a href="#study-workflow" className="block rounded-2xl bg-white px-4 py-3 text-sm text-slate-700 hover:border-rose-300">
                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-rose-500">1</p>
                            <p className="mt-1 font-medium">{language === "zh" ? "看执行导航，知道接下来做什么" : "Check the execution guide"}</p>
                          </a>
                          <a href="#study-material-section" className="block rounded-2xl bg-white px-4 py-3 text-sm text-slate-700 hover:border-rose-300">
                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-rose-500">2</p>
                            <p className="mt-1 font-medium">{language === "zh" ? "打开当前任务联动面板" : "Open the current task panel"}</p>
                          </a>
                          <a href="#study-plan-section" className="block rounded-2xl bg-white px-4 py-3 text-sm text-slate-700 hover:border-rose-300">
                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-rose-500">3</p>
                            <p className="mt-1 font-medium">{language === "zh" ? "按学习计划执行" : "Follow the learning plan"}</p>
                          </a>
                        </div>
                      </div>
                    </div>
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

              <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
                <div className="space-y-6">
                  <section id="study-workflow" className="rounded-[28px] border border-teal-200 bg-teal-50/60 p-6 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-teal-700">
                      {language === "zh" ? "执行导航" : "Action Flow"}
                    </p>
                    <h3 className="mt-2 text-xl font-semibold text-slate-900">
                      {language === "zh" ? "看完弱项后，下一步怎么做" : "What to do after reading the diagnosis"}
                    </h3>
                    <div className="mt-4 grid gap-3 md:grid-cols-4">
                      <a href="#study-material-section" className="rounded-2xl border border-white/70 bg-white px-4 py-3 text-sm text-slate-700 hover:border-teal-300">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-600">1</p>
                        <p className="mt-1 font-medium">{language === "zh" ? "看当前任务" : "Review current task"}</p>
                      </a>
                      <a href="#study-plan-section" className="rounded-2xl border border-white/70 bg-white px-4 py-3 text-sm text-slate-700 hover:border-teal-300">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-600">2</p>
                        <p className="mt-1 font-medium">{language === "zh" ? "执行学习计划" : "Follow the plan"}</p>
                      </a>
                      <a href="#study-material-section" className="rounded-2xl border border-white/70 bg-white px-4 py-3 text-sm text-slate-700 hover:border-teal-300">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-600">3</p>
                        <p className="mt-1 font-medium">{language === "zh" ? "打开绑定资料" : "Open linked materials"}</p>
                      </a>
                      <a href="#study-checkin-section" className="rounded-2xl border border-white/70 bg-white px-4 py-3 text-sm text-slate-700 hover:border-teal-300">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-600">4</p>
                        <p className="mt-1 font-medium">{language === "zh" ? "完成后打卡反馈" : "Check in after work"}</p>
                      </a>
                    </div>
                    {currentTask ? (
                      <div className="mt-4 rounded-2xl border border-teal-200 bg-white px-4 py-3 text-sm text-slate-700">
                        <p className="text-xs uppercase tracking-[0.18em] text-teal-600">{language === "zh" ? "当前优先任务" : "Current priority"}</p>
                        <p className="mt-1 font-semibold text-slate-900">
                          {language === "zh" ? `第 ${currentTask.day} 天` : `Day ${currentTask.day}`} · {currentTask.title}
                        </p>
                      </div>
                    ) : null}
                  </section>

                  <section id="study-plan-section" className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
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
                    {activePlan?.tasks?.length ? (
                      <div className="mt-4 flex items-center justify-between gap-3">
                        <p className="text-xs text-slate-500">
                          {showAllTasks
                            ? language === "zh"
                              ? `显示全部 ${activePlan.tasks.length} 个任务`
                              : `Showing all ${activePlan.tasks.length} tasks`
                            : language === "zh"
                              ? "当前仅显示优先任务（最多 3 个）"
                              : "Showing priority tasks only (up to 4)"}
                        </p>
                        <button
                          type="button"
                          onClick={() => setShowAllTasks((previous) => !previous)}
                          className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 hover:border-slate-300"
                        >
                          {showAllTasks
                            ? language === "zh"
                              ? "收起"
                              : "Show less"
                            : language === "zh"
                              ? "展开全部"
                              : "Show all"}
                        </button>
                      </div>
                    ) : null}

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

                        {activePlan.strategicOverview ? (
                          <div className="rounded-[24px] bg-indigo-50 px-5 py-4 text-sm leading-7 text-indigo-900">
                            {activePlan.strategicOverview}
                          </div>
                        ) : null}

                        {activePlan.planTable?.length ? (
                          <div className="overflow-hidden rounded-[24px] border border-slate-200">
                            <div className="grid grid-cols-[120px_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] gap-px bg-slate-200 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                              <div className="bg-slate-50 px-4 py-3">{language === "zh" ? "类别" : "Category"}</div>
                              <div className="bg-slate-50 px-4 py-3">{language === "zh" ? "当前状态" : "Current State"}</div>
                              <div className="bg-slate-50 px-4 py-3">{language === "zh" ? "目标" : "Target"}</div>
                              <div className="bg-slate-50 px-4 py-3">{language === "zh" ? "下一步" : "Next Action"}</div>
                            </div>
                            <div className="divide-y divide-slate-200 bg-white">
                              {activePlan.planTable.map((row, index) => (
                                <div
                                  key={`${row.category}-${row.item}-${index}`}
                                  className="grid gap-4 px-4 py-4 md:grid-cols-[120px_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]"
                                >
                                  <div className="space-y-2">
                                    <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                                      {row.category}
                                    </span>
                                    <div className="text-sm font-semibold text-slate-900">{row.item}</div>
                                    <span className={`inline-flex rounded-full px-3 py-1 text-xs ${priorityTone(row.priority)}`}>
                                      {row.priority}
                                    </span>
                                  </div>
                                  <div className="text-sm leading-7 text-slate-600">{row.currentState}</div>
                                  <div className="text-sm leading-7 text-slate-600">{row.targetState}</div>
                                  <div className="space-y-2 text-sm leading-7 text-slate-600">
                                    <div>{row.nextAction}</div>
                                    <div className="text-xs uppercase tracking-[0.16em] text-slate-400">{row.cadence}</div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : null}

                        <div className="space-y-3">
                          {tasksToRender.map((task) => {
                            const completed = stagedCompletedTaskIds.includes(task.taskId);
                            const taskLinkedMaterials = taskLinkedMaterialsMap.get(task.taskId) || [];

                            return (
                              <div
                                key={task.taskId}
                                className={`flex gap-4 rounded-[24px] border px-4 py-4 transition ${
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
                                  {task.instructions?.length ? (
                                    <div className="mt-4 rounded-2xl bg-white/80 px-4 py-3">
                                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                                        {language === "zh" ? "怎么做" : "How to do it"}
                                      </p>
                                      <div className="mt-2 space-y-2">
                                        {task.instructions.map((instruction, instructionIndex) => (
                                          <p key={`${task.taskId}-instruction-${instructionIndex}`} className="text-sm leading-6 text-slate-600">
                                            {instructionIndex + 1}. {instruction}
                                          </p>
                                        ))}
                                      </div>
                                    </div>
                                  ) : null}
                                  {task.practiceItems?.length ? (
                                    <div className="mt-3 flex flex-wrap gap-2">
                                      {task.practiceItems.map((item, itemIndex) => (
                                        <span key={`${task.taskId}-practice-${itemIndex}`} className="rounded-full bg-white px-3 py-1 text-xs text-slate-600">
                                          {item}
                                        </span>
                                      ))}
                                    </div>
                                  ) : null}
                                  {(task.deliverable || task.linkedMaterialTitles?.length) ? (
                                    <div className="mt-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-600">
                                      {task.deliverable ? (
                                        <p>
                                          <span className="font-semibold text-slate-800">{language === "zh" ? "交付物：" : "Deliverable: "}</span>
                                          {task.deliverable}
                                        </p>
                                      ) : null}
                                      {task.linkedMaterialTitles?.length ? (
                                        <p className="mt-1">
                                          <span className="font-semibold text-slate-800">{language === "zh" ? "关联题目：" : "Linked work: "}</span>
                                          {task.linkedMaterialTitles.join(" · ")}
                                        </p>
                                      ) : null}
                                    </div>
                                  ) : null}
                                  {taskLinkedMaterials.length > 0 ? (
                                    <div className="mt-3 rounded-2xl border border-cyan-200 bg-cyan-50/70 px-4 py-3">
                                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-700">
                                        {language === "zh" ? "任务已绑定资料" : "Task-linked materials"}
                                      </p>
                                      <div className="mt-2 space-y-2">
                                        {taskLinkedMaterials.map((material, materialIndex) => (
                                          <div key={`${task.taskId}-linked-material-${material.chunkId || material.materialId || materialIndex}`} className="rounded-xl bg-white px-3 py-2">
                                            {(() => {
                                              const previewLink = buildMaterialPreviewPath(material);
                                              const externalLink = getPublicMaterialUrl(material.url);
                                              return (
                                                <>
                                            <div className="flex flex-wrap items-center gap-2">
                                              <span className="text-sm font-medium text-slate-900">{material.title}</span>
                                              {material.questionRef ? (
                                                <span className="rounded-full bg-cyan-100 px-2 py-0.5 text-[11px] font-medium text-cyan-700">
                                                  {material.questionRef}
                                                </span>
                                              ) : null}
                                              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
                                                {materialTypeLabel(material.materialType, language)}
                                              </span>
                                            </div>
                                            {material.sourceTitle ? (
                                              <p className="mt-1 text-xs text-slate-500">{material.sourceTitle}</p>
                                            ) : null}
                                            {material.excerpt ? (
                                              <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-600">{material.excerpt}</p>
                                            ) : null}
                                            {previewLink || externalLink ? (
                                              <div className="mt-2 flex flex-wrap gap-3">
                                                {previewLink ? (
                                                  <a
                                                    href={previewLink}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    onClick={(event) => event.stopPropagation()}
                                                    className="inline-flex text-xs font-medium text-cyan-700 hover:text-cyan-800"
                                                  >
                                                    {language === "zh" ? "站内打开片段" : "Open in app"}
                                                  </a>
                                                ) : null}
                                                {externalLink ? (
                                                  <a
                                                    href={externalLink}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    onClick={(event) => event.stopPropagation()}
                                                    className="inline-flex text-xs font-medium text-slate-600 hover:text-slate-800"
                                                  >
                                                    {language === "zh" ? "原资料链接" : "Source link"}
                                                  </a>
                                                ) : null}
                                              </div>
                                            ) : (
                                              <p className="mt-1 text-xs text-slate-400">
                                                {explainMaterialLinkStatus(material, language)}
                                              </p>
                                            )}
                                                </>
                                              );
                                            })()}
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  ) : null}
                                </div>
                              </div>
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
                  <section
                    id="study-material-section"
                    className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm xl:self-start"
                  >
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-500">
                      {language === "zh" ? "当前任务联动面板" : "Current Task Panel"}
                    </p>
                    <h3 className="mt-2 text-xl font-semibold text-slate-900">
                      {currentTask
                        ? language === "zh"
                          ? `第 ${currentTask.day} 天 · ${currentTask.title}`
                          : `Day ${currentTask.day} · ${currentTask.title}`
                        : language === "zh"
                          ? "等待学习任务"
                          : "Waiting for a task"}
                    </h3>

                    {currentTask ? (
                      <div className="mt-5 space-y-4">
                        <div className="rounded-2xl border border-cyan-200 bg-cyan-50/70 px-4 py-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full bg-white px-3 py-1 text-xs text-slate-600">
                              {taskTypeLabel(currentTask.type, language)}
                            </span>
                            <span className="rounded-full bg-white px-3 py-1 text-xs text-slate-600">
                              {currentTask.minutes} {language === "zh" ? "分钟" : "min"}
                            </span>
                            <span
                              className={`rounded-full px-3 py-1 text-xs ${
                                currentTaskCompleted
                                  ? "bg-emerald-100 text-emerald-700 border border-emerald-200"
                                  : "bg-amber-100 text-amber-700 border border-amber-200"
                              }`}
                            >
                              {currentTaskCompleted
                                ? language === "zh"
                                  ? "已完成"
                                  : "Completed"
                                : language === "zh"
                                  ? "待完成"
                                  : "Pending"}
                            </span>
                          </div>
                          <p className="mt-3 text-sm leading-6 text-slate-700">{currentTask.successCriteria}</p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={handleDownloadCurrentTaskPack}
                              className="rounded-full bg-cyan-600 px-4 py-2 text-xs font-medium text-white hover:bg-cyan-700"
                            >
                              {language === "zh" ? "下载本任务练习包" : "Download task pack"}
                            </button>
                            <button
                              type="button"
                              onClick={handleCompleteCurrentTask}
                              disabled={currentTaskCompleted}
                              className="rounded-full border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {currentTaskCompleted
                                ? language === "zh"
                                  ? "当前任务已完成"
                                  : "Task already completed"
                                : language === "zh"
                                  ? "标记完成当前任务"
                                  : "Mark current task done"}
                            </button>
                          </div>
                        </div>

                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                            {language === "zh" ? "执行步骤" : "Execution steps"}
                          </p>
                          <div className="mt-2 space-y-2">
                            {(currentTask.instructions?.length
                              ? currentTask.instructions
                              : [
                                  language === "zh"
                                    ? "先按任务要求做题并记录错误类型。"
                                    : "Complete the task and record error types first.",
                                ]
                            ).map((step, index) => (
                              <p key={`${currentTask.taskId}-panel-step-${index}`} className="text-sm leading-6 text-slate-700">
                                {index + 1}. {step}
                              </p>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-3">
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                            {language === "zh" ? "当前任务资料" : "Task-linked materials"}
                          </p>
                          {currentTaskPanelMaterials.length > 0 ? (
                            currentTaskPanelMaterials.map((material, index) => {
                              const previewLink = buildMaterialPreviewPath(material);
                              const externalLink = getPublicMaterialUrl(material.url);
                              return (
                                <div key={`${material.title}-${material.chunkId || material.materialId || index}`} className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <p className="text-sm font-semibold text-slate-900">{material.title}</p>
                                    {material.questionRef ? (
                                      <span className="rounded-full bg-cyan-100 px-2 py-0.5 text-[11px] font-medium text-cyan-700">
                                        {material.questionRef}
                                      </span>
                                    ) : null}
                                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
                                      {materialTypeLabel(material.materialType, language)}
                                    </span>
                                  </div>
                                  {material.sourceTitle ? (
                                    <p className="mt-1 text-xs text-slate-500">{material.sourceTitle}</p>
                                  ) : null}
                                  {material.excerpt ? (
                                    <p className="mt-2 line-clamp-3 text-xs leading-5 text-slate-600">{material.excerpt}</p>
                                  ) : null}
                                  {previewLink || externalLink ? (
                                    <div className="mt-2 flex flex-wrap gap-3">
                                      {previewLink ? (
                                        <a
                                          href={previewLink}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="inline-flex text-xs font-medium text-cyan-700 hover:text-cyan-800"
                                        >
                                          {language === "zh" ? "站内打开片段" : "Open in app"}
                                        </a>
                                      ) : null}
                                      {externalLink ? (
                                        <a
                                          href={externalLink}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="inline-flex text-xs font-medium text-slate-600 hover:text-slate-800"
                                        >
                                          {language === "zh" ? "打开原资料链接" : "Open source link"}
                                        </a>
                                      ) : null}
                                    </div>
                                  ) : (
                                    <p className="mt-2 text-xs text-slate-400">
                                      {explainMaterialLinkStatus(material, language)}
                                    </p>
                                  )}
                                </div>
                              );
                            })
                          ) : (
                            <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500">
                              {language === "zh"
                                ? "当前任务暂未匹配到可展示资料，建议先下载练习包开始执行。"
                                : "No material matched yet. Download the task pack to proceed."}
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="mt-5 rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
                        {language === "zh"
                          ? "先完成试卷分析，系统会自动生成当前任务联动面板。"
                          : "Analyze an exam first to generate the current-task panel."}
                      </div>
                    )}
                  </section>

                  {false && (
                  <section id="study-material-section" className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-500">
                      {language === "zh" ? "资料推荐" : "Material Recommendations"}
                    </p>
                    <h3 className="mt-2 text-xl font-semibold text-slate-900">
                      {language === "zh" ? "与弱项直接关联的内容" : "Content tied directly to the diagnosed gaps"}
                    </h3>
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setMaterialViewMode("task")}
                        className={`rounded-full px-3 py-1 text-xs font-medium ${
                          materialViewMode === "task"
                            ? "bg-cyan-600 text-white"
                            : "border border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                        }`}
                      >
                        {language === "zh" ? "当前任务相关" : "Current task"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setMaterialViewMode("all")}
                        className={`rounded-full px-3 py-1 text-xs font-medium ${
                          materialViewMode === "all"
                            ? "bg-cyan-600 text-white"
                            : "border border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                        }`}
                      >
                        {language === "zh" ? "全部推荐" : "All recommendations"}
                      </button>
                      {materialViewMode === "task" && currentTask ? (
                        <span className="text-xs text-slate-500">
                          {language === "zh"
                            ? `关联任务：第 ${currentTask?.day ?? "-"} 天 · ${currentTask?.title ?? ""}`
                            : `Linked task: Day ${currentTask?.day ?? "-"} · ${currentTask?.title ?? ""}`}
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-5 space-y-4">
                      {displayedRecommendations.length ? (
                        displayedRecommendations.map((material, index) => (
                          <div key={`${material.title}-${index}`} className="rounded-[24px] border border-slate-200 px-4 py-4">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <h4 className="text-sm font-semibold text-slate-900">{material.title}</h4>
                                <p className="mt-1 text-xs uppercase tracking-[0.2em] text-slate-400">
                                  {materialTypeLabel(material.materialType, language)}
                                </p>
                              </div>
                              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">{material.score}</span>
                            </div>
                            {(material.sourceTitle || material.questionRef || material.estimatedMinutes) ? (
                              <div className="mt-3 flex flex-wrap gap-2">
                                {material.questionRef ? (
                                  <span className="rounded-full bg-cyan-50 px-3 py-1 text-xs font-medium text-cyan-700">{material.questionRef}</span>
                                ) : null}
                                {material.sourceTitle ? (
                                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">{material.sourceTitle}</span>
                                ) : null}
                                {material.estimatedMinutes ? (
                                  <span className="rounded-full bg-amber-50 px-3 py-1 text-xs text-amber-700">
                                    {language === "zh" ? `${material.estimatedMinutes} 分钟` : `${material.estimatedMinutes} min`}
                                  </span>
                                ) : null}
                              </div>
                            ) : null}
                            <p className="mt-3 text-sm leading-6 text-slate-600">{material.reason}</p>
                            {material.excerpt ? (
                              <div className="mt-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700">
                                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                                  {language === "zh" ? "题目 / 答案片段" : "Question / answer excerpt"}
                                </p>
                                <p className="mt-2">{material.excerpt}</p>
                              </div>
                            ) : null}
                            {material.actionLabel ? (
                              <p className="mt-3 rounded-2xl border border-teal-100 bg-teal-50 px-4 py-3 text-sm leading-6 text-teal-800">
                                {material.actionLabel}
                              </p>
                            ) : null}
                            {material.workflowSteps?.length ? (
                              <div className="mt-3 rounded-2xl border border-indigo-100 bg-indigo-50 px-4 py-3">
                                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-600">
                                  {language === "zh" ? "执行步骤" : "Execution steps"}
                                </p>
                                <div className="mt-2 space-y-2">
                                  {material.workflowSteps.map((step, stepIndex) => (
                                    <p key={`${material.title}-step-${stepIndex}`} className="text-sm leading-6 text-indigo-900">
                                      {stepIndex + 1}. {step}
                                    </p>
                                  ))}
                                </div>
                              </div>
                            ) : null}
                            {(material.expectedOutcome || material.pairedMarkschemeTitle) ? (
                              <div className="mt-3 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-900">
                                {material.expectedOutcome ? (
                                  <p>
                                    <span className="font-semibold">
                                      {language === "zh" ? "验收目标：" : "Expected outcome: "}
                                    </span>
                                    {material.expectedOutcome}
                                  </p>
                                ) : null}
                                {material.pairedMarkschemeTitle ? (
                                  <p className="mt-1">
                                    <span className="font-semibold">
                                      {language === "zh" ? "配套评分依据：" : "Scoring reference: "}
                                    </span>
                                    {material.pairedMarkschemeTitle}
                                  </p>
                                ) : null}
                              </div>
                            ) : null}
                            {material.topics.length > 0 && (
                              <div className="mt-3 flex flex-wrap gap-2">
                                {material.topics.map((topic, topicIndex) => (
                                  <span key={`${topic}-${topicIndex}`} className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">
                                    {topic}
                                  </span>
                                ))}
                              </div>
                            )}
                            {getPublicMaterialUrl(material.url) ? (
                              <a
                                href={getPublicMaterialUrl(material.url)}
                                target="_blank"
                                rel="noreferrer"
                                className="mt-4 inline-flex text-sm font-medium text-teal-600 hover:text-teal-700"
                              >
                                {language === "zh" ? "打开资料" : "Open Material"}
                              </a>
                            ) : (
                              <p className="mt-4 text-xs text-slate-400">
                                {language === "zh" ? "该资料暂无可打开链接" : "No open link for this item"}
                              </p>
                            )}
                          </div>
                        ))
                      ) : (
                        <div className="rounded-[24px] border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
                          {materialViewMode === "task"
                            ? language === "zh"
                              ? "当前任务还没有可直接打开的绑定资料，可切到“全部推荐”查看。"
                              : "No task-linked material yet. Switch to all recommendations."
                            : language === "zh"
                              ? "暂时还没有推荐资料。"
                              : "No recommendations yet."}
                        </div>
                      )}
                    </div>
                  </section>
                  )}

                  <section id="study-checkin-section" className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
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

                  <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-violet-500">
                      {language === "zh" ? "规划画像" : "Planning Profile"}
                    </p>
                    <h3 className="mt-2 text-xl font-semibold text-slate-900">
                      {language === "zh" ? "系统自动归纳的长期规划视角" : "Long-term planning view inferred by the assistant"}
                    </h3>

                    <div className="mt-5 space-y-4">
                      <div className="rounded-[24px] border border-violet-200 bg-violet-50/70 px-5 py-4">
                        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-500">
                          {language === "zh" ? "自动判断" : "Auto-inferred"}
                        </div>
                        {inferredPlanningHighlights.length > 0 ? (
                          <div className="mt-3 space-y-3">
                            {inferredPlanningHighlights.map((item, index) => (
                              <div key={`${item}-${index}`} className="rounded-2xl bg-white/80 px-4 py-3 text-sm leading-7 text-slate-700">
                                {item}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="mt-3 text-sm leading-7 text-slate-600">
                            {language === "zh"
                              ? "当前可自动推断的信息还不够多，继续上传更完整的试卷或老师批注后，这里会逐步补全。"
                              : "There is not enough evidence yet for a richer inferred planning view. Upload a fuller paper or more teacher annotations and this section will become more specific."}
                          </div>
                        )}
                      </div>

                      {hasExplicitPlanningProfile ? (
                        <div className="rounded-[24px] border border-slate-200 bg-slate-50 px-5 py-4">
                          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                            {language === "zh" ? "用户补充信息" : "User-supplied extras"}
                          </div>
                          <div className="mt-4 space-y-4">
                            {examPlanningProfile?.standardizedGoals?.length ? (
                              <div className="space-y-3">
                                <div className="text-xs uppercase tracking-[0.2em] text-slate-400">
                                  {language === "zh" ? "标化目标" : "Standardized Goals"}
                                </div>
                                {examPlanningProfile.standardizedGoals.map((goal, index) => (
                                  <div key={`${goal.test}-${index}`} className="rounded-2xl bg-white px-4 py-3 text-sm text-slate-700">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="font-semibold text-slate-900">{goal.test}</span>
                                      {goal.priority ? (
                                        <span className={`rounded-full px-3 py-1 text-xs ${priorityTone(goal.priority)}`}>
                                          {goal.priority}
                                        </span>
                                      ) : null}
                                    </div>
                                    <div className="mt-2 text-xs uppercase tracking-[0.16em] text-slate-400">
                                      {[goal.currentScore, goal.targetScore].filter(Boolean).join(" -> ") || (language === "zh" ? "待补充分数" : "Score target pending")}
                                    </div>
                                    {goal.examDate ? <div className="mt-2 text-sm text-slate-500">{goal.examDate}</div> : null}
                                  </div>
                                ))}
                              </div>
                            ) : null}

                            {examPlanningProfile?.targetMajors?.length ? (
                              <div>
                                <div className="text-xs uppercase tracking-[0.2em] text-slate-400">
                                  {language === "zh" ? "目标专业" : "Target Majors"}
                                </div>
                                <div className="mt-2 flex flex-wrap gap-2">
                                  {examPlanningProfile.targetMajors.map((item, index) => (
                                    <span key={`${item}-${index}`} className="rounded-full bg-sky-50 px-3 py-1 text-xs text-sky-700">
                                      {item}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            ) : null}

                            {examPlanningProfile?.activityThemes?.length ? (
                              <div>
                                <div className="text-xs uppercase tracking-[0.2em] text-slate-400">
                                  {language === "zh" ? "活动方向" : "Activity Themes"}
                                </div>
                                <div className="mt-2 flex flex-wrap gap-2">
                                  {examPlanningProfile.activityThemes.map((item, index) => (
                                    <span key={`${item}-${index}`} className="rounded-full bg-amber-50 px-3 py-1 text-xs text-amber-700">
                                      {item}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            ) : null}

                            {examPlanningProfile?.apFocuses?.length ? (
                              <div>
                                <div className="text-xs uppercase tracking-[0.2em] text-slate-400">
                                  {language === "zh" ? "AP 目标" : "AP Focus"}
                                </div>
                                <div className="mt-2 flex flex-wrap gap-2">
                                  {examPlanningProfile.apFocuses.map((item, index) => (
                                    <span key={`${item}-${index}`} className="rounded-full bg-violet-50 px-3 py-1 text-xs text-violet-700">
                                      {item}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            ) : null}

                            {examPlanningProfile?.notes ? (
                              <div className="rounded-2xl bg-white px-4 py-3 text-sm leading-7 text-slate-600">
                                {examPlanningProfile.notes}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-[24px] border border-dashed border-slate-200 px-4 py-6 text-sm leading-7 text-slate-500">
                          {language === "zh"
                            ? "像雅思/托福/SAT、目标专业、活动主线、AP 计划这类信息，试卷本身通常看不出来。如果你希望后续计划把这些一起编进去，可以在上传时用“目标补充（可选）”简单写一句。"
                            : "Items like IELTS/TOEFL/SAT, target majors, activity themes, and AP plans usually cannot be inferred from the paper alone. If you want the assistant to weave them into the plan, add a short note in the optional goal field during upload."}
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
