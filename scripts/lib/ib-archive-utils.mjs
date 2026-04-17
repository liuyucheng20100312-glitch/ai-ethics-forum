import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const FOREIGN_LANGUAGE_PATTERN = /French|Spanish|German|\[German\]/i;
export const SOURCE_MEMBER_SEPARATOR = "::";
const IGNORED_SOURCE_PATH_PATTERN =
  /(^|[\\/])(\.ds_store|__macosx)([\\/]|$)|invoice|发票|marked paper|试卷批改/i;

export function inferSessionYear(inputPath) {
  const name = path.basename(inputPath);
  const normalized = name.replace(/\s+/g, " ");
  const yearMatch = normalized.match(/(20\d{2})/);
  const year = yearMatch ? Number(yearMatch[1]) : null;
  let session = "";

  if (/may/i.test(normalized)) {
    session = "May";
  } else if (/nov/i.test(normalized)) {
    session = "Nov";
  }

  return {
    year,
    session,
    slug: [session || "session", year || "unknown"]
      .join("")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-"),
  };
}

export function isArchivePath(inputPath) {
  return /\.(rar|zip|7z|tar|tgz|gz)$/i.test(inputPath);
}

export function isIgnoredSourcePath(inputPath) {
  return IGNORED_SOURCE_PATH_PATTERN.test(inputPath);
}

export function isNestedArchiveMemberPath(inputPath) {
  return inputPath.includes(SOURCE_MEMBER_SEPARATOR);
}

export function splitNestedArchiveMemberPath(inputPath) {
  const separatorIndex = inputPath.indexOf(SOURCE_MEMBER_SEPARATOR);
  if (separatorIndex < 0) {
    return null;
  }

  return {
    archiveRelativePath: inputPath.slice(0, separatorIndex),
    memberPath: inputPath.slice(separatorIndex + SOURCE_MEMBER_SEPARATOR.length),
  };
}

export function toMaterializedSourcePath(inputPath) {
  const nested = splitNestedArchiveMemberPath(inputPath);
  if (!nested) {
    return inputPath;
  }

  const archiveDirectory = path.dirname(nested.archiveRelativePath);
  const archiveBaseName = path.basename(
    nested.archiveRelativePath,
    path.extname(nested.archiveRelativePath)
  );
  const segments = [];

  if (archiveDirectory && archiveDirectory !== ".") {
    segments.push(archiveDirectory);
  }
  segments.push(archiveBaseName, nested.memberPath);

  return path.join(...segments).replace(/\\/g, "/");
}

async function listArchiveMembers(archivePath) {
  const { stdout } = await execFileAsync("tar", ["-tf", archivePath], {
    maxBuffer: 1024 * 1024 * 50,
  });
  return stdout
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

async function shouldTraverseNestedArchive(archivePath) {
  if (isIgnoredSourcePath(archivePath)) {
    return false;
  }

  const siblingDirectory = path.join(
    path.dirname(archivePath),
    path.basename(archivePath, path.extname(archivePath))
  );

  let archiveEntries = [];
  try {
    archiveEntries = await listArchiveMembers(archivePath);
  } catch {
    return false;
  }

  if (archiveEntries.length === 0) {
    return false;
  }

  try {
    const extractedFiles = await fs.readdir(siblingDirectory, { recursive: true });
    if (!Array.isArray(extractedFiles) || extractedFiles.length === 0) {
      return true;
    }

    return extractedFiles.length < archiveEntries.length * 0.7;
  } catch {
    return true;
  }
}

export async function listSourceFiles(sourcePath) {
  if (isArchivePath(sourcePath)) {
    return listArchiveMembers(sourcePath);
  }

  const root = path.resolve(sourcePath);
  const files = [];

  async function walk(directory) {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else {
        const relativePath = path.relative(root, fullPath).replace(/\\/g, "/");
        if (isIgnoredSourcePath(relativePath)) {
          continue;
        }

        if (isArchivePath(fullPath) && (await shouldTraverseNestedArchive(fullPath))) {
          const archiveMembers = await listArchiveMembers(fullPath);
          for (const member of archiveMembers) {
            if (isIgnoredSourcePath(member)) {
              continue;
            }
            files.push(`${relativePath}${SOURCE_MEMBER_SEPARATOR}${member}`);
          }
          continue;
        }

        files.push(relativePath);
      }
    }
  }

  await walk(root);
  return files;
}

