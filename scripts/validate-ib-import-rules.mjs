import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

const DEFAULT_SCAN_PATH = "data/ib/archive-manifests/archive-scan.json";
const DEFAULT_SUBJECTS = "Mathematics,Physics,Chemistry";
const DEFAULT_SAMPLE_LIMIT_PER_SUBJECT = 1;

const RULE_CASES = [
  {
    id: "legacy-2001-2008",
    label: "2001-2008 legacy folder",
    sourceSlug: "session2001",
    requireMarkscheme: false,
    expectedMinPairs: 1,
    notes: "Legacy folder; paper-only tolerant.",
  },
  {
    id: "paper-only-2011",
    label: "2011 paper-only tolerant",
    sourceSlug: "may2011",
    requireMarkscheme: false,
    expectedMinPairs: 1,
    notes: "Older folder naming, usually no complete markscheme pairing.",
  },
  {
    id: "paper-only-2013",
    label: "2013 paper-only tolerant",
    sourceSlug: "nov2013",
    requireMarkscheme: false,
    expectedMinPairs: 1,
    notes: "No 'papers' suffix in folder name; paper-only tolerant.",
  },
  {
    id: "markscheme-2014",
    label: "2014 with markscheme pairing",
    sourceSlug: "may2014",
    requireMarkscheme: true,
    expectedMinPairs: 1,
    notes: "Pre-2015 but should still validate markscheme pairing.",
  },
  {
    id: "standard-2015",
    label: "2015 standard folder",
    sourceSlug: "may2015",
    requireMarkscheme: true,
    expectedMinPairs: 1,
    notes: "Baseline modern standard.",
  },
  {
    id: "uppercase-2018",
    label: "2018 uppercase folder",
    sourceSlug: "may2018",
    requireMarkscheme: true,
    expectedMinPairs: 1,
    notes: "Uppercase folder naming variant.",
  },
  {
    id: "special-2019-may",
    label: "2019 May sparse/special structure",
    sourceSlug: "may2019",
    requireMarkscheme: true,
    expectedMinPairs: 0,
    allowZeroPairs: true,
    notes: "Known structure-difference year; zero pairs is diagnostic not immediate failure.",
  },
  {
    id: "sparse-2019-nov",
    label: "2019 Nov sparse subset",
    sourceSlug: "nov2019",
    requireMarkscheme: true,
    expectedMinPairs: 1,
    notes: "Sparse but valid modern sample.",
  },
  {
    id: "session-bundle-2021",
    label: "2021 session bundle",
    sourceSlug: "session2021",
    requireMarkscheme: true,
    expectedMinPairs: 1,
    notes: "Year-only bundle structure.",
  },
  {
    id: "session-bundle-2025",
    label: "2025 session bundle",
    sourceSlug: "session2025",
    requireMarkscheme: true,
    expectedMinPairs: 1,
    notes: "Latest year-only bundle structure.",
  },
];

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    scanPath: DEFAULT_SCAN_PATH,
    subjects: DEFAULT_SUBJECTS,
    sampleLimitPerSubject: DEFAULT_SAMPLE_LIMIT_PER_SUBJECT,
    out: "",
    cases: "",
    shouldImportSample: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--scan" && args[index + 1]) {
      options.scanPath = args[index + 1];
      index += 1;
    } else if (arg === "--subjects" && args[index + 1]) {
      options.subjects = args[index + 1];
      index += 1;
    } else if (arg === "--sample-limit-per-subject" && args[index + 1]) {
      options.sampleLimitPerSubject = Number(args[index + 1]) || DEFAULT_SAMPLE_LIMIT_PER_SUBJECT;
      index += 1;
    } else if (arg === "--out" && args[index + 1]) {
      options.out = args[index + 1];
      index += 1;
    } else if (arg === "--cases" && args[index + 1]) {
      options.cases = args[index + 1];
      index += 1;
    } else if (arg === "--import-sample") {
      options.shouldImportSample = true;
    }
  }

  return options;
}

