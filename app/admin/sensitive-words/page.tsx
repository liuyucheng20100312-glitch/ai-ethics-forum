"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "../../context/AuthContext";
import { useLanguage } from "../../context/LanguageContext";
import { isAdminUserId } from "@/lib/admin-auth";

interface SensitiveWord {
  _id: string;
  word: string;
  category: string;
  severity: "low" | "medium" | "high";
  createdAt: string;
  createdBy?: string;
}

// 检查是否是管理员
const CATEGORIES = [
  { value: "politics", label: "政治敏感", labelEn: "Politics" },
  { value: "violence", label: "暴力恐怖", labelEn: "Violence" },
  { value: "pornography", label: "色情低俗", labelEn: "Pornography" },
  { value: "gambling", label: "赌博诈骗", labelEn: "Gambling" },
  { value: "drugs", label: "毒品", labelEn: "Drugs" },
  { value: "discrimination", label: "歧视仇恨", labelEn: "Discrimination" },
  { value: "profanity", label: "脏话粗口", labelEn: "Profanity" },
  { value: "advertising", label: "广告推广", labelEn: "Advertising" },
  { value: "other", label: "其他", labelEn: "Other" },
];

const SEVERITY_OPTIONS = [
  { value: "low", label: "低", labelEn: "Low", color: "bg-green-100 text-green-700" },
  { value: "medium", label: "中", labelEn: "Medium", color: "bg-yellow-100 text-yellow-700" },
  { value: "high", label: "高", labelEn: "High", color: "bg-red-100 text-red-700" },
];