export async function extractSourceFile(sourcePath, sourceMember, targetRoot) {
  if (isArchivePath(sourcePath)) {
    await execFileAsync("tar", ["-xf", sourcePath, "-C", targetRoot, sourceMember], {
      maxBuffer: 1024 * 1024 * 50,
    });
    return;
  }

  const nested = splitNestedArchiveMemberPath(sourceMember);
  if (nested) {
    const archivePath = path.join(sourcePath, nested.archiveRelativePath);
    const nestedTargetRoot = path.join(
      targetRoot,
      path.dirname(nested.archiveRelativePath),
      path.basename(
        nested.archiveRelativePath,
        path.extname(nested.archiveRelativePath)
      )
    );
    await fs.mkdir(nestedTargetRoot, { recursive: true });
    await execFileAsync("tar", ["-xf", archivePath, "-C", nestedTargetRoot, nested.memberPath], {
      maxBuffer: 1024 * 1024 * 50,
    });
    return;
  }

  const sourceFile = path.join(sourcePath, sourceMember);
  const targetFile = path.join(targetRoot, sourceMember);
  await fs.mkdir(path.dirname(targetFile), { recursive: true });
  await fs.copyFile(sourceFile, targetFile);
}

export function cleanSubjectName(rawSubject) {
  return rawSubject
    .replace(/_+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function inferSubject(fileName) {
  const withoutExtension = fileName.replace(/\.pdf$/i, "");
  const beforePaper =
    withoutExtension.split("_paper_")[0] ||
    withoutExtension.split("___")[0] ||
    withoutExtension.split("__")[0] ||
    "";
  const normalized = cleanSubjectName(beforePaper);

  if (/Mathematics|Mathematical studies|Further mathematics/i.test(normalized)) return "Mathematics";
  if (/Physics/i.test(normalized)) return "Physics";
  if (/Chemistry/i.test(normalized)) return "Chemistry";
  if (/Biology/i.test(normalized)) return "Biology";
  if (/Economics/i.test(normalized)) return "Economics";
  if (/Business and management|Business management/i.test(normalized)) return "Business Management";
  if (/Computer science/i.test(normalized)) return "Computer Science";
  if (/Design technology/i.test(normalized)) return "Design Technology";
  if (/Environmental systems and societies/i.test(normalized)) return "Environmental Systems and Societies";
  if (/Sports exercise and health science/i.test(normalized)) return "Sports Exercise and Health Science";
  if (/Music/i.test(normalized)) return "Music";

  return normalized;
}

export function inferSubjectCode(subject) {
  const map = {
    Mathematics: "MAA",
    Physics: "PHYSICS",
    Chemistry: "CHEMISTRY",
    Biology: "BIOLOGY",
    Economics: "ECONOMICS",
    "Business Management": "BUSINESS_MANAGEMENT",
    "Computer Science": "COMPUTER_SCIENCE",
    "Design Technology": "DESIGN_TECHNOLOGY",
    "Environmental Systems and Societies": "ESS",
    "Sports Exercise and Health Science": "SEHS",
    Music: "MUSIC",
  };
  return map[subject] || subject.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
}

export function inferPaper(fileName) {
  const match = fileName.match(/paper_(\d)/i);
  if (match) return `Paper${match[1]}`;
  const compactMatch = fileName.match(/(?:^|[\s_-])P(?:aper)?\s*(\d)(?:[\s_.-]|$)/i);
  if (compactMatch) return `Paper${compactMatch[1]}`;
  if (/listening/i.test(fileName)) return "Listening";
  if (/score_booklet/i.test(fileName)) return "ScoreBooklet";
  if (/case_study/i.test(fileName)) return "CaseStudy";
  if (/markscheme/i.test(fileName)) return "Markscheme";
  return "";
}

export function inferLevel(fileName) {
  if (/HLSL/i.test(fileName)) return "BOTH";
  if (/(^|[\s_-])HL([\s_.-]|$)/i.test(fileName)) return "HL";
  if (/(^|[\s_-])SL([\s_.-]|$)/i.test(fileName)) return "SL";
  return "BOTH";
}

export function inferTimezone(fileName) {
  const match = fileName.match(/TZ\d/i);
  return match ? match[0].toUpperCase() : "";
}

export function normalizePairKey(fileName) {
  return fileName
    .replace(/_markscheme/gi, "")
    .replace(/_marks?scheme/gi, "")
    .replace(/\.pdf$/i, "")
    .replace(/__+/g, "__")
    .toLowerCase();
}

export function safeSlug(value) {
  return value
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}
