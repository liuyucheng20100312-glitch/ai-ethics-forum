import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { MongoClient } from "mongodb";
import { loadEnvLocal } from "./lib/env.mjs";

loadEnvLocal();

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    manifest: "",
    offset: 0,
    limit: 0,
    subjects: "",
    years: "",
    types: "",
    provider: String(process.env.IB_PDF_FALLBACK_PROVIDER || "tencent_edu_ocr"),
    out: "",
    progressFile: "",
    resume: true,
    resetProgress: false,
    dryRun: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--manifest" && args[index + 1]) {
      options.manifest = args[index + 1];
      index += 1;
    } else if (arg === "--offset" && args[index + 1]) {
      options.offset = Number(args[index + 1]) || 0;
      index += 1;
    } else if (arg === "--limit" && args[index + 1]) {
      options.limit = Number(args[index + 1]) || 0;
      index += 1;
    } else if (arg === "--subjects" && args[index + 1]) {
      options.subjects = args[index + 1];
      index += 1;
    } else if (arg === "--years" && args[index + 1]) {
      options.years = args[index + 1];
      index += 1;
    } else if (arg === "--types" && args[index + 1]) {
      options.types = args[index + 1];
      index += 1;
    } else if (arg === "--provider" && args[index + 1]) {
      options.provider = args[index + 1];
      index += 1;
    } else if (arg === "--out" && args[index + 1]) {
      options.out = args[index + 1];
      index += 1;
    } else if (arg === "--progress-file" && args[index + 1]) {
      options.progressFile = args[index + 1];
      index += 1;
    } else if (arg === "--no-resume") {
      options.resume = false;
    } else if (arg === "--reset-progress") {
      options.resetProgress = true;
    } else if (arg === "--dry-run") {
      options.dryRun = true;
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
      .map((item) => item.toUpperCase())
  );
}

function matchesFilter(material, subjects, years, types) {
  if (subjects.size > 0 && !subjects.has(String(material.subjectCode || "").toUpperCase())) {
    return false;
  }
  if (years.size > 0 && !years.has(String(material.year || ""))) {
    return false;
  }
  if (types.size > 0 && !types.has(String(material.type || "").toUpperCase())) {
    return false;
  }
  return true;
}

function buildDefaultProgressFilePath(options, manifestPath) {
  const fingerprint = crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        manifestPath,
        provider: options.provider,
        subjects: options.subjects,
        years: options.years,
        types: options.types,
      })
    )
    .digest("hex")
    .slice(0, 16);
  return path.join(
    process.cwd(),
    "data",
    "ib",
    "reports",
    "repair-progress",
    `${path.basename(manifestPath, path.extname(manifestPath))}-${fingerprint}.json`
  );
}

async function readProgressState(progressFilePath) {
  try {
    const content = await fs.readFile(progressFilePath, "utf8");
    const parsed = JSON.parse(content);
    return {
      completedMaterialIds: Array.isArray(parsed.completedMaterialIds) ? parsed.completedMaterialIds : [],
      completedItems: Array.isArray(parsed.completedItems) ? parsed.completedItems : [],
      updatedAt: parsed.updatedAt || "",
    };
  } catch {
    return {
      completedMaterialIds: [],
      completedItems: [],
      updatedAt: "",
    };
  };
}

function getMongoConfig() {
  const uri = process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DB || "ai-ethics-forum";

  if (!uri) {
    return null;
  }

  return { uri, dbName };
}

async function getAlreadyRepairedMaterialIds(materials, provider) {
  const mongoConfig = getMongoConfig();
  if (!mongoConfig || materials.length === 0) {
    return new Set();
  }

  const materialIds = materials.map((material) => material.materialId).filter(Boolean);
  if (materialIds.length === 0) {
    return new Set();
  }

  const mongo = new MongoClient(mongoConfig.uri);
  try {
    await mongo.connect();
    const db = mongo.db(mongoConfig.dbName);
    const repairQuery = {
      materialId: { $in: materialIds },
      "textExtraction.strategy": `pdf_parse_${provider}`,
      "textExtraction.quality.level": { $in: ["good", "warn"] },
    };

    if (String(provider).startsWith("tencent")) {
      repairQuery.$or = [
        { "textExtraction.fallbackProducedText": true },
        { "textExtraction.fallbackMetadata.totalPages": { $gt: 0 } },
        { "textExtraction.fallbackMetadata.totalBlocks": { $gt: 0 } },
        { "textExtraction.fallbackMetadata.markschemeSelectedProvider": { $exists: true } },
      ];
    }

    const docs = await db
      .collection("ib_materials")
      .find(repairQuery)
      .project({ materialId: 1 })
      .toArray();

    return new Set(docs.map((doc) => String(doc.materialId || "")).filter(Boolean));
  } catch (error) {
    console.warn(`[ib-repair] Mongo resume check failed, falling back to progress file only: ${error.message}`);
    return new Set();
  } finally {
    await mongo.close();
  }
}

