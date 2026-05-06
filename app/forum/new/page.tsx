"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/app/context/AuthContext";
import { useLanguage } from "@/app/context/LanguageContext";
import type { TranslationKey } from "@/app/context/LanguageContext";

const CATEGORY_KEYS: { value: string; key: TranslationKey }[] = [
  { value: "AI安全", key: "catAiSafety" },
  { value: "隐私保护", key: "catPrivacy" },
  { value: "伦理责任", key: "catEthics" },
  { value: "学术讨论", key: "catAcademic" },
  { value: "社会影响", key: "catSocial" },
  { value: "创意想法", key: "catCreative" },
];

interface SensitiveWordPayload {
  word?: string;
}

interface PublishErrorPayload {
  error?: string;
  requiresConfirmation?: boolean;
  requiresReviewAfterConfirmation?: boolean;
  sensitiveWords?: SensitiveWordPayload[];
}

interface PublishSuccessPayload {
  status?: "approved" | "pending" | "rejected" | "hidden";
}

function GuestBlock({ t }: { t: (k: TranslationKey) => string }) {
  return (
    <div className="max-w-2xl mx-auto text-center py-24">
      <div className="text-5xl mb-4">🔒</div>
      <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-2">{t("guestCannotPost")}</h2>
      <p className="text-gray-500 dark:text-gray-400 mb-6">{t("guestPostDesc")}</p>
      <div className="flex gap-3 justify-center">
        <a href="/login" className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 font-medium text-sm">{t("login")}</a>
        <a href="/register" className="border border-blue-600 text-blue-600 px-6 py-2 rounded-lg hover:bg-blue-50 font-medium text-sm">{t("register")}</a>
      </div>
    </div>
  );
}

