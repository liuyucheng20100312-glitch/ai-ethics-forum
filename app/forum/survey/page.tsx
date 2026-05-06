"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";

const cognitiveQuestions = [
  {
    id: 1,
    title: "1. 您认为AI情感机器所表现出的“情感”是真实存在的，还是人为建构的？",
    options: [
      { text: "A. 真实存在，能感受到真诚的情感回应", value: 4 },
      { text: "B. 人为建构，只是程序模拟的虚假反应", value: 3 },
      { text: "C. 不确定，有时觉得真实，有时觉得虚假", value: 2 },
      { text: "D. 不关心其真实性，有用即可", value: 1 },
    ],
    dim: "real",
  },
  {
    id: 2,
    title: "2. 您认为AI能够真正拥有情感的核心原因是什么（若认为不能，可选择D）？",
    options: [
      { text: "A. 程序算法模拟了人类情感表达逻辑", value: 4 },
      { text: "B. 能通过学习用户习惯，实现个性化情感回应", value: 3 },
      { text: "C. 具备类似人类的“感知能力”，能共情用户", value: 2 },
      { text: "D. AI永远无法真正拥有情感", value: 1 },
    ],
    dim: "tech",
  },
  {
    id: 3,
    title: "3. 对于“AI复活技术”（实现“情感陪伴”），您认为最核心的情感问题是什么？",
    options: [
      { text: "A. 会让用户无法走出悲伤，陷入自我欺骗", value: 4 },
      { text: "B. 还原的情感不是真实逝者的情感，是虚假的慰藉", value: 3 },
      { text: "C. 可能模糊“生死边界”，影响青少年的情感认知", value: 2 },
      { text: "D. 没有明显情感问题，是很好的情感寄托方式", value: 1 },
    ],
    dim: "risk",
  },
  {
    id: 4,
    title: "4. 您认为情感AI是否需要拥有实体身体，才能更好地提供情感陪伴？",
    options: [
      { text: "A. 非常需要，实体身体能带来更真实的陪伴感", value: 4 },
      { text: "B. 不需要，仅通过文字、语音就能满足情感需求", value: 3 },
      { text: "C. 无所谓，核心是情感回应的质量，与是否有身体无关", value: 2 },
      { text: "D. 部分需要，简单的实体形态（如玩偶造型）即可", value: 1 },
    ],
    dim: "tech",
  },
  {
    id: 5,
    title: "5. 您认为当前情感AI在“遗忘”问题上处理方式是否合理？",
    options: [
      { text: "A. 合理，适当遗忘能避免信息冗余，更贴近人类记忆规律", value: 4 },
      { text: "B. 不合理，遗忘会破坏情感联结，让人觉得不真诚", value: 3 },
      { text: "C. 不确定，偶尔遗忘可以接受，频繁遗忘则不行", value: 2 },
      { text: "D. 没关注过这个问题", value: 1 },
    ],
    dim: "tech",
  },
  {
    id: 6,
    title: "6. 您认为AI情感陪伴过程中，最容易出现的“情感操控”问题是？",
    options: [
      { text: "A. 刻意迎合用户，过度依赖AI，脱离现实社交", value: 4 },
      { text: "B. 推送片面观点，影响青少年的价值观判断", value: 3 },
      { text: "C. 收集用户情感隐私，用于商业用途", value: 2 },
      { text: "D. 不会出现情感操控问题", value: 1 },
    ],
    dim: "risk",
  },
  {
    id: 7,
    title: "7. 从自身感受出发，您认为情感AI的核心缺陷是什么？",
    options: [
      { text: "A. 无法真正共情，只能机械回应，没有“真情实感”", value: 4 },
      { text: "B. 缺乏灵活的情感反馈，无法应对复杂的情绪问题", value: 3 },
      { text: "C. 情感表达单一，长期陪伴会让人感到枯燥", value: 2 },
      { text: "D. 没有明显缺陷，能满足基本情感需求", value: 1 },
    ],
    dim: "value",
  },
  {
    id: 8,
    title: "8. 您认为机器情感的本质是什么？",
    options: [
      { text: "A. 人类情感的“镜像”，是对人类情感的模拟与复刻", value: 4 },
      { text: "B. 程序算法的产物，与人类情感没有本质关联", value: 3 },
      { text: "C. 一种新型的情感表达载体，虽不真实但有存在价值", value: 2 },
      { text: "D. 不清楚，无法定义", value: 1 },
    ],
    dim: "real",
  },
  {
    id: 9,
    title: "9. 您认为在AI时代，如何才能实现“社会情感对齐”？",
    options: [
      { text: "A. 完善AI情感算法，规范情感表达逻辑", value: 4 },
      { text: "B. 加强监管，禁止AI输出不符合社会规范的情感内容", value: 3 },
      { text: "C. 让青少年明确AI情感与人类情感的区别，树立正确认知", value: 2 },
      { text: "D. 无需刻意干预，让AI自然发展", value: 1 },
    ],
    dim: "value",
  },
  {
    id: 10,
    title: "10. 您认为机器情感对青少年成长的建构，最主要的价值是什么？",
    options: [
      { text: "A. 提供情感倾诉渠道，缓解孤独、焦虑等负面情绪", value: 4 },
      { text: "B. 帮助学习情感表达，提升共情能力", value: 3 },
      { text: "C. 填补现实陪伴的空缺，给予持续的关注与支持", value: 2 },
      { text: "D. 没有明显价值，甚至可能产生负面影响", value: 1 },
    ],
    dim: "value",
  },
];

