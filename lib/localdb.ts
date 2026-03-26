/**
 * Local JSON file-based database that mimics MongoDB's Collection API.
 * Used automatically when MongoDB Atlas is unreachable (school network DNS block).
 * Data is persisted in the `.localdb/` directory at project root.
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";

const DATA_DIR = path.join(process.cwd(), ".localdb");

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function colPath(name: string) {
  return path.join(DATA_DIR, `${name}.json`);
}

function readCol(name: string): Record<string, unknown>[] {
  ensureDir();
  const p = colPath(name);
  if (!fs.existsSync(p)) return [];
  try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return []; }
}

function writeCol(name: string, docs: Record<string, unknown>[]) {
  ensureDir();
  fs.writeFileSync(colPath(name), JSON.stringify(docs, null, 2));
}

function newId() {
  return crypto.randomBytes(12).toString("hex");
}

function getByPath(obj: Record<string, unknown>, pathStr: string): unknown {
  return pathStr.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object") return (acc as Record<string, unknown>)[key];
    return undefined;
  }, obj);
}

function setByPath(obj: Record<string, unknown>, pathStr: string, value: unknown) {
  const parts = pathStr.split(".");
  let cur: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    const next = cur[key];
    if (!next || typeof next !== "object") {
      const maybeIndex = Number(parts[i + 1]);
      cur[key] = Number.isInteger(maybeIndex) ? [] : {};
    }
    cur = cur[key] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]] = value;
}

/** Fake ObjectId wrapper – toString() returns the id string */
export class LocalObjectId {
  id: string;
  constructor(id?: string) { this.id = id ?? newId(); }
  toString() { return this.id; }
  equals(other: unknown) {
    if (other instanceof LocalObjectId) return this.id === other.id;
    return this.id === String(other);
  }
  toJSON() { return { $oid: this.id }; }
}

// ── Simple in-memory query matcher ───────────────────────────────────────────
function matches(doc: Record<string, unknown>, filter: Record<string, unknown>): boolean {
  for (const [key, val] of Object.entries(filter)) {
    if (val === null || val === undefined) { if (doc[key] != null) return false; continue; }
    if (typeof val === "object" && !Array.isArray(val)) {
      const ops = val as Record<string, unknown>;
      const docVal = doc[key];
      if ("$in" in ops) { if (!(ops.$in as unknown[]).includes(docVal)) return false; continue; }
      if ("$ne" in ops) { if (docVal === ops.$ne) return false; continue; }
      if ("$gt" in ops) { if ((docVal as number) <= (ops.$gt as number)) return false; continue; }
      if ("$lt" in ops) { if ((docVal as number) >= (ops.$lt as number)) return false; continue; }
      // nested field – compare recursively
      if (!matches(doc[key] as Record<string, unknown> ?? {}, ops)) return false;
    } else {
      const docVal = doc[key];
      // Compare with ObjectId / string coercion
      const docStr = docVal instanceof LocalObjectId ? docVal.toString() : String(docVal ?? "");
      const valStr = val instanceof LocalObjectId ? val.toString() : String(val);
      if (docStr !== valStr) return false;
    }
  }
  return true;
}

function applySort(docs: Record<string, unknown>[], sort: Record<string, 1 | -1>): Record<string, unknown>[] {
  const entries = Object.entries(sort);
  return [...docs].sort((a, b) => {
    for (const [k, dir] of entries) {
      const av = a[k] as string | number | Date, bv = b[k] as string | number | Date;
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
    }
    return 0;
  });
}

// ── Cursor ────────────────────────────────────────────────────────────────────
class LocalCursor {
  private docs: Record<string, unknown>[];
  private projectFields: Record<string, 0 | 1> | null = null;
  constructor(docs: Record<string, unknown>[]) { this.docs = docs; }
  sort(s: Record<string, 1 | -1>) { this.docs = applySort(this.docs, s); return this; }
  limit(n: number) { this.docs = this.docs.slice(0, n); return this; }
  skip(n: number) { this.docs = this.docs.slice(n); return this; }
  project(fields: Record<string, 0 | 1>) {
    this.projectFields = fields;
    return this;
  }
  async toArray() {
    if (this.projectFields) {
      return this.docs.map(doc => {
        const result: Record<string, unknown> = {};
        for (const [key, include] of Object.entries(this.projectFields!)) {
          if (include === 1 && key in doc) {
            result[key] = doc[key];
          }
        }
        // 总是包含 _id
        if (doc._id !== undefined) result._id = doc._id;
        return result;
      });
    }
    return this.docs;
  }
}

// ── Collection ────────────────────────────────────────────────────────────────
class LocalCollection {
  private name: string;
  constructor(name: string) { this.name = name; }

  private read() { return readCol(this.name); }
  private write(docs: Record<string, unknown>[]) { writeCol(this.name, docs); }

  find(filter: Record<string, unknown> = {}) {
    const all = this.read();
    const matched = Object.keys(filter).length === 0 ? all : all.filter(d => matches(d, filter));
    return new LocalCursor(matched);
  }

  async findOne(filter: Record<string, unknown> = {}): Promise<Record<string, unknown> | null> {
    const all = this.read();
    return all.find(d => matches(d, filter)) ?? null;
  }

  async insertOne(doc: Record<string, unknown>) {
    const all = this.read();
    const _id = new LocalObjectId();
    const newDoc = { ...doc, _id: _id.toString(), createdAt: doc.createdAt ?? new Date().toISOString() };
    all.push(newDoc);
    this.write(all);
    return { insertedId: _id, acknowledged: true };
  }

  async updateOne(filter: Record<string, unknown>, update: Record<string, unknown>) {
    const all = this.read();
    const idx = all.findIndex(d => matches(d, filter));
    if (idx === -1) return { matchedCount: 0, modifiedCount: 0 };
    const ops = update as Record<string, Record<string, unknown>>;
    if (ops.$set) Object.assign(all[idx], ops.$set);
    if (ops.$inc) {
      for (const [k, v] of Object.entries(ops.$inc)) {
        const current = getByPath(all[idx], k);
        setByPath(all[idx], k, ((current as number) ?? 0) + (v as number));
      }
    }
    if (ops.$push) {
      for (const [k, v] of Object.entries(ops.$push)) {
        const current = getByPath(all[idx], k);
        const arr = Array.isArray(current) ? current : [];
        arr.push(v);
        setByPath(all[idx], k, arr);
      }
    }
    this.write(all);
    return { matchedCount: 1, modifiedCount: 1 };
  }

  async updateMany(filter: Record<string, unknown>, update: Record<string, unknown>) {
    const all = this.read();
    let count = 0;
    const ops = update as Record<string, Record<string, unknown>>;
    for (let i = 0; i < all.length; i++) {
      if (matches(all[i], filter)) {
        if (ops.$set) Object.assign(all[i], ops.$set);
        count++;
      }
    }
    this.write(all);
    return { matchedCount: count, modifiedCount: count };
  }

  async deleteOne(filter: Record<string, unknown>) {
    const all = this.read();
    const idx = all.findIndex(d => matches(d, filter));
    if (idx === -1) return { deletedCount: 0 };
    all.splice(idx, 1);
    this.write(all);
    return { deletedCount: 1 };
  }

  async deleteMany(filter: Record<string, unknown>) {
    const all = this.read();
    const before = all.length;
    const remaining = all.filter(d => !matches(d, filter));
    this.write(remaining);
    return { deletedCount: before - remaining.length };
  }

  async countDocuments(filter: Record<string, unknown> = {}) {
    const all = this.read();
    return all.filter(d => matches(d, filter)).length;
  }

  // No-op index creation (not needed for local JSON)
  async createIndex(_keys: unknown, _opts?: unknown) { return "local_index"; }
}

// ── Fake Db ───────────────────────────────────────────────────────────────────
class LocalDb {
  collection(name: string) { return new LocalCollection(name); }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async command(_cmd: unknown) { return { ok: 1 }; }
}

export function getLocalDb(): LocalDb {
  return new LocalDb();
}