function csvToSet(value) {
  return new Set(
    String(value || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
  );
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

function filterPairs(pairs, subjects, requireMarkscheme) {
  let filtered = Array.isArray(pairs) ? [...pairs] : [];

  if (subjects.size > 0) {
    filtered = filtered.filter((pair) => subjects.has(pair.subject));
  }

  if (requireMarkscheme) {
    filtered = filtered.filter((pair) => pair.hasMarkscheme);
  }

  return filtered;
}

function summarizeMaterials(materials) {
  const list = Array.isArray(materials) ? materials : [];
  const byType = new Map();

  for (const material of list) {
    const key = String(material.type || "UNKNOWN");
    byType.set(key, (byType.get(key) || 0) + 1);
  }

  return {
    count: list.length,
    byType: Object.fromEntries([...byType.entries()].sort((left, right) => left[0].localeCompare(right[0]))),
  };
}

function buildStatus(ruleCase, filteredPairs, sampleMaterials) {
  if (filteredPairs.length < ruleCase.expectedMinPairs) {
    return "fail";
  }

  if (ruleCase.allowZeroPairs && filteredPairs.length === 0) {
    return "warn";
  }

  if (filteredPairs.length > 0 && sampleMaterials.length === 0) {
    return "fail";
  }

  return "pass";
}

async function main() {
  const options = parseArgs();
  const scanPath = path.isAbsolute(options.scanPath)
    ? options.scanPath
    : path.join(process.cwd(), options.scanPath);
  const scan = JSON.parse(await fs.readFile(scanPath, "utf8"));
  const selectedCaseIds = csvToSet(options.cases);
  const selectedSubjects = csvToSet(options.subjects);
  const cases = RULE_CASES.filter((ruleCase) => selectedCaseIds.size === 0 || selectedCaseIds.has(ruleCase.id));
  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  const reportRoot = options.out
    ? path.isAbsolute(options.out)
      ? options.out
      : path.join(process.cwd(), options.out)
    : path.join(process.cwd(), "data", "ib", "reports", `import-rule-validation-${runId}`);
  const scriptsDir = path.join(process.cwd(), "scripts");
  const sourceBySlug = new Map((scan.sources || []).map((source) => [source.slug, source]));
  const results = [];

  await fs.mkdir(reportRoot, { recursive: true });

  for (const ruleCase of cases) {
    const source = sourceBySlug.get(ruleCase.sourceSlug);
    const caseRoot = path.join(reportRoot, ruleCase.id);
    const pairManifestPath = path.join(caseRoot, `${ruleCase.sourceSlug}-pairs.json`);
    const materialsManifestPath = path.join(caseRoot, `${ruleCase.sourceSlug}-materials.json`);
    const result = {
      id: ruleCase.id,
      label: ruleCase.label,
      sourceSlug: ruleCase.sourceSlug,
      notes: ruleCase.notes,
      requireMarkscheme: ruleCase.requireMarkscheme,
      expectedMinPairs: ruleCase.expectedMinPairs,
      allowZeroPairs: Boolean(ruleCase.allowZeroPairs),
      sourceFound: Boolean(source),
      status: "fail",
      errors: [],
    };

    if (!source) {
      result.errors.push(`Source slug not found in scan manifest: ${ruleCase.sourceSlug}`);
      results.push(result);
      continue;
    }

    await fs.mkdir(caseRoot, { recursive: true });

    try {
      const buildArgs = [
        "--archive",
        source.path,
        "--out",
        pairManifestPath,
        "--source-slug",
        source.slug,
      ];

      if (selectedSubjects.size > 0) {
        buildArgs.push("--subjects", [...selectedSubjects].join(","));
      } else {
        buildArgs.push("--all-subjects");
      }

      await runNodeScript(path.join(scriptsDir, "build-ib-archive-manifest.mjs"), buildArgs);

      const pairManifest = JSON.parse(await fs.readFile(pairManifestPath, "utf8"));
      const filteredPairs = filterPairs(pairManifest.pairs || [], selectedSubjects, ruleCase.requireMarkscheme);
      result.manifestSummary = pairManifest.summary || null;
      result.filteredPairs = filteredPairs.length;
      result.filteredPairsWithMarkscheme = filteredPairs.filter((pair) => pair.hasMarkscheme).length;
      result.filteredSubjects = [...new Set(filteredPairs.map((pair) => pair.subject))].sort();

      const commonArgs = ["--manifest", pairManifestPath];
      if (selectedSubjects.size > 0) {
        commonArgs.push("--subjects", [...selectedSubjects].join(","));
      }
      if (ruleCase.requireMarkscheme) {
        commonArgs.push("--require-markscheme");
      }
      if (options.sampleLimitPerSubject > 0) {
        commonArgs.push("--limit-per-subject", String(options.sampleLimitPerSubject));
      }

      await runNodeScript(path.join(scriptsDir, "extract-ib-archive-files.mjs"), commonArgs);
      await runNodeScript(path.join(scriptsDir, "build-ib-materials-from-archive-manifest.mjs"), [
        ...commonArgs,
        "--out",
        materialsManifestPath,
      ]);

      const materialsManifest = JSON.parse(await fs.readFile(materialsManifestPath, "utf8"));
      const sampleMaterials = materialsManifest.materials || [];
      result.sampleMaterials = summarizeMaterials(sampleMaterials);

      if (options.shouldImportSample && sampleMaterials.length > 0) {
        await runNodeScript(path.join(scriptsDir, "import-ib-materials.mjs"), [materialsManifestPath]);
        result.sampleImported = true;
      } else {
        result.sampleImported = false;
      }

      result.status = buildStatus(ruleCase, filteredPairs, sampleMaterials);
    } catch (error) {
      result.errors.push(String(error?.message || error));
      result.status = "fail";
    }

    results.push(result);
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    scanPath,
    reportRoot,
    subjects: [...selectedSubjects],
    sampleLimitPerSubject: options.sampleLimitPerSubject,
    importedSample: options.shouldImportSample,
    totals: {
      cases: results.length,
      passed: results.filter((item) => item.status === "pass").length,
      warned: results.filter((item) => item.status === "warn").length,
      failed: results.filter((item) => item.status === "fail").length,
    },
    results,
  };

  const summaryPath = path.join(reportRoot, "summary.json");
  await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2), "utf8");
  console.log(JSON.stringify(summary, null, 2));
  console.log(`Validation report written to ${summaryPath}`);
}

main().catch((error) => {
  console.error("Failed to validate IB import rules:", error);
  process.exit(1);
});
