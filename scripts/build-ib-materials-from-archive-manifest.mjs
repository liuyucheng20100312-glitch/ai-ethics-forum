import fs from "node:fs/promises";
import path from "node:path";

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    manifestPath: "data/ib/archive-manifests/may2015-core-pairs.json",
    outputPath: "data/ib/archive-manifests/may2015-materials-import.json",
    limit: 0,
    limitPerSubject: 0,
    subjects: new Set(),
    excludeSubjects: new Set(),
    requireMarkscheme: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--manifest" && args[index + 1]) {
      options.manifestPath = args[index + 1];
      index += 1;
    } else if (arg === "--out" && args[index + 1]) {
      options.outputPath = args[index + 1];
      index += 1;
    } else if (arg === "--limit" && args[index + 1]) {
      options.limit = Number(args[index + 1]) || 0;
      index += 1;
    } else if (arg === "--limit-per-subject" && args[index + 1]) {
      options.limitPerSubject = Number(args[index + 1]) || 0;
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
    } else if (arg === "--require-markscheme") {
      options.requireMarkscheme = true;
    }
  }

  return options;
}

function titleFor(pair, kind) {
  const suffix = kind === "MARK_SCHEME" ? "markscheme" : "paper";
  return `${pair.session} ${pair.year} ${pair.subject} ${pair.paper} ${pair.timezone || ""} ${pair.level} ${suffix}`
    .replace(/\s+/g, " ")
    .trim();
}

function materialFromPair(pair, kind) {
  const isMarkscheme = kind === "MARK_SCHEME";
  const localFilePath = isMarkscheme ? pair.markschemeLocalFilePath : pair.paperLocalFilePath;

  return {
    materialId: `${pair.pairId}-${isMarkscheme ? "markscheme" : "paper"}`,
    subjectId: 0,
    subjectCode: pair.subjectCode,
    type: kind,
    titleEn: titleFor(pair, kind),
    titleCn: titleFor(pair, kind),
    hlSl: pair.level,
    difficulty: 3,
    year: pair.year,
    paper: pair.paper,
    timezone: pair.timezone || null,
    localFilePath,
    fileUrl: "",
    fileType: "PDF",
    sourceName: "local-ib-past-paper-archive",
    sourceUrl: "",
    tags: [
      pair.session,
      String(pair.year),
      pair.subject,
      pair.paper,
      pair.level,
      pair.timezone || "",
      isMarkscheme ? "markscheme" : "past-paper",
    ].filter(Boolean),
    topics: [],
    knowledgePointIds: [],
    knowledgePointNames: [],
    chunkSize: isMarkscheme ? 3600 : 3000,
    overlapSize: 300,
  };
}

async function main() {
  const options = parseArgs();
  const manifestPath = path.isAbsolute(options.manifestPath)
    ? options.manifestPath
    : path.join(process.cwd(), options.manifestPath);
  const outputPath = path.isAbsolute(options.outputPath)
    ? options.outputPath
    : path.join(process.cwd(), options.outputPath);
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  let pairs = manifest.pairs || [];

  if (options.subjects.size > 0) {
    pairs = pairs.filter((pair) => options.subjects.has(pair.subject));
  }
  if (options.excludeSubjects.size > 0) {
    pairs = pairs.filter((pair) => !options.excludeSubjects.has(pair.subject));
  }
  if (options.requireMarkscheme) {
    pairs = pairs.filter((pair) => pair.hasMarkscheme);
  }
  if (options.limitPerSubject > 0) {
    const subjectCounts = new Map();
    pairs = pairs.filter((pair) => {
      const count = subjectCounts.get(pair.subject) || 0;
      if (count >= options.limitPerSubject) {
        return false;
      }
      subjectCounts.set(pair.subject, count + 1);
      return true;
    });
  }
  if (options.limit > 0) {
    pairs = pairs.slice(0, options.limit);
  }

  const materials = pairs.flatMap((pair) => {
    const items = [materialFromPair(pair, "PAST_PAPER")];
    if (pair.hasMarkscheme) {
      items.push(materialFromPair(pair, "MARK_SCHEME"));
    }
    return items;
  });

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify({ materials }, null, 2), "utf8");

  console.log(
    JSON.stringify(
      {
        pairs: pairs.length,
        materials: materials.length,
        outputPath,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error("Failed to build IB materials import manifest:", error);
  process.exit(1);
});
