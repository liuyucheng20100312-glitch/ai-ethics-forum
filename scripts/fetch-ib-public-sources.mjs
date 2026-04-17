import fs from "node:fs/promises";
import path from "node:path";
import { loadEnvLocal } from "./lib/env.mjs";

loadEnvLocal();

const PUBLIC_SOURCES = [
  {
    sourceName: "ibo",
    sourceUrl: "https://www.ibo.org/programmes/diploma-programme/curriculum/mathematics/",
    localFilePath: "data/ib/source/ibo/dp-mathematics.html",
    materialId: "ibo-dp-mathematics-curriculum-page",
    subjectId: 0,
    subjectCode: "MAA",
    type: "SYLLABUS",
    titleEn: "DP Mathematics curriculum page",
    titleCn: "IB DP 数学课程页面",
    hlSl: "BOTH",
    difficulty: 3,
    fileType: "HTML",
    tags: ["official", "curriculum", "mathematics"],
    topics: ["course aims", "subject overview", "assessment overview"],
  },
  {
    sourceName: "ibo",
    sourceUrl: "https://www.ibo.org/programmes/diploma-programme/curriculum/sciences/physics/",
    localFilePath: "data/ib/source/ibo/dp-physics.html",
    materialId: "ibo-dp-physics-curriculum-page",
    subjectId: 0,
    subjectCode: "PHYSICS",
    type: "SYLLABUS",
    titleEn: "DP Physics curriculum page",
    titleCn: "IB DP 物理课程页面",
    hlSl: "BOTH",
    difficulty: 3,
    fileType: "HTML",
    tags: ["official", "curriculum", "physics"],
    topics: ["course aims", "syllabus overview", "practical work"],
  },
  {
    sourceName: "ibo",
    sourceUrl: "https://www.ibo.org/programmes/diploma-programme/curriculum/individuals-and-societies/economics/",
    localFilePath: "data/ib/source/ibo/dp-economics.html",
    materialId: "ibo-dp-economics-curriculum-page",
    subjectId: 0,
    subjectCode: "ECONOMICS",
    type: "SYLLABUS",
    titleEn: "DP Economics curriculum page",
    titleCn: "IB DP 经济学课程页面",
    hlSl: "BOTH",
    difficulty: 3,
    fileType: "HTML",
    tags: ["official", "curriculum", "economics"],
    topics: ["course aims", "key concepts", "assessment overview"],
  },
  {
    sourceName: "ibo",
    sourceUrl:
      "https://www.ibo.org/contentassets/5895a05412144fe890312bad52b17044/subject-brief-dp-math-analysis-and-approaches-en.pdf",
    localFilePath: "data/ib/source/ibo/subject-brief-dp-math-analysis-and-approaches-en.pdf",
    materialId: "ibo-dp-math-aa-subject-brief-2021-en",
    subjectId: 0,
    subjectCode: "MAA",
    type: "SYLLABUS",
    titleEn: "DP Mathematics: analysis and approaches subject brief",
    titleCn: "IB DP 数学：分析与方法 subject brief",
    hlSl: "BOTH",
    difficulty: 3,
    fileType: "PDF",
    tags: ["official", "subject brief", "syllabus"],
    topics: ["course aims", "assessment model", "curriculum overview"],
  },
  {
    sourceName: "ibo",
    sourceUrl:
      "https://www.ibo.org/contentassets/5895a05412144fe890312bad52b17044/subject-brief-dp-math-applications-and-interpretations-en.pdf",
    localFilePath: "data/ib/source/ibo/subject-brief-dp-math-applications-and-interpretations-en.pdf",
    materialId: "ibo-dp-math-ai-subject-brief-2021-en",
    subjectId: 0,
    subjectCode: "MAI",
    type: "SYLLABUS",
    titleEn: "DP Mathematics: applications and interpretation subject brief",
    titleCn: "IB DP 数学：应用与解释 subject brief",
    hlSl: "BOTH",
    difficulty: 3,
    fileType: "PDF",
    tags: ["official", "subject brief", "syllabus"],
    topics: ["course aims", "assessment model", "curriculum overview"],
  },
];

async function downloadSource(source) {
  const absolutePath = path.join(process.cwd(), source.localFilePath);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });

  const response = await fetch(source.sourceUrl, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Safari/537.36",
      Accept: "application/pdf,application/octet-stream,*/*",
      Referer: "https://www.ibo.org/",
    },
  });

  if (!response.ok) {
    console.warn(`Skipped ${source.sourceUrl}: ${response.status}`);
    return {
      ...source,
      skipped: true,
      skipReason: `HTTP ${response.status}`,
    };
  }

  const arrayBuffer = await response.arrayBuffer();
  await fs.writeFile(absolutePath, Buffer.from(arrayBuffer));
  return source;
}

async function main() {
  const manifestPath =
    process.argv[2] || path.join(process.cwd(), "data", "ib", "public-official-materials.json");
  const materials = [];

  for (const source of PUBLIC_SOURCES) {
    const result = await downloadSource(source);
    if (!result.skipped) {
      materials.push(result);
    }
  }

  await fs.mkdir(path.dirname(manifestPath), { recursive: true });
  await fs.writeFile(manifestPath, JSON.stringify({ materials }, null, 2), "utf8");
  console.log(`Downloaded ${materials.length} public IB source files.`);
  console.log(`Manifest written to ${manifestPath}.`);
}

main().catch((error) => {
  console.error("Failed to fetch public IB sources:", error);
  process.exit(1);
});
