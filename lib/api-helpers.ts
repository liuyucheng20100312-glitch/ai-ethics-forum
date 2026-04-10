/**
 * Shared API utilities — eliminates duplication across route handlers.
 */

import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";

/** The special userId that identifies the built-in administrator. */
export const ADMIN_USER_ID = "offline_admin";

/** Returns true when the given userId belongs to the admin account. */
export function isAdminUser(userId: string | undefined): boolean {
  return userId === ADMIN_USER_ID;
}

/**
 * Try to parse a MongoDB ObjectId from a 24-char hex string.
 * Returns null for any other format (e.g. local-db string IDs).
 */
export function tryParseObjectId(id: string): ObjectId | null {
  try {
    if (/^[a-fA-F0-9]{24}$/.test(id)) return new ObjectId(id);
    return null;
  } catch {
    return null;
  }
}

/** 401 — not logged in */
export const unauth = () =>
  NextResponse.json({ error: "未登录" }, { status: 401 });

/** 403 — logged in but insufficient privileges */
export const forbidden = () =>
  NextResponse.json({ error: "无权限" }, { status: 403 });

/** 404 — resource not found */
export const notFound = (msg = "未找到") =>
  NextResponse.json({ error: msg }, { status: 404 });

/** 400 — bad request */
export const badRequest = (msg: string) =>
  NextResponse.json({ error: msg }, { status: 400 });

/** 500 — internal server error */
export const serverError = (msg = "服务器错误") =>
  NextResponse.json({ error: msg }, { status: 500 });
