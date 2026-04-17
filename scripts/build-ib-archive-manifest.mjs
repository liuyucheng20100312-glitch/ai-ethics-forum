import fs from "node:fs/promises";
import path from "node:path";
import {
  FOREIGN_LANGUAGE_PATTERN,
  inferLevel,
  inferPaper,
  inferSessionYear,
  inferSubject,
  inferSubjectCode,
  inferTimezone,
  isIgnoredSourcePath,
  isNestedArchiveMemberPath,
  listSourceFiles,
  normalizePairKey,
  safeSlug,
  splitNestedArchiveMemberPath,
  toMaterializedSourcePath,
} from "./lib/ib-archive-utils.mjs";

const DEFAULT_ARCHIVE = "D:\\wendang\\IB\\May2015 papers.rar";
const DEFAULT_OUTPUT = "data/ib/archive-manifests/may2015-core-pairs.json";
const CORE_SUBJECTS = new Set(["Mathematics", "Physics", "Chemistry", "Biology", "Economics"]);

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    archivePath: DEFAULT_ARCHIVE,
    outputPath: DEFAULT_OUTPUT,
    subjects: CORE_SUBJECTS,
    excludeSubjects: new Set(),
    allSubjects: false,
    sourceSlug: "",
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--archive" && args[index + 1]) {
      options.archivePath = args[index + 1];
      index += 1;
    } else if (arg === "--out" && args[index + 1]) {
      options.outputPath = args[index + 1];
      index += 1;
    } else if (arg === "--subjects" && args[index + 1]) {
      options.subjects = new Set(
        args[index + 1]
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean)
      );
      index += 1;
    } else if (arg === "--exclude-subjects" && args[index + 1]) {
      options.excludeSubjects = new Set(
        args[index + 1]
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean)
      );
      index += 1;
    } else if (arg === "--all-subjects") {
      options.allSubjects = true;
    } else if (arg === "--source-slug" && args[index + 1]) {
      options.sourceSlug = args[index + 1];
      index += 1;
    }
  }

  return options;
}

function toMaterialId(pathName, suffix) {
  return `${safeSlug(pathName.replace(/\.pdf$/i, ""))}-${suffix}`;
}

function toLocalExtractPath(sourceInfo, archivePathName) {
  return path.join("data", "ib", "source", sourceInfo.slug, toMaterializedSourcePath(archivePathName));
}

function inferSessionYearFromMemberPath(memberPath, fallback) {
  const normalized = memberPath.replace(/\\/g, "/");
  const yearMatch = normalized.match(/(?:^|[^0-9])(20\d{2})(?:[^0-9]|$)/);
  const sessionMatch = normalized.match(/(?:^|[^a-z])(may|nov)(?:[^a-z]|$)/i);
  const sourceInfo = inferSessionYear(memberPath);

  return {
    year: yearMatch ? Number(yearMatch[1]) : sourceInfo.year || fallback.year,
    session: sessionMatch
      ? sessionMatch[1].toLowerCase() === "may"
        ? "May"
        : "Nov"
      : sourceInfo.session || fallback.session,
  };
}

function normalizeArchivePairKey(effectivePath) {
  return normalizePairKey(effectivePath)
    .replace(/(^|\/)(examination|markscheme)(\/|$)/gi, "$1assessment$3")
    .replace(/\/+/g, "/");
}

function buildEntry(pathName) {
  const nested = splitNestedArchiveMemberPath(pathName);
  const effectivePath = nested ? nested.memberPath : pathName;
  const fileName = path.basename(effectivePath);
  const subject = inferSubject(fileName);
  const paper = inferPaper(fileName);
  const level = inferLevel(fileName);
  const timezone = inferTimezone(fileName);
  const isMarkscheme = /markscheme/i.test(effectivePath);

  return {
    archivePath: pathName,
    effectivePath,
    fileName,
    group: effectivePath.split("/")[1] || "",
    subject,
    subjectCode: inferSubjectCode(subject),
    paper,
    level,
    timezone,
    isMarkscheme,
    pairKey: normalizeArchivePairKey(effectivePath),
    isForeignLanguage: FOREIGN_LANGUAGE_PATTERN.test(fileName),
    isNestedArchiveMember: isNestedArchiveMemberPath(pathName),
  };
}

