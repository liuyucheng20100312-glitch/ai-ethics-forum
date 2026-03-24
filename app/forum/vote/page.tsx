"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "../../context/AuthContext";

type Option = {
  name: string;
  votes: string[];
  opinions: { user: string; text: string; createdAt: string }[];
};

type Topic = {
  _id: string;
  title: string;
  description: string;
  options: Option[];
  author: string;
  createdAt: string;
};

export default function VoteForumPage() {
  const { user } = useAuth();
  const [topics, setTopics] = useState<Topic[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newOptions, setNewOptions] = useState(["", ""]);
  const [errorMsg, setErrorMsg] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Voting state
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [opinionText, setOpinionText] = useState("");
  const [votingTopicId, setVotingTopicId] = useState<string | null>(null);

  const fetchTopics = async () => {
    try {
      const res = await fetch("/api/forum/vote");
      const data = await res.json();
      if (Array.isArray(data)) {
        setTopics(data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchTopics();
  }, []);

  const handleCreateTopic = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    const validOptions = newOptions.filter(o => o.trim() !== "");
    if (!newTitle.trim()) return setErrorMsg("标题不能为空");
    if (validOptions.length < 2) return setErrorMsg("至少提供两个选项");

    setSubmitting(true);
    try {
      const res = await fetch("/api/forum/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle, description: newDescription, options: validOptions }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || "发布失败");
      } else {
        setNewTitle("");
        setNewDescription("");
        setNewOptions(["", ""]);
        setShowCreateForm(false);
        fetchTopics();
      }
    } catch (e) {
      setErrorMsg("网络错误");
    } finally {
      setSubmitting(false);
    }
  };

  const handleVoteSubmit = async (topicId: string) => {
    if (selectedOption === null) return alert("请先选择一个选项");
    setSubmitting(true);
    try {
      const res = await fetch(`/api/forum/vote/${topicId}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ optionIdx: selectedOption, opinion: opinionText }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "投票失败");
      } else {
        setSelectedOption(null);
        setOpinionText("");
        setVotingTopicId(null);
        fetchTopics();
      }
    } catch (e) {
      alert("网络错误");
    } finally {
      setSubmitting(false);
    }
  };

  const addOptionField = () => setNewOptions([...newOptions, ""]);
  const updateOptionField = (idx: number, val: string) => {
    const updated = [...newOptions];
    updated[idx] = val;
    setNewOptions(updated);
  };

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">伦理专题投票与讨论</h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">选择立场并发表观点，探讨AI伦理难题</p>
        </div>
        {user && user.userId !== "guest" && (
          <button 
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
          >
            {showCreateForm ? "取消发布" : "发起新专题"}
          </button>
        )}
      </div>

      {showCreateForm && (
        <form onSubmit={handleCreateTopic} className="mb-8 p-6 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
          <h2 className="text-xl font-semibold mb-4 text-gray-800 dark:text-white">发布新专题</h2>
          {errorMsg && <p className="mb-4 text-red-600 text-sm font-medium">{errorMsg}</p>}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">专题标题</label>
            <input 
              type="text" 
              value={newTitle} 
              onChange={e => setNewTitle(e.target.value)}
              className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500"
              placeholder="例如：AI辅助内容是否应该享有版权？" 
            />
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">专题描述 (可选)</label>
            <textarea 
              value={newDescription} 
              onChange={e => setNewDescription(e.target.value)}
              className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500 min-h-[80px]"
              placeholder="补充说明相关背景信息..."
            />
          </div>
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">投票选项</label>
            {newOptions.map((opt, idx) => (
              <input 
                key={idx}
                type="text" 
                value={opt} 
                onChange={e => updateOptionField(idx, e.target.value)}
                className="w-full mb-2 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500"
                placeholder={`选项 ${idx + 1}`} 
              />
            ))}
            <button type="button" onClick={addOptionField} className="text-sm text-blue-600 dark:text-blue-400 hover:underline mt-1">
              + 添加选项
            </button>
          </div>
          <button 
            type="submit" 
            disabled={submitting}
            className="w-full py-2 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 transition disabled:opacity-50"
          >
            {submitting ? "提交中..." : "确认发布"}
          </button>
        </form>
      )}

      <div className="space-y-8">
        {topics.length === 0 ? (
          <p className="text-center text-gray-500 dark:text-gray-400 py-10">暂无投票专题，快来发起第一个吧！</p>
        ) : (
          topics.map(topic => {
            const hasVoted = topic.options.some(opt => opt.votes.includes(user?.username || ""));
            const totalVotes = topic.options.reduce((sum, opt) => sum + opt.votes.length, 0);

            return (
              <div key={topic._id} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
                <div className="p-6 border-b border-gray-100 dark:border-gray-700">
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">{topic.title}</h2>
                  {topic.description && <p className="text-gray-600 dark:text-gray-300 mb-4 whitespace-pre-wrap">{topic.description}</p>}
                  <div className="text-sm text-gray-500 flex items-center space-x-4">
                    <span>发起人: {topic.author}</span>
                    <span>{new Date(topic.createdAt).toLocaleString()}</span>
                    <span className="font-medium text-blue-600 dark:text-blue-400">共 {totalVotes} 人参与投票</span>
                  </div>
                </div>

                <div className="bg-gray-50 dark:bg-gray-800/50 p-6">
                  {/* Voting Area */}
                  {user && user.userId !== "guest" && !hasVoted && votingTopicId !== topic._id && (
                    <button 
                      onClick={() => setVotingTopicId(topic._id)}
                      className="mb-6 px-4 py-2 border border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400 rounded-lg hover:bg-blue-50 dark:hover:bg-gray-700 transition"
                    >
                      参与投票并发表观点
                    </button>
                  )}

                  {votingTopicId === topic._id && (
                    <div className="mb-8 bg-white dark:bg-gray-800 p-4 rounded-lg border border-blue-200 dark:border-blue-800 shadow-sm">
                      <h3 className="font-semibold text-gray-800 dark:text-white mb-3">你支持哪一方？</h3>
                      <div className="space-y-2 mb-4">
                        {topic.options.map((opt, idx) => (
                          <label key={idx} className="flex items-center space-x-3 p-2 rounded cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700">
                            <input 
                              type="radio" 
                              name={`vote-${topic._id}`} 
                              checked={selectedOption === idx}
                              onChange={() => setSelectedOption(idx)}
                              className="text-blue-600 w-4 h-4"
                            />
                            <span className="text-gray-800 dark:text-gray-200">{opt.name}</span>
                          </label>
                        ))}
                      </div>
                      <textarea 
                        value={opinionText}
                        onChange={e => setOpinionText(e.target.value)}
                        placeholder="（可选）说明你为什么支持这个观点..."
                        className="w-full px-3 py-2 mb-3 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white text-sm min-h-[60px]"
                      />
                      <div className="flex space-x-3">
                        <button 
                          onClick={() => handleVoteSubmit(topic._id)}
                          disabled={submitting}
                          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium disabled:opacity-50"
                        >
                          {submitting ? "提交中..." : "确认提交"}
                        </button>
                        <button 
                          onClick={() => { setVotingTopicId(null); setSelectedOption(null); setOpinionText(""); }}
                          className="px-4 py-2 bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 text-sm font-medium"
                        >
                          取消
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Results & Opinions */}
                  <div className="space-y-6">
                    {topic.options.map((opt, idx) => {
                      const percentage = totalVotes > 0 ? Math.round((opt.votes.length / totalVotes) * 100) : 0;
                      return (
                        <div key={idx} className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm border border-gray-100 dark:border-gray-700">
                          <div className="flex justify-between items-center mb-2">
                            <h4 className="font-medium text-gray-900 dark:text-white">{opt.name}</h4>
                            <span className="text-sm font-semibold text-gray-600 dark:text-gray-300">
                              {opt.votes.length} 票 ({percentage}%)
                            </span>
                          </div>
                          
                          {/* Progress bar */}
                          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5 mb-4">
                            <div className="bg-blue-500 h-2.5 rounded-full" style={{ width: `${percentage}%` }}></div>
                          </div>

                          {/* Opinions */}
                          <div className="mt-4">
                            <h5 className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400 mb-2 border-b border-gray-100 dark:border-gray-700 pb-1">支持该选项的观点：</h5>
                            <ul className="space-y-3">
                              {opt.opinions.filter(o => o && o.text).length === 0 ? (
                                <li className="text-sm text-gray-400 italic">暂无具体观点留言。</li>
                              ) : (
                                opt.opinions.filter(o => o && o.text).map((opinion, oIdx) => (
                                  <li key={oIdx} className="text-sm bg-gray-50 dark:bg-gray-700/50 p-3 rounded">
                                    <div className="font-medium text-gray-800 dark:text-gray-200 mb-1 flex items-center">
                                      <span className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 text-xs px-2 py-0.5 rounded-full mr-2">
                                        {opinion.user}
                                      </span>
                                    </div>
                                    <p className="text-gray-600 dark:text-gray-300 leading-relaxed">{opinion.text}</p>
                                  </li>
                                ))
                              )}
                            </ul>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

