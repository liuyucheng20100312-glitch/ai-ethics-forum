import fs from "node:fs/promises";
import path from "node:path";
import { parseUploadedStudyExam } from "../lib/study-exam-parser";

const files = [];
for (const name of ["1.jpg", "2.jpg", "3.jpg", "4.jpg", "5.jpg"]) {
  const full = path.join("D:/wendang/IB试卷/数学", name);
  const buffer = await fs.readFile(full);
  files.push(new File([buffer], name, { type: "image/jpeg" }));
}

const startedAt = Date.now();
const result = await parseUploadedStudyExam(files, {
  title: "",
  subject: "",
  grade: "",
  examDate: new Date().toISOString(),
});
console.log(JSON.stringify({
  durationMs: Date.now() - startedAt,
  parserMode: result.parserMode,
  ocrStatus: result.ocrStatus,
  title: result.title,
  subject: result.subject,
  grade: result.grade,
  rawTextLength: result.rawText.length,
  questionCount: result.questions.length,
  questions: result.questions.slice(0, 2),
  tags: result.tags,
}, null, 2));