export default function NewPostPage() {
  const router = useRouter();
  const { user, loading: authLoading, isGuest, authFetch } = useAuth();
  const { t, language } = useLanguage();

  const [formData, setFormData] = useState({
    title: "",
    titleEn: "",
    category: "AI安全",
    content: "",
    contentEn: "",
    linkUrl: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const errorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!error) return;
    errorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    errorRef.current?.focus();
  }, [error]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const buildRequestBody = (forcePublish = false): Record<string, string | boolean> => {
    const body: Record<string, string | boolean> = {
      title: formData.title,
      category: formData.category,
      content: formData.content,
    };

    if (formData.titleEn.trim()) body.titleEn = formData.titleEn.trim();
    if (formData.contentEn.trim()) body.contentEn = formData.contentEn.trim();
    if (formData.linkUrl.trim() && user?.isAdmin) body.linkUrl = formData.linkUrl.trim();
    if (forcePublish) body.forcePublish = true;

    return body;
  };

  const submitPost = async (forcePublish = false) =>
    authFetch("/api/posts", {
      method: "POST",
      body: JSON.stringify(buildRequestBody(forcePublish)),
    });

  const parseErrorPayload = async (response: Response): Promise<{ message: string; payload: PublishErrorPayload | null }> => {
    let message = t("publishFailed");
    let payload: PublishErrorPayload | null = null;

    try {
      payload = (await response.json()) as PublishErrorPayload;
      if (typeof payload.error === "string" && payload.error.trim()) {
        message = payload.error;
      }
    } catch {
      payload = null;
    }

    return { message, payload };
  };

  const getSuccessMessage = (payload: PublishSuccessPayload | null) => {
    if (payload?.status === "pending") {
      return language === "zh"
        ? "已提交审核，管理员审核通过后将展示。"
        : "Submitted for review. It will be visible after admin approval.";
    }

    return t("postSuccess");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    if (!formData.title.trim() || !formData.content.trim()) {
      setError(t("fillRequired"));
      setLoading(false);
      return;
    }

    try {
      let finalResponse = await submitPost(false);

      if (!finalResponse.ok) {
        const { message, payload } = await parseErrorPayload(finalResponse);
        const requiresConfirmation = Boolean(payload?.requiresConfirmation);

        if (!requiresConfirmation) {
          throw new Error(message);
        }

        const detectedWords = Array.isArray(payload?.sensitiveWords)
          ? payload.sensitiveWords
              .map((item) => item.word)
              .filter((word): word is string => typeof word === "string" && word.trim().length > 0)
          : [];

        const wordsText = detectedWords.length > 0 ? detectedWords.join("、") : message;
        const reviewNotice = payload?.requiresReviewAfterConfirmation
          ? language === "zh"
            ? "\n\n继续提交后将进入管理员审核，审核通过后才会展示。"
            : "\n\nIf you continue, this post will enter admin review and become visible only after approval."
          : "";

        const confirmMessage =
          language === "zh"
            ? `检测到敏感词：${wordsText}\n\n是否继续发布？${reviewNotice}`
            : `Sensitive words detected: ${wordsText}\n\nDo you want to continue publishing?${reviewNotice}`;

        const confirmed = window.confirm(confirmMessage);
        if (!confirmed) {
          setError(message);
          return;
        }

        finalResponse = await submitPost(true);
        if (!finalResponse.ok) {
          const { message: forceMessage } = await parseErrorPayload(finalResponse);
          throw new Error(forceMessage);
        }
      }

      let successPayload: PublishSuccessPayload | null = null;
      try {
        successPayload = (await finalResponse.json()) as PublishSuccessPayload;
      } catch {
        successPayload = null;
      }

      alert(getSuccessMessage(successPayload));
      router.push("/forum");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("publishFailed"));
    } finally {
      setLoading(false);
    }
  };

  if (authLoading || !user) return <div className="text-center py-32 text-gray-400">{t("loading")}</div>;
  if (isGuest) return <GuestBlock t={t} />;

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">{t("newDiscussion")}</h1>

      <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-8 space-y-6">
        {error && (
          <div
            ref={errorRef}
            role="alert"
            tabIndex={-1}
            className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded outline-none"
          >
            {error}
          </div>
        )}

        <div>
          <label className="block text-sm font-bold text-gray-700 dark:text-gray-200 mb-2">
            {t("postTitle")} *
          </label>
          <input
            type="text"
            name="title"
            value={formData.title}
            onChange={handleChange}
            placeholder={t("titlePlaceholder")}
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            maxLength={100}
          />
          <p className="text-xs text-gray-500 mt-1">{formData.title.length}/100</p>
        </div>

        <div>
          <label className="block text-sm font-bold text-gray-700 dark:text-gray-200 mb-2">
            {t("titleEnLabel")}
          </label>
          <input
            type="text"
            name="titleEn"
            value={formData.titleEn}
            onChange={handleChange}
            placeholder={t("titleEnPlaceholder")}
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            maxLength={150}
          />
        </div>

        <div>
          <label className="block text-sm font-bold text-gray-700 dark:text-gray-200 mb-2">{t("username")}</label>
          <div className="w-full px-4 py-2 border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 rounded-lg text-gray-600 dark:text-gray-300 text-sm">
            {user.username}
          </div>
        </div>

        <div>
          <label className="block text-sm font-bold text-gray-700 dark:text-gray-200 mb-2">
            {t("selectCategory")} *
          </label>
          <select
            name="category"
            value={formData.category}
            onChange={handleChange}
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {CATEGORY_KEYS.map(({ value, key }) => (
              <option key={value} value={value}>{t(key)}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-bold text-gray-700 dark:text-gray-200 mb-2">
            {t("contentLabel")} *
          </label>
          <textarea
            name="content"
            value={formData.content}
            onChange={handleChange}
            placeholder={t("contentPlaceholder")}
            rows={8}
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-bold text-gray-700 dark:text-gray-200 mb-2">
            {t("contentEnLabel")}
          </label>
          <textarea
            name="contentEn"
            value={formData.contentEn}
            onChange={handleChange}
            placeholder={t("contentEnPlaceholder")}
            rows={6}
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {user?.isAdmin && (
          <div>
            <label className="block text-sm font-bold text-gray-700 dark:text-gray-200 mb-2">
              {t("linkUrlLabel")}
            </label>
            <input
              type="url"
              name="linkUrl"
              value={formData.linkUrl}
              onChange={handleChange}
              placeholder={t("linkUrlPlaceholder")}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-500 mt-1">{t("linkUrlHint")}</p>
          </div>
        )}

        <div className="flex gap-4">
          <button
            type="submit"
            disabled={loading}
            className="flex-1 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 font-bold disabled:opacity-50"
          >
            {loading ? t("publishing") : t("publish")}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="flex-1 bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-200 py-2 rounded-lg hover:bg-gray-400 dark:hover:bg-gray-500 font-bold"
          >
            {t("cancelEdit")}
          </button>
        </div>
      </form>
    </div>
  );
}