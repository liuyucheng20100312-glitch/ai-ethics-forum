import fs from "node:fs";
import path from "node:path";
import { loadEnvLocal } from "./env.mjs";

loadEnvLocal();

const DEFAULT_IB_ARCHIVE_ROOT = "D:\\wendang\\IB";
const LOGICAL_SOURCE_PREFIX = ["data", "ib", "source"];

function normalizeSegments(value) {
  return String(value || "")
    .replace(/\\/g, "/")
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function findLogicalSourceSuffix(value) {
  const segments = normalizeSegments(value);
  const lowerSegments = segments.map((segment) => segment.toLowerCase());
  const prefixLength = LOGICAL_SOURCE_PREFIX.length;

  for (let index = 0; index <= lowerSegments.length - prefixLength; index += 1) {
    const matchesPrefix = LOGICAL_SOURCE_PREFIX.every(
      (segment, offset) => lowerSegments[index + offset] === segment
    );
    if (matchesPrefix) {
      return segments.slice(index + prefixLength);
    }
  }

  return [];
}

export function getIbArchiveRoot() {
  return (
    process.env.IB_ARCHIVE_ROOT ||
    process.env.IB_ARCHIVE_SCAN_ROOT ||
    DEFAULT_IB_ARCHIVE_ROOT
  );
}

export function getIbSourceRoot() {
  return (
    process.env.IB_SOURCE_ROOT ||
    path.join(process.cwd(), ...LOGICAL_SOURCE_PREFIX)
  );
}

export function getDefaultIbArchivePath(fileName) {
  return path.join(getIbArchiveRoot(), fileName);
}

export function getMaterialPathCandidates(inputPath) {
  const rawPath = String(inputPath || "").trim();
  if (!rawPath) {
    return [];
  }

  const configuredSourceRoot = getIbSourceRoot();
  const logicalSuffix = findLogicalSourceSuffix(rawPath);
  const normalizedSegments = normalizeSegments(rawPath);
  const candidates = [];

  if (path.isAbsolute(rawPath)) {
    candidates.push(rawPath);
  } else {
    candidates.push(path.join(process.cwd(), rawPath));
  }

  if (logicalSuffix.length > 0) {
    candidates.push(path.join(configuredSourceRoot, ...logicalSuffix));
  }

  if (normalizedSegments.length > 0) {
    candidates.push(path.join(configuredSourceRoot, ...normalizedSegments));
  }

  return [...new Set(candidates)];
}

export function resolveExistingMaterialPath(inputPath) {
  const candidates = getMaterialPathCandidates(inputPath);
  return candidates.find((candidate) => fs.existsSync(candidate)) || "";
}

export function describeMaterialPathResolution(inputPath) {
  return {
    inputPath: String(inputPath || ""),
    configuredSourceRoot: getIbSourceRoot(),
    candidates: getMaterialPathCandidates(inputPath),
  };
}

export function deriveLogicalMaterialPath(inputPath) {
  const rawPath = String(inputPath || "").trim();
  if (!rawPath) {
    return "";
  }

  const logicalSuffix = findLogicalSourceSuffix(rawPath);
  if (logicalSuffix.length > 0) {
    return path.join(...LOGICAL_SOURCE_PREFIX, ...logicalSuffix);
  }

  if (!path.isAbsolute(rawPath)) {
    return rawPath;
  }

  return "";
}
