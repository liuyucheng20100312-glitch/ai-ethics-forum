"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "../../context/AuthContext";
import { useLanguage } from "../../context/LanguageContext";

export default function NewVotePage() {
  const { isGuest, user, authFetch } = useAuth();
  const { t, language } = useLanguage();
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [titleEn, setTitleEn] = useState("");
  const [proDescription, setProDescription] = useState("");
  const [proDescriptionEn, setProDescriptionEn] = useState("");
  const [conDescription, setConDescription] = useState("");
  const [conDescriptionEn, setConDescriptionEn] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim() || !proDescription.trim() || !conDescription.trim()) {
      alert(t("fillRequired"));
      return;
    }

    setSubmitting(true);
    try {
      const response = await authFetch("/api/votes", {
        method: "POST",
        body: JSON.stringify({
          title: title.trim(),
          titleEn: titleEn.trim(),
          proDescription: proDescription.trim(),
          proDescriptionEn: proDescriptionEn.trim(),
          conDescription: conDescription.trim(),
          conDescriptionEn: conDescriptionEn.trim(),
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || t("publishFailed"));
      }

      const vote = await response.json();
      router.push(`/votes/${vote._id}`);
    } catch (error: any) {
      alert(error.message || t("publishFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  if (isGuest) {
    return (
      <div className="text-center py-20">
        <p className="text-gray-500 mb-4">{t("guestCannotPost")}</p>
        <p className="text-sm text-gray-400 mb-6">{t("guestPostDesc")}</p>
        <div className="flex gap-4 justify-center">
          <Link href="/login" className="text-blue-600 hover:underline">{t("loginLink")}</Link>
          <span className="text-gray-300">|</span>
          <Link href="/register" className="text-blue-600 hover:underline">{t("registerLink")}</Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Back Button */}
      <Link href="/votes" className="text-blue-600 hover:underline mb-6 inline-block">
        {t("backToVotes")}
      </Link>

      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-8">
        <h1 className="text-3xl font-bold mb-6">{t("createVote")}</h1>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Vote Question */}
          <div>
            <label className="block text-sm font-semibold mb-2">
              {t("voteQuestion")} <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("voteQuestionPlaceholder")}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          {/* Vote Question English */}
          <div>
            <label className="block text-sm font-semibold mb-2 text-gray-500">
              {t("voteQuestionEn")}
            </label>
            <input
              type="text"
              value={titleEn}
              onChange={(e) => setTitleEn(e.target.value)}
              placeholder="Enter topic in English..."
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Pro Description */}
          <div>
            <label className="block text-sm font-semibold mb-2">
              {t("proDescription")} <span className="text-red-500">*</span>
            </label>
            <textarea
              value={proDescription}
              onChange={(e) => setProDescription(e.target.value)}
              placeholder={t("proDescPlaceholder")}
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          {/* Pro Description English */}
          <div>
            <label className="block text-sm font-semibold mb-2 text-gray-500">
              {t("proDescEn")}
            </label>
            <textarea
              value={proDescriptionEn}
              onChange={(e) => setProDescriptionEn(e.target.value)}
              placeholder="Enter pro argument in English..."
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Con Description */}
          <div>
            <label className="block text-sm font-semibold mb-2">
              {t("conDescription")} <span className="text-red-500">*</span>
            </label>
            <textarea
              value={conDescription}
              onChange={(e) => setConDescription(e.target.value)}
              placeholder={t("conDescPlaceholder")}
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          {/* Con Description English */}
          <div>
            <label className="block text-sm font-semibold mb-2 text-gray-500">
              {t("conDescEn")}
            </label>
            <textarea
              value={conDescriptionEn}
              onChange={(e) => setConDescriptionEn(e.target.value)}
              placeholder="Enter con argument in English..."
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Submit Button */}
          <div className="flex gap-4">
            <button
              type="submit"
              disabled={submitting}
              className="bg-blue-600 text-white px-8 py-3 rounded-lg hover:bg-blue-700 font-bold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? t("publishing") : t("publish")}
            </button>
            <Link
              href="/votes"
              className="px-8 py-3 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 font-medium"
            >
              {t("cancelEdit")}
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
