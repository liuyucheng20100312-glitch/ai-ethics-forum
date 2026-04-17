import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { inferSessionYear, isArchivePath, safeSlug } from "./lib/ib-archive-utils.mjs";

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    scanPath: "data/ib/archive-manifests/archive-scan.json",
    subjects: "",
    excludeSubjects: "",
    allSubjects: false,
    requireMarkscheme: true,
    limitArchives: 0,
    limitPerArchive: 0,
    limitPerSubject: 0,
    shouldImport: false,
    sources: "",
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--scan" && args[index + 1]) {
      options.scanPath = args[index + 1];
      index += 1;
    } else if (arg === "--subjects" && args[index + 1]) {
      options.subjects = args[index + 1];
      index += 1;
    } else if (arg === "--exclude-subjects" && args[index + 1]) {
      options.excludeSubjects = args[index + 1];
      index += 1;
    } else if (arg === "--all-subjects") {
      options.allSubjects = true;
    } else if (arg === "--no-require-markscheme") {
      options.requireMarkscheme = false;
    } else if (arg === "--limit-archives" && args[index + 1]) {
      options.limitArchives = Number(args[index + 1]) || 0;
      index += 1;
    } else if (arg === "--limit-per-archive" && args[index + 1]) {
      options.limitPerArchive = Number(args[index + 1]) || 0;
      index += 1;
    } else if (arg === "--limit-per-subject" && args[index + 1]) {
      options.limitPerSubject = Number(args[index + 1]) || 0;
      index += 1;
    } else if (arg === "--import") {
      options.shouldImport = true;
    } else if (arg === "--sources" && args[index + 1]) {
      options.sources = args[index + 1];
      index += 1;
    }
  }

  return options;
}

async function runNodeScript(scriptPath, args) {
  await new Promise((resolve, reject) => {
    const child = spawn("node", [scriptPath, ...args], {
      cwd: process.cwd(),
      stdio: "inherit",
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${path.basename(scriptPath)} exited with code ${code}`));
      }
    });
  });
}

function assertNoMissingSpace(value, optionName) {
  if (String(value || "").includes("--")) {
    throw new Error(
      `${optionName} contains "--". Did you miss a space before another option? Received: ${value}`
    );
  }
}

function looksLikeExamSource(name, fullPath, isDirectory) {
  if (/助手|zilliz|\.txt$/iu.test(name)) {
    return false;
  }

  if (isDirectory) {
    return /(may|nov|20\d{2}|试题|papers?)/iu.test(name);
  }

  return isArchivePath(fullPath) && /(may|nov|20\d{2}|试题|papers?)/iu.test(name);
}

async function discoverSources(root) {
  const entries = await fs.readdir(root, { withFileTypes: true });
  const sources = [];
  const slugCounts = new Map();

  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
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

  return sources;
}

async function resolveSourcePath(scanRoot, source) {
  if (source.path) {
    try {
      await fs.access(source.path);
      return source.path;
    } catch {
      // Fall through to live rediscovery when the stored path is stale or mis-encoded.
    }
  }

  if (!scanRoot) {
    return source.path;
  }

  const liveSources = await discoverSources(scanRoot);
  const match = liveSources.find(
    (item) =>
      item.slug === source.slug ||
      (source.year && item.year === source.year && item.session === source.session && item.name === source.name)
  );

  if (match) {
    console.log(`Resolved stale scan path for ${source.slug}: ${match.path}`);
    return match.path;
  }

  return source.path;
}

async function main() {
  const options = parseArgs();
  assertNoMissingSpace(options.sources, "--sources");
  assertNoMissingSpace(options.subjects, "--subjects");
  assertNoMissingSpace(options.excludeSubjects, "--exclude-subjects");

  const scanPath = path.isAbsolute(options.scanPath)
    ? options.scanPath
    : path.join(process.cwd(), options.scanPath);
  const scan = JSON.parse(await fs.readFile(scanPath, "utf8"));
  const scriptsDir = path.join(process.cwd(), "scripts");
  let sources = scan.sources || [];
  const selectedSources = new Set(
    options.sources
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean)
  );

  if (selectedSources.size > 0) {
    sources = sources.filter((source) => {
      const sourceName = String(source.name || "").toLowerCase();
      const sourceSlug = String(source.slug || "").toLowerCase();
      return selectedSources.has(sourceSlug) || selectedSources.has(sourceName);
    });
  }

  if (options.limitArchives > 0) {
    sources = sources.slice(0, options.limitArchives);
  }

  if (sources.length === 0) {
    console.log("No matching IB archive sources found.");
    return;
  }

  for (const source of sources) {
    const slug = source.slug || safeSlug(source.name);
    const sourcePath = await resolveSourcePath(scan.root, source);
    try {
      await fs.access(sourcePath);
    } catch {
      console.warn(`Skipping missing IB archive source ${slug}: ${sourcePath}`);
      continue;
    }

    const pairManifestPath = `data/ib/archive-manifests/${slug}-pairs.json`;
    const materialsManifestPath = `data/ib/archive-manifests/${slug}-materials.json`;
    const args = [
      "--archive",
      sourcePath,
      "--source-slug",
      slug,
      "--pairs-out",
      pairManifestPath,
      "--materials-out",
      materialsManifestPath,
    ];

    if (options.allSubjects || !options.subjects) {
      args.push("--all-subjects");
    }
    if (options.subjects) {
      args.push("--subjects", options.subjects);
    }
    if (options.excludeSubjects) {
      args.push("--exclude-subjects", options.excludeSubjects);
    }
    if (options.requireMarkscheme) {
      args.push("--require-markscheme");
    }
    if (options.limitPerArchive > 0) {
      args.push("--limit", String(options.limitPerArchive));
    }
    if (options.limitPerSubject > 0) {
      args.push("--limit-per-subject", String(options.limitPerSubject));
    }
    if (options.shouldImport) {
      args.push("--import");
    }

    console.log(`\n=== Processing ${source.name} ===`);
    await runNodeScript(path.join(scriptsDir, "import-ib-archive.mjs"), args);
  }

  if (!options.shouldImport) {
    console.log("\nRoot dry run completed. Add --import to write to MongoDB and Zilliz.");
  }
}

main().catch((error) => {
  console.error("Failed to import IB archive root:", error);
  process.exit(1);
});