export default function SensitiveWordsPage() {
  const { user, authFetch } = useAuth();
  const { t, language } = useLanguage();

  const [words, setWords] = useState<SensitiveWord[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // 添加新词
  const [newWord, setNewWord] = useState("");
  const [newCategory, setNewCategory] = useState("other");
  const [newSeverity, setNewSeverity] = useState<"low" | "medium" | "high">("medium");
  const [adding, setAdding] = useState(false);

  // 批量导入
  const [importText, setImportText] = useState("");
  const [importCategory, setImportCategory] = useState("other");
  const [importSeverity, setImportSeverity] = useState<"low" | "medium" | "high">("medium");
  const [importing, setImporting] = useState(false);
  const [showImport, setShowImport] = useState(false);

  const isUserAdmin = isAdminUserId(user?.userId);

  useEffect(() => {
    if (isUserAdmin) fetchWords();
  }, [categoryFilter]);  // eslint-disable-line react-hooks/exhaustive-deps

  const fetchWords = async () => {
    setLoading(true);
    try {
      const url = categoryFilter === "all" ? "/api/sensitive-words" : `/api/sensitive-words?category=${categoryFilter}`;
      const response = await authFetch(url);
      const data = await response.json();
      setWords(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("获取敏感词失败:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddWord = async () => {
    if (!newWord.trim()) return;

    setAdding(true);
    try {
      const response = await authFetch("/api/sensitive-words", {
        method: "POST",
        body: JSON.stringify({
          word: newWord.trim(),
          category: newCategory,
          severity: newSeverity,
        }),
      });

      if (response.ok) {
        setNewWord("");
        fetchWords();
      } else {
        const data = await response.json();
        alert(data.error || "添加失败");
      }
    } catch (error) {
      console.error("添加失败:", error);
    } finally {
      setAdding(false);
    }
  };

  const handleImport = async () => {
    if (!importText.trim()) return;

    const words = importText.split(/[\n,，、]/).map((w) => w.trim()).filter((w) => w);
    if (words.length === 0) return;

    setImporting(true);
    try {
      const response = await authFetch("/api/sensitive-words", {
        method: "PUT",
        body: JSON.stringify({
          words,
          category: importCategory,
          severity: importSeverity,
        }),
      });

      const data = await response.json();
      alert(`导入完成：新增 ${data.addedCount} 个，跳过 ${data.skippedCount} 个已存在的`);
      setImportText("");
      setShowImport(false);
      fetchWords();
    } catch (error) {
      console.error("导入失败:", error);
    } finally {
      setImporting(false);
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return;

    if (!confirm(`确定要删除选中的 ${selectedIds.size} 个敏感词吗？`)) return;

    try {
      await authFetch("/api/sensitive-words", {
        method: "DELETE",
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      });
      setSelectedIds(new Set());
      fetchWords();
    } catch (error) {
      console.error("删除失败:", error);
    }
  };

  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredWords.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredWords.map((w) => w._id)));
    }
  };

  if (!isUserAdmin) {
    return (
      <div className="text-center py-20">
        <p className="text-gray-500">{language === "zh" ? "无权限访问此页面" : "Access denied"}</p>
        <Link href="/" className="text-blue-600 hover:underline mt-4 inline-block">{t("home")}</Link>
      </div>
    );
  }

  const filteredWords = words.filter((w) =>
    w.word.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getCategoryLabel = (cat: string) => {
    const found = CATEGORIES.find((c) => c.value === cat);
    return language === "en" ? found?.labelEn : found?.label;
  };

  const getSeverityLabel = (sev: string) => {
    const found = SEVERITY_OPTIONS.find((s) => s.value === sev);
    return language === "en" ? found?.labelEn : found?.label;
  };

  const getSeverityColor = (sev: string) => {
    const found = SEVERITY_OPTIONS.find((s) => s.value === sev);
    return found?.color || "";
  };

  return (
    <div>
      <div className="mb-6">
        <Link href="/admin" className="text-blue-600 hover:underline">
          ← {language === "zh" ? "返回管理后台" : "Back to Admin"}
        </Link>
      </div>

      <h1 className="text-3xl font-bold mb-6">
        📝 {language === "zh" ? "敏感词管理" : "Sensitive Words Management"}
      </h1>

      {/* 统计 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white dark:bg-gray-800 border rounded-lg p-4">
          <div className="text-2xl font-bold text-blue-600">{words.length}</div>
          <div className="text-sm text-gray-500">{language === "zh" ? "总词数" : "Total Words"}</div>
        </div>
        {CATEGORIES.slice(0, 3).map((cat) => (
          <div key={cat.value} className="bg-white dark:bg-gray-800 border rounded-lg p-4">
            <div className="text-2xl font-bold text-gray-700">
              {words.filter((w) => w.category === cat.value).length}
            </div>
            <div className="text-sm text-gray-500">{language === "en" ? cat.labelEn : cat.label}</div>
          </div>
        ))}
      </div>

      {/* 工具栏 */}
      <div className="bg-white dark:bg-gray-800 border rounded-lg p-4 mb-6">
        <div className="flex flex-wrap gap-4 items-center">
          {/* 分类筛选 */}
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 rounded-lg"
          >
            <option value="all">{language === "zh" ? "全部分类" : "All Categories"}</option>
            {CATEGORIES.map((cat) => (
              <option key={cat.value} value={cat.value}>
                {language === "en" ? cat.labelEn : cat.label}
              </option>
            ))}
          </select>

          {/* 搜索 */}
          <input
            type="text"
            placeholder={language === "zh" ? "搜索敏感词..." : "Search words..."}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1 min-w-[200px] px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 rounded-lg"
          />

          {/* 导入按钮 */}
          <button
            onClick={() => setShowImport(!showImport)}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
          >
            {language === "zh" ? "批量导入" : "Import"}
          </button>

          {/* 删除选中 */}
          {selectedIds.size > 0 && (
            <button
              onClick={handleDeleteSelected}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
            >
              {language === "zh" ? `删除选中 (${selectedIds.size})` : `Delete (${selectedIds.size})`}
            </button>
          )}
        </div>

        {/* 批量导入面板 */}
        {showImport && (
          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-600">
            <div className="grid md:grid-cols-3 gap-4 mb-4">
              <select
                value={importCategory}
                onChange={(e) => setImportCategory(e.target.value)}
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 rounded-lg"
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat.value} value={cat.value}>
                    {language === "en" ? cat.labelEn : cat.label}
                  </option>
                ))}
              </select>
              <select
                value={importSeverity}
                onChange={(e) => setImportSeverity(e.target.value as any)}
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 rounded-lg"
              >
                {SEVERITY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {language === "en" ? opt.labelEn : opt.label}
                  </option>
                ))}
              </select>
              <button
                onClick={handleImport}
                disabled={importing}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {importing ? (language === "zh" ? "导入中..." : "Importing...") : (language === "zh" ? "确认导入" : "Confirm Import")}
              </button>
            </div>
            <textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder={language === "zh" ? "每行一个敏感词，或用逗号分隔" : "One word per line, or comma separated"}
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 rounded-lg"
            />
          </div>
        )}
      </div>

      {/* 添加新词 */}
      <div className="bg-white dark:bg-gray-800 border rounded-lg p-4 mb-6">
        <h3 className="font-bold mb-3">{language === "zh" ? "添加新敏感词" : "Add New Word"}</h3>
        <div className="flex flex-wrap gap-2">
          <input
            type="text"
            value={newWord}
            onChange={(e) => setNewWord(e.target.value)}
            placeholder={language === "zh" ? "输入敏感词" : "Enter word"}
            className="flex-1 min-w-[200px] px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 rounded-lg"
          />
          <select
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 rounded-lg"
          >
            {CATEGORIES.map((cat) => (
              <option key={cat.value} value={cat.value}>
                {language === "en" ? cat.labelEn : cat.label}
              </option>
            ))}
          </select>
          <select
            value={newSeverity}
            onChange={(e) => setNewSeverity(e.target.value as any)}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 rounded-lg"
          >
            {SEVERITY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {language === "en" ? opt.labelEn : opt.label}
              </option>
            ))}
          </select>
          <button
            onClick={handleAddWord}
            disabled={adding || !newWord.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {adding ? (language === "zh" ? "添加中..." : "Adding...") : (language === "zh" ? "添加" : "Add")}
          </button>
        </div>
      </div>

      {/* 词库列表 */}
      {loading ? (
        <p className="text-center text-gray-500">{t("loading")}</p>
      ) : filteredWords.length === 0 ? (
        <p className="text-center text-gray-500 py-8">
          {language === "zh" ? "暂无敏感词" : "No words found"}
        </p>
      ) : (
        <div className="bg-white dark:bg-gray-800 border rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-4 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={selectedIds.size === filteredWords.length && filteredWords.length > 0}
                    onChange={toggleSelectAll}
                  />
                </th>
                <th className="px-4 py-3 text-left">{language === "zh" ? "敏感词" : "Word"}</th>
                <th className="px-4 py-3 text-left">{language === "zh" ? "分类" : "Category"}</th>
                <th className="px-4 py-3 text-left">{language === "zh" ? "等级" : "Severity"}</th>
                <th className="px-4 py-3 text-left">{language === "zh" ? "添加时间" : "Added At"}</th>
              </tr>
            </thead>
            <tbody>
              {filteredWords.map((word) => (
                <tr key={word._id} className="border-t border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700">
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(word._id)}
                      onChange={() => toggleSelect(word._id)}
                    />
                  </td>
                  <td className="px-4 py-3 font-medium">{word.word}</td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-1 bg-gray-100 dark:bg-gray-600 rounded text-sm">
                      {getCategoryLabel(word.category)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded text-sm ${getSeverityColor(word.severity)}`}>
                      {getSeverityLabel(word.severity)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {new Date(word.createdAt).toLocaleString(language === "en" ? "en-US" : "zh-CN")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
