"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "../../context/AuthContext";
import { useLanguage } from "../../context/LanguageContext";

interface Question {
  index: number;
  text: string;
  textEn: string;
  type: "single" | "multiple" | "text";
  section: string;
  options: string[];
  optionsEn: string[];
  required: boolean;
}

// 检查是否是管理员
function isAdmin(userId: string | undefined): boolean {
  return userId === "offline_admin";
}

export default function NewSurveyPage() {
  const { user } = useAuth();
  const { t, language } = useLanguage();
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [titleEn, setTitleEn] = useState("");
  const [description, setDescription] = useState("");
  const [descriptionEn, setDescriptionEn] = useState("");
  const [questions, setQuestions] = useState<Question[]>([
    { index: 0, text: "", textEn: "", type: "single", section: "", options: ["", ""], optionsEn: ["", ""], required: true },
  ]);
  const [submitting, setSubmitting] = useState(false);

  if (!isAdmin(user?.userId)) {
    return (
      <div className="text-center py-20">
        <p className="text-gray-500">{language === "zh" ? "无权限创建问卷" : "Access denied"}</p>
        <Link href="/surveys" className="text-blue-600 hover:underline mt-4 inline-block">{t("backToSurveys")}</Link>
      </div>
    );
  }

  const addQuestion = () => {
    setQuestions([
      ...questions,
      {
        index: questions.length,
        text: "",
        textEn: "",
        type: "single",
        section: "",
        options: ["", ""],
        optionsEn: ["", ""],
        required: true,
      },
    ]);
  };

  const removeQuestion = (index: number) => {
    if (questions.length <= 1) return;
    const newQuestions = questions.filter((_, i) => i !== index);
    // 重新编号
    newQuestions.forEach((q, i) => (q.index = i));
    setQuestions(newQuestions);
  };

  const updateQuestion = (index: number, field: keyof Question, value: any) => {
    const newQuestions = [...questions];
    (newQuestions[index] as any)[field] = value;
    setQuestions(newQuestions);
  };

  const addOption = (qIndex: number) => {
    const newQuestions = [...questions];
    newQuestions[qIndex].options.push("");
    newQuestions[qIndex].optionsEn.push("");
    setQuestions(newQuestions);
  };

  const removeOption = (qIndex: number, oIndex: number) => {
    const newQuestions = [...questions];
    if (newQuestions[qIndex].options.length <= 2) return;
    newQuestions[qIndex].options.splice(oIndex, 1);
    newQuestions[qIndex].optionsEn.splice(oIndex, 1);
    setQuestions(newQuestions);
  };

  const updateOption = (qIndex: number, oIndex: number, value: string, isEn: boolean) => {
    const newQuestions = [...questions];
    if (isEn) {
      newQuestions[qIndex].optionsEn[oIndex] = value;
    } else {
      newQuestions[qIndex].options[oIndex] = value;
    }
    setQuestions(newQuestions);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      alert(language === "zh" ? "请输入问卷标题" : "Please enter survey title");
      return;
    }

    // 验证问题
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!q.text.trim()) {
        alert(`${language === "zh" ? "第" : "Question "}${i + 1}${language === "zh" ? "题内容不能为空" : " cannot be empty"}`);
        return;
      }
      if (q.type !== "text") {
        const validOptions = q.options.filter((o) => o.trim());
        if (validOptions.length < 2) {
          alert(`${language === "zh" ? "第" : "Question "}${i + 1}${language === "zh" ? "题至少需要2个有效选项" : " needs at least 2 options"}`);
          return;
        }
      }
    }

    setSubmitting(true);
    try {
      const token = localStorage.getItem("ai_ethics_token");
      const response = await fetch("/api/surveys", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: title.trim(),
          titleEn: titleEn.trim(),
          description: description.trim(),
          descriptionEn: descriptionEn.trim(),
          questions: questions.map((q) => ({
            text: q.text.trim(),
            textEn: q.textEn.trim(),
            type: q.type,
            section: q.section.trim(),
            options: q.options.filter((o) => o.trim()),
            optionsEn: q.optionsEn.filter((o) => o.trim()),
            required: q.required,
          })),
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "创建失败");
      }

      const data = await response.json();
      router.push(`/surveys/${data._id}`);
    } catch (error: any) {
      alert(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      {/* Back Button */}
      <Link href="/surveys" className="text-blue-600 hover:underline mb-6 inline-block">
        {t("backToSurveys")}
      </Link>

      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-8">
        <h1 className="text-3xl font-bold mb-6">{t("newSurvey")}</h1>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Title */}
          <div>
            <label className="block text-sm font-semibold mb-2">
              {t("surveyTitle")} <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={language === "zh" ? "输入问卷标题" : "Enter survey title"}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          {/* Title English */}
          <div>
            <label className="block text-sm font-semibold mb-2 text-gray-500">
              {language === "zh" ? "问卷标题（英文）" : "Title in English"}
            </label>
            <input
              type="text"
              value={titleEn}
              onChange={(e) => setTitleEn(e.target.value)}
              placeholder="Enter title in English"
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-semibold mb-2">{t("surveyDescription")}</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={language === "zh" ? "输入问卷说明（选填）" : "Enter description (optional)"}
              rows={4}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Description English */}
          <div>
            <label className="block text-sm font-semibold mb-2 text-gray-500">
              {language === "zh" ? "问卷说明（英文）" : "Description in English"}
            </label>
            <textarea
              value={descriptionEn}
              onChange={(e) => setDescriptionEn(e.target.value)}
              placeholder="Enter description in English"
              rows={4}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <hr className="my-6" />

          {/* Questions */}
          <div className="space-y-8">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold">{t("surveyQuestions")}</h2>
              <button
                type="button"
                onClick={addQuestion}
                className="px-4 py-2 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-lg hover:bg-blue-200 dark:hover:bg-blue-900/50 font-medium"
              >
                + {t("createQuestion")}
              </button>
            </div>

            {questions.map((q, qIndex) => (
              <div key={qIndex} className="border border-gray-200 dark:border-gray-600 rounded-lg p-6 relative">
                {/* Question Number & Remove Button */}
                <div className="flex items-center justify-between mb-4">
                  <span className="font-bold text-lg">{language === "zh" ? `第 ${qIndex + 1} 题` : `Question ${qIndex + 1}`}</span>
                  {questions.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeQuestion(qIndex)}
                      className="text-red-600 hover:text-red-700 text-sm"
                    >
                      {t("removeQuestion")}
                    </button>
                  )}
                </div>

                {/* Question Text */}
                <div className="grid md:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-sm font-semibold mb-2">{t("questionText")} *</label>
                    <textarea
                      value={q.text}
                      onChange={(e) => updateQuestion(qIndex, "text", e.target.value)}
                      rows={2}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold mb-2 text-gray-500">{t("questionTextEn")}</label>
                    <textarea
                      value={q.textEn}
                      onChange={(e) => updateQuestion(qIndex, "textEn", e.target.value)}
                      rows={2}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                {/* Question Type & Section */}
                <div className="grid md:grid-cols-3 gap-4 mb-4">
                  <div>
                    <label className="block text-sm font-semibold mb-2">{language === "zh" ? "题型" : "Type"}</label>
                    <select
                      value={q.type}
                      onChange={(e) => updateQuestion(qIndex, "type", e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="single">{t("singleChoice")}</option>
                      <option value="multiple">{t("multipleChoice")}</option>
                      <option value="text">{t("textQuestion")}</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold mb-2">{t("surveySection")}</label>
                    <input
                      type="text"
                      value={q.section}
                      onChange={(e) => updateQuestion(qIndex, "section", e.target.value)}
                      placeholder={language === "zh" ? "如：基本信息" : "e.g., Basic Info"}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="flex items-center gap-4 pt-6">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={q.required}
                        onChange={(e) => updateQuestion(qIndex, "required", e.target.checked)}
                        className="w-4 h-4 text-blue-600 rounded"
                      />
                      <span>{language === "zh" ? "必答" : "Required"}</span>
                    </label>
                  </div>
                </div>

                {/* Options (for single/multiple choice) */}
                {q.type !== "text" && (
                  <div>
                    <label className="block text-sm font-semibold mb-2">{t("options")}</label>
                    <div className="space-y-2">
                      {q.options.map((opt, oIndex) => (
                        <div key={oIndex} className="grid md:grid-cols-2 gap-2">
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={opt}
                              onChange={(e) => updateOption(qIndex, oIndex, e.target.value, false)}
                              placeholder={`选项 ${String.fromCharCode(65 + oIndex)}`}
                              className="flex-1 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            {q.options.length > 2 && (
                              <button
                                type="button"
                                onClick={() => removeOption(qIndex, oIndex)}
                                className="text-red-500 hover:text-red-600 text-sm px-2"
                              >
                                ✕
                              </button>
                            )}
                          </div>
                          <input
                            type="text"
                            value={q.optionsEn[oIndex] || ""}
                            onChange={(e) => updateOption(qIndex, oIndex, e.target.value, true)}
                            placeholder={`Option ${String.fromCharCode(65 + oIndex)}`}
                            className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => addOption(qIndex)}
                      className="mt-2 text-blue-600 hover:text-blue-700 text-sm"
                    >
                      + {t("addOption")}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Submit Buttons */}
          <div className="flex gap-4 pt-6">
            <button
              type="submit"
              disabled={submitting}
              className="bg-blue-600 text-white px-8 py-3 rounded-lg hover:bg-blue-700 font-bold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? t("publishing") : t("publish")}
            </button>
            <Link
              href="/surveys"
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
