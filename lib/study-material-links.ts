const BLOCKED_SOURCE_URL_PATTERNS = [
  /ibo\.org\/become-an-ib-school\/ib-publishing\/licensing/i,
  /applying-for-a-license/i,
  /copyright/i,
];

/**
 * Normalize a material URL into a browser-openable form when possible.
 */
export function normalizeMaterialUrl(url?: string): string {
  const value = (url || "").trim();
  if (!value) {
    return "";
  }
  if (/^https?:\/\//i.test(value)) {
    return value;
  }
  if (/^\/\//.test(value)) {
    return `https:${value}`;
  }
  if (/^www\./i.test(value)) {
    return `https://${value}`;
  }
  if (/^[a-z]:\\/i.test(value) || value.startsWith("\\\\")) {
    return "";
  }
  if (value.startsWith("/")) {
    return "";
  }
  return value;
}

/**
 * Return a real, user-openable external material URL.
 * Local paths, relative paths, and known licensing boilerplate links are filtered out.
 */
export function getPublicMaterialUrl(url?: string): string {
  const normalized = normalizeMaterialUrl(url);
  if (!normalized) {
    return "";
  }
  if (BLOCKED_SOURCE_URL_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return "";
  }
  return normalized;
}

/**
 * Whether the provided URL is suitable for direct user navigation.
 */
export function hasPublicMaterialUrl(url?: string): boolean {
  return Boolean(getPublicMaterialUrl(url));
}