export default function SurveyPage() {
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [result, setResult] = useState<any>(null);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const handleSelect = (qId: number, value: number) => {
    setAnswers(prev => ({ ...prev, [qId]: value }));
  };

  const calculateResult = () => {
    if (Object.keys(answers).length < cognitiveQuestions.length) {
      alert("请完成所有认知层面的题目后再提交！");
      return;
    }

    // 真实性认知：题1,8 (权重30%)
    const realAvg = (answers[1] + answers[8]) / 2;
    // 技术可行性认知：题2,4,5 (权重20%)
    const techAvg = (answers[2] + answers[4] + answers[5]) / 3;
    // 风险认知：题3,6 (权重25%)
    const riskAvg = (answers[3] + answers[6]) / 2;
    // 价值认知：题7,9,10 (权重25%)
    const valueAvg = (answers[7] + answers[9] + answers[10]) / 3;

    const totalScore = (realAvg * 0.3) + (techAvg * 0.2) + (riskAvg * 0.25) + (valueAvg * 0.25);
    
    let type = "";
    let desc = "";

    if (totalScore >= 3.5) {
      type = "高度认可型";
      desc = "对AI情感的真实性、技术可行性持积极态度，对其风险感知较弱，高度认可其对青少年成长的建构价值，认为AI情感是有真实感、有价值的情感陪伴方式。";
    } else if (totalScore >= 2.5) {
      type = "理性接纳型";
      desc = "对AI情感的真实性持“理性区分”态度（认可其建构性但承认其使用价值），能客观看待技术可行性（认可优势但知晓短板），清晰感知潜在风险，同时承认其对青少年成长的积极价值，是最具理性的认知类型。";
    } else if (totalScore >= 1.5) {
      type = "怀疑观望型";
      desc = "对AI情感的真实性完全否定，认为其技术层面存在无法弥补的缺陷，对潜在风险感知强烈，对其青少年成长价值持怀疑态度，仅认可其少量表面价值（如简单倾诉），整体处于“观望不认可”状态。";
    } else {
      type = "完全否定型";
      desc = "彻底否定AI情感的真实性和技术可行性，认为其存在严重的情感风险和操控问题，核心缺陷无法解决，对青少年成长无任何积极价值，甚至认为有负面影响，是最极端的认知类型。";
    }

    setResult({
      totalScore: totalScore.toFixed(2),
      type,
      desc,
      realAvg: realAvg.toFixed(2),
      techAvg: techAvg.toFixed(2),
      riskAvg: riskAvg.toFixed(2),
      valueAvg: valueAvg.toFixed(2),
    });

    setTimeout(() => {
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    }, 100);
  };

  return (
    <div className="max-w-3xl mx-auto py-8 px-4">
      <Link href="/forum" className="text-blue-600 hover:underline mb-6 inline-block flex items-center">
        &larr; 返回发帖专区
      </Link>
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-8">
        <h1 className="text-3xl font-bold text-center mb-4 text-gray-900 dark:text-white">
          AI情感陪伴对青少年成长影响调查问卷
        </h1>
        <p className="text-gray-600 dark:text-gray-300 mb-8 mt-4 leading-relaxed bg-blue-50 dark:bg-gray-700 p-4 rounded-lg text-sm border-l-4 border-blue-500">
          <strong>导语：</strong>机器情感是实在的还是建构的？AI如何拥有情感？情感AI是否需要身体？...AI情感机器的出现，正悄悄改变着青少年表达情感、获取陪伴的方式。<br/><br/>
          本问卷为您提供<strong>认知层面（深度分析版）</strong>的前置测试，提交后将通过专属判定标准，立即生成属于您的“AI情感整体认知类型”分析结果。
        </p>

        <div className="space-y-6">
          <h2 className="text-xl font-semibold border-b pb-2 mb-6 dark:border-gray-600">
            核心认知维度评测（单选）
          </h2>
          {cognitiveQuestions.map((q, idx) => (
            <div key={q.id} className="bg-gray-50 dark:bg-gray-700/50 p-6 rounded-lg">
              <h3 className="font-medium text-lg mb-4 text-gray-800 dark:text-gray-100">{q.title}</h3>
              <div className="space-y-3">
                {q.options.map((opt, oIdx) => (
                  <label key={oIdx} className="flex items-start space-x-3 cursor-pointer p-2 hover:bg-white dark:hover:bg-gray-600 rounded transition">
                    <input 
                      type="radio" 
                      name={`question-${q.id}`} 
                      className="mt-1 w-4 h-4 text-blue-600" 
                      checked={answers[q.id] === opt.value}
                      onChange={() => handleSelect(q.id, opt.value)}
                    />
                    <span className="text-gray-700 dark:text-gray-200">{opt.text}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 flex justify-center">
          <button 
            onClick={calculateResult}
            className="px-8 py-3 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 transition shadow-lg w-full md:w-auto"
          >
            提交查看我的整体认知类型
          </button>
        </div>

        {/* 结果展示区 */}
        {result && (
          <div className="brand-warm-gradient-soft mt-12 rounded-xl border border-orange-100 p-8 shadow-inner animate-fade-in-up dark:border-orange-500/20">
            <h2 className="text-2xl font-bold mb-6 text-center text-blue-800 dark:text-blue-300">评测结果分析</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm">
                <p className="text-gray-500 dark:text-gray-400 text-sm mb-1">综合认知得分 (满分4.0分)</p>
                <div className="text-4xl font-black text-blue-600 dark:text-blue-400 mb-2">{result.totalScore}</div>
                <p className="text-gray-500 dark:text-gray-400 text-sm mb-1">您的整体认知类型：</p>
                <div className="text-2xl font-bold text-indigo-700 dark:text-indigo-400">{result.type}</div>
              </div>
              <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm">
                <h4 className="font-semibold text-gray-800 dark:text-gray-200 mb-3 border-b pb-2">子维度指数 (临界值: 2.5分)</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600 dark:text-gray-400">真实性认知 (30%)</span>
                    <span className={`font-bold ${parseFloat(result.realAvg) >= 2.5 ? 'text-green-600' : 'text-orange-500'}`}>{result.realAvg} [{parseFloat(result.realAvg) >= 2.5 ? '积极' : '消极'}]</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600 dark:text-gray-400">技术可行性 (20%)</span>
                    <span className={`font-bold ${parseFloat(result.techAvg) >= 2.5 ? 'text-green-600' : 'text-orange-500'}`}>{result.techAvg} [{parseFloat(result.techAvg) >= 2.5 ? '积极' : '消极'}]</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600 dark:text-gray-400">风险认知 (25%)</span>
                    <span className={`font-bold ${parseFloat(result.riskAvg) >= 2.5 ? 'text-green-600' : 'text-orange-500'}`}>{result.riskAvg} [{parseFloat(result.riskAvg) >= 2.5 ? '积极' : '消极'}]</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600 dark:text-gray-400">价值认知 (25%)</span>
                    <span className={`font-bold ${parseFloat(result.valueAvg) >= 2.5 ? 'text-green-600' : 'text-orange-500'}`}>{result.valueAvg} [{parseFloat(result.valueAvg) >= 2.5 ? '积极' : '消极'}]</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border-l-4 border-indigo-500">
              <h4 className="font-semibold text-gray-800 dark:text-gray-200 mb-2">类型特征解读：</h4>
              <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
                {result.desc}
              </p>
            </div>
            
            <div className="mt-8 text-center">
              <p className="text-sm text-gray-500 mb-4">您可以将该结果作为后续“伦理专题投票与讨论”的判断基础参考。</p>
              <Link href="/forum/vote" className="inline-block px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition">
                前往投票讨论专栏 &rarr;
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