async function runImport(manifestPath, provider, progressFilePath) {
  await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        path.join(process.cwd(), "scripts", "import-ib-materials.mjs"),
        manifestPath,
        "--progress-file",
        progressFilePath,
      ],
      {
        cwd: process.cwd(),
        stdio: "inherit",
        env: {
          ...process.env,
          IB_PDF_REPAIR_ENABLED: "true",
          IB_PDF_FORCE_FALLBACK: "true",
          IB_PDF_FALLBACK_PROVIDER: provider,
        },
      }
    );

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`Repair import exited with code ${code}.`));
    });
  });
}

async function main() {
  const options = parseArgs();
  if (!options.manifest) {
    throw new Error("Missing --manifest path.");
  }

  const manifestPath = path.isAbsolute(options.manifest)
    ? options.manifest
    : path.join(process.cwd(), options.manifest);
  const outputPath = options.out
    ? path.isAbsolute(options.out)
      ? options.out
      : path.join(process.cwd(), options.out)
    : path.join(
        process.cwd(),
        "data",
        "ib",
        "reports",
        `repair-batch-${Date.now()}.json`
      );
  const progressFilePath = options.progressFile
    ? path.isAbsolute(options.progressFile)
      ? options.progressFile
      : path.join(process.cwd(), options.progressFile)
    : buildDefaultProgressFilePath(options, manifestPath);

  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  const subjects = csvToSet(options.subjects);
  const years = csvToSet(options.years);
  const types = csvToSet(options.types);
  const filtered = (manifest.materials || []).filter((material) =>
    matchesFilter(material, subjects, years, types)
  );
  const start = Math.max(0, options.offset || 0);
  const end = options.limit > 0 ? start + options.limit : filtered.length;
  const sliced = filtered.slice(start, end);
  if (options.resetProgress) {
    await fs.rm(progressFilePath, { force: true });
  }
  const progressState = options.resume ? await readProgressState(progressFilePath) : { completedMaterialIds: [] };
  const completedMaterialIds = new Set(progressState.completedMaterialIds || []);
  if (options.resume) {
    const alreadyRepairedMaterialIds = await getAlreadyRepairedMaterialIds(sliced, options.provider);
    for (const materialId of alreadyRepairedMaterialIds) {
      completedMaterialIds.add(materialId);
    }
  }
  const selected = options.resume
    ? sliced.filter((material) => !completedMaterialIds.has(material.materialId))
    : sliced;

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify({ materials: selected }, null, 2), "utf8");

  console.log(
    JSON.stringify(
      {
        manifestPath,
        outputPath,
        provider: options.provider,
        progressFilePath,
        resume: options.resume,
        resetProgress: options.resetProgress,
        available: filtered.length,
        selected: sliced.length,
        alreadyCompleted: sliced.length - selected.length,
        remaining: selected.length,
        offset: start,
        limit: options.limit || null,
        dryRun: options.dryRun,
      },
      null,
      2
    )
  );

  if (selected.length === 0) {
    console.log(
      options.resume
        ? "No remaining materials matched. This repair batch is already completed."
        : "No materials matched the requested batch filters."
    );
    return;
  }

  if (options.dryRun) {
    console.log("Dry run completed. Remove --dry-run to execute the repair import.");
    return;
  }

  await runImport(outputPath, options.provider, progressFilePath);
}

main().catch((error) => {
  console.error("Failed to repair IB materials from manifest:", error);
  process.exit(1);
});
