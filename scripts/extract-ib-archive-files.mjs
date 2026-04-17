import fs from "node:fs/promises";
import path from "node:path";
import { extractSourceFile } from "./lib/ib-archive-utils.mjs";

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    manifestPath: "data/ib/archive-manifests/may2015-core-pairs.json",
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

async function main() {
  const options = parseArgs();
  const manifestPath = path.isAbsolute(options.manifestPath)
    ? options.manifestPath
    : path.join(process.cwd(), options.manifestPath);
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

  const archiveMembers = [
    ...new Set(
      pairs.flatMap((pair) => [pair.paperArchivePath, pair.markschemeArchivePath].filter(Boolean))
    ),
  ];
  const sourceRoot = path.join(process.cwd(), "data", "ib", "source", manifest.sourceSlug || "archive");
  await fs.mkdir(sourceRoot, { recursive: true });

  for (const member of archiveMembers) {
    await extractSourceFile(manifest.sourcePath || manifest.archivePath, member, sourceRoot);
  }

  console.log(
    JSON.stringify(
      {
        pairs: pairs.length,
        extractedFiles: archiveMembers.length,
        targetDirectory: sourceRoot,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error("Failed to extract IB archive files:", error);
  process.exit(1);
});
