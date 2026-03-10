import fs from 'node:fs/promises';
import path from 'node:path';

const WORKSPACE = process.cwd();
const NEXT_DIR = path.join(WORKSPACE, '.next');

const allowedPrefixes = ['app/', 'lib/', 'public/', 'scripts/'];

async function fileExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const out = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await walk(full)));
    } else {
      out.push(full);
    }
  }
  return out;
}

function extractWorkspaceRelativePath(source) {
  // Examples seen:
  // - ../../../../ai-ethics-forum/lib/mongodb.ts
  // - ../../../../../ai-ethics-forum/app/layout.tsx
  // - [project]/ai-ethics-forum/app/layout.tsx
  const marker = 'ai-ethics-forum/';
  const idx = source.indexOf(marker);
  if (idx === -1) return null;
  const rel = source.slice(idx + marker.length);
  try {
    return decodeURIComponent(rel);
  } catch {
    return rel;
  }
}

function sanitizeRelPath(relPath) {
  // Remove control characters and normalize separators.
  let p = relPath.replace(/[\r\n\t\0]/g, '').trim();
  p = p.replace(/\\/g, '/');
  // Skip Next.js internal proxy/generated virtual paths.
  if (p.includes('__nextjs-internal-proxy')) return null;
  // Avoid treating source files as directories (e.g. app/page.tsx/...).
  if (/(?:\.ts|\.tsx)\/.+/.test(p)) return null;
  // Prevent path traversal.
  if (p.startsWith('/') || p.includes('..')) return null;
  return p;
}

async function writeRecoveredFile(relPath, content) {
  const sanitized = sanitizeRelPath(relPath);
  if (!sanitized) return false;
  if (!allowedPrefixes.some((p) => sanitized.startsWith(p))) return false;

  const absPath = path.join(WORKSPACE, ...sanitized.split('/'));
  try {
    await fs.mkdir(path.dirname(absPath), { recursive: true });
    await fs.writeFile(absPath, content, 'utf8');
    return true;
  } catch {
    return false;
  }
}

async function processMapObject(mapObj, stats) {
  const sources = mapObj?.sources;
  const sourcesContent = mapObj?.sourcesContent;
  if (!Array.isArray(sources) || !Array.isArray(sourcesContent)) return;

  for (let i = 0; i < sources.length; i++) {
    const source = sources[i];
    const content = sourcesContent[i];
    if (typeof source !== 'string') continue;
    if (typeof content !== 'string' || content.length === 0) continue;

    const relPath = extractWorkspaceRelativePath(source);
    if (!relPath) continue;

    const wrote = await writeRecoveredFile(relPath, content);
    if (wrote) {
      stats.filesWritten.add(relPath);
    }
  }
}

async function main() {
  if (!(await fileExists(NEXT_DIR))) {
    console.error('No .next directory found; cannot recover from sourcemaps.');
    process.exitCode = 1;
    return;
  }

  const allFiles = await walk(NEXT_DIR);
  const mapFiles = allFiles.filter((f) => f.endsWith('.map'));

  const stats = {
    mapCount: 0,
    parseFail: 0,
    filesWritten: new Set(),
  };

  for (const mapFile of mapFiles) {
    let raw;
    try {
      raw = await fs.readFile(mapFile, 'utf8');
    } catch {
      continue;
    }

    let json;
    try {
      json = JSON.parse(raw);
    } catch {
      stats.parseFail++;
      continue;
    }

    stats.mapCount++;

    if (Array.isArray(json.sections)) {
      for (const section of json.sections) {
        if (section && typeof section === 'object' && section.map) {
          await processMapObject(section.map, stats);
        }
      }
    } else {
      await processMapObject(json, stats);
    }
  }

  console.log(`Scanned map files: ${stats.mapCount}`);
  console.log(`Map parse failures: ${stats.parseFail}`);
  console.log(`Recovered files written: ${stats.filesWritten.size}`);

  const sample = Array.from(stats.filesWritten).sort().slice(0, 50);
  if (sample.length) {
    console.log('Sample recovered paths:');
    for (const p of sample) console.log(`- ${p}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