function buildManifest(entries, subjects, excludeSubjects, allSubjects, sourceInfo, sourcePath) {
  const filteredCandidates = entries.filter(
    (entry) =>
      entry.archivePath.toLowerCase().endsWith(".pdf") &&
      !isIgnoredSourcePath(entry.archivePath) &&
      !entry.isForeignLanguage &&
      (allSubjects || subjects.has(entry.subject)) &&
      !excludeSubjects.has(entry.subject)
  );
  const candidateByKey = new Map();

  for (const candidate of filteredCandidates) {
    const dedupeKey = `${candidate.subject}::${candidate.pairKey}::${candidate.isMarkscheme ? "M" : "P"}`;
    const existing = candidateByKey.get(dedupeKey);
    if (!existing) {
      candidateByKey.set(dedupeKey, candidate);
      continue;
    }

    if (existing.isNestedArchiveMember && !candidate.isNestedArchiveMember) {
      candidateByKey.set(dedupeKey, candidate);
    }
  }

  const candidates = [...candidateByKey.values()];
  const papers = candidates.filter((entry) => !entry.isMarkscheme);
  const markschemes = new Map(
    candidates.filter((entry) => entry.isMarkscheme).map((entry) => [entry.pairKey, entry])
  );

  const pairs = papers.map((paper) => {
    const markscheme = markschemes.get(paper.pairKey) || null;
    const pairSessionYear = inferSessionYearFromMemberPath(paper.effectivePath, sourceInfo);
    return {
      pairId: toMaterialId(paper.archivePath, "pair"),
      year: pairSessionYear.year,
      session: pairSessionYear.session,
      subject: paper.subject,
      subjectCode: paper.subjectCode,
      paper: paper.paper,
      level: paper.level,
      timezone: paper.timezone,
      group: paper.group,
      paperArchivePath: paper.archivePath,
      markschemeArchivePath: markscheme?.archivePath || "",
      paperLocalFilePath: toLocalExtractPath(sourceInfo, paper.archivePath),
      markschemeLocalFilePath: markscheme ? toLocalExtractPath(sourceInfo, markscheme.archivePath) : "",
      hasMarkscheme: Boolean(markscheme),
    };
  });

  const summary = {
    totalPairs: pairs.length,
    pairsWithMarkscheme: pairs.filter((pair) => pair.hasMarkscheme).length,
    pairsWithoutMarkscheme: pairs.filter((pair) => !pair.hasMarkscheme).length,
    bySubject: [...new Set(pairs.map((pair) => pair.subject))].sort().map((subject) => ({
      subject,
      pairs: pairs.filter((pair) => pair.subject === subject).length,
      pairsWithMarkscheme: pairs.filter((pair) => pair.subject === subject && pair.hasMarkscheme).length,
    })),
  };

  return {
    sourcePath,
    sourceSlug: sourceInfo.slug,
    generatedAt: new Date().toISOString(),
    filters: {
      subjects: [...subjects],
      excludeSubjects: [...excludeSubjects],
      allSubjects,
      language: "English or language-neutral only",
    },
    summary,
    pairs,
  };
}

async function main() {
  const options = parseArgs();
  const archiveItems = await listSourceFiles(options.archivePath);
  const sourceInfo = inferSessionYear(options.archivePath);
  if (options.sourceSlug) {
    sourceInfo.slug = options.sourceSlug;
  }
  const entries = archiveItems.map(buildEntry);
  const manifest = buildManifest(
    entries,
    options.subjects,
    options.excludeSubjects,
    options.allSubjects,
    sourceInfo,
    options.archivePath
  );

  const outputPath = path.isAbsolute(options.outputPath)
    ? options.outputPath
    : path.join(process.cwd(), options.outputPath);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(manifest, null, 2), "utf8");

  console.log(JSON.stringify(manifest.summary, null, 2));
  console.log(`Manifest written to ${outputPath}.`);
}

main().catch((error) => {
  console.error("Failed to build IB archive manifest:", error);
  process.exit(1);
});
