import { spawn } from "node:child_process";
import path from "node:path";

const DEFAULT_ARCHIVE = "D:\\wendang\\IB\\May2015 papers.rar";
const DEFAULT_PAIR_MANIFEST = "data/ib/archive-manifests/may2015-core-pairs.json";
const DEFAULT_IMPORT_MANIFEST = "data/ib/archive-manifests/may2015-materials-import.json";

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    archivePath: DEFAULT_ARCHIVE,
    pairManifestPath: DEFAULT_PAIR_MANIFEST,
    importManifestPath: DEFAULT_IMPORT_MANIFEST,
    subjects: "",
    excludeSubjects: "",
    limit: "",
    shouldImport: false,
    allSubjects: false,
    requireMarkscheme: false,
    sourceSlug: "",
    limitPerSubject: "",
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--archive" && args[index + 1]) {
      options.archivePath = args[index + 1];
      index += 1;
    } else if (arg === "--pairs-out" && args[index + 1]) {
      options.pairManifestPath = args[index + 1];
      index += 1;
    } else if (arg === "--materials-out" && args[index + 1]) {
      options.importManifestPath = args[index + 1];
      index += 1;
    } else if (arg === "--subjects" && args[index + 1]) {
      options.subjects = args[index + 1];
      index += 1;
    } else if (arg === "--exclude-subjects" && args[index + 1]) {
      options.excludeSubjects = args[index + 1];
      index += 1;
    } else if (arg === "--limit" && args[index + 1]) {
      options.limit = args[index + 1];
      index += 1;
    } else if (arg === "--limit-per-subject" && args[index + 1]) {
      options.limitPerSubject = args[index + 1];
      index += 1;
    } else if (arg === "--import") {
      options.shouldImport = true;
    } else if (arg === "--all-subjects") {
      options.allSubjects = true;
    } else if (arg === "--require-markscheme") {
      options.requireMarkscheme = true;
    } else if (arg === "--source-slug" && args[index + 1]) {
      options.sourceSlug = args[index + 1];
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

function appendCommonFilters(args, options) {
  if (options.subjects) {
    args.push("--subjects", options.subjects);
  }
  if (options.excludeSubjects) {
    args.push("--exclude-subjects", options.excludeSubjects);
  }
  if (options.allSubjects) {
    args.push("--all-subjects");
  }
  if (options.limit) {
    args.push("--limit", options.limit);
  }
  if (options.limitPerSubject) {
    args.push("--limit-per-subject", options.limitPerSubject);
  }
  if (options.requireMarkscheme) {
    args.push("--require-markscheme");
  }
  return args;
}

async function main() {
  const options = parseArgs();
  assertNoMissingSpace(options.subjects, "--subjects");
  assertNoMissingSpace(options.excludeSubjects, "--exclude-subjects");
  assertNoMissingSpace(options.sourceSlug, "--source-slug");

  const scriptsDir = path.join(process.cwd(), "scripts");

  await runNodeScript(path.join(scriptsDir, "build-ib-archive-manifest.mjs"), [
    "--archive",
    options.archivePath,
    "--out",
    options.pairManifestPath,
    ...(options.subjects ? ["--subjects", options.subjects] : []),
    ...(options.excludeSubjects ? ["--exclude-subjects", options.excludeSubjects] : []),
    ...(options.allSubjects ? ["--all-subjects"] : []),
    ...(options.sourceSlug ? ["--source-slug", options.sourceSlug] : []),
  ]);

  await runNodeScript(
    path.join(scriptsDir, "extract-ib-archive-files.mjs"),
    appendCommonFilters(["--manifest", options.pairManifestPath], options)
  );

  await runNodeScript(
    path.join(scriptsDir, "build-ib-materials-from-archive-manifest.mjs"),
    appendCommonFilters(["--manifest", options.pairManifestPath, "--out", options.importManifestPath], options)
  );

  if (options.shouldImport) {
    await runNodeScript(path.join(scriptsDir, "import-ib-materials.mjs"), [options.importManifestPath]);
  } else {
    console.log("Dry run completed. Add --import to write materials to MongoDB and Zilliz.");
  }
}

main().catch((error) => {
  console.error("Failed to import IB archive:", error);
  process.exit(1);
});
