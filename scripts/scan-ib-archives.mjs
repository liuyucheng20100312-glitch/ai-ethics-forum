import fs from "node:fs/promises";
import path from "node:path";
import { inferSessionYear, isArchivePath, safeSlug } from "./lib/ib-archive-utils.mjs";
import { getIbArchiveRoot } from "./lib/ib-paths.mjs";

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    root: getIbArchiveRoot(),
    out: "data/ib/archive-manifests/archive-scan.json",
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--root" && args[index + 1]) {
      options.root = args[index + 1];
      index += 1;
    } else if (arg === "--out" && args[index + 1]) {
      options.out = args[index + 1];
      index += 1;
    }
  }

  return options;
}

function looksLikeExamSource(name, fullPath, isDirectory) {
  if (/ib助手开发|zilliz|\.txt$/i.test(name)) {
    return false;
  }

  if (isDirectory) {
    return /(may|nov|20\d{2}|试题|papers?)/i.test(name);
  }

  return isArchivePath(fullPath) && /(may|nov|20\d{2}|试题|papers?)/i.test(name);
}

async function main() {
  const options = parseArgs();
  const entries = await fs.readdir(options.root, { withFileTypes: true });
  const sources = [];
  const slugCounts = new Map();

  for (const entry of entries) {
    const fullPath = path.join(options.root, entry.name);
    if (!looksLikeExamSource(entry.name, fullPath, entry.isDirectory())) {
      continue;
    }

    const sourceInfo = inferSessionYear(fullPath);
    const baseSlug =
      sourceInfo.year || sourceInfo.session
        ? sourceInfo.slug
        : safeSlug(entry.name);
    const slugCount = slugCounts.get(baseSlug) || 0;
    slugCounts.set(baseSlug, slugCount + 1);

    sources.push({
      name: entry.name,
      path: fullPath,
      type: entry.isDirectory() ? "directory" : "archive",
      session: sourceInfo.session,
      year: sourceInfo.year,
      slug: slugCount === 0 ? baseSlug : `${baseSlug}-${slugCount + 1}`,
    });
  }

  sources.sort((left, right) => {
    if ((left.year || 0) !== (right.year || 0)) {
      return (left.year || 0) - (right.year || 0);
    }
    return left.name.localeCompare(right.name);
  });

  const outputPath = path.isAbsolute(options.out) ? options.out : path.join(process.cwd(), options.out);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify({ root: options.root, sources }, null, 2), "utf8");

  console.log(
    JSON.stringify(
      {
        root: options.root,
        sources: sources.length,
        outputPath,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error("Failed to scan IB archives:", error);
  process.exit(1);
});
