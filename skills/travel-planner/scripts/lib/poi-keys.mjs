import crypto from "node:crypto";

/** Normalize for stable keys: trim, collapse internal whitespace. */
export function normalizeQueryName(s) {
  return String(s ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Stable key for global POI query index (must include geographic/destination context).
 * @param {string} queryName
 * @param {string} contextKey e.g. route-evidence `destination` or adcode
 */
export function stableQueryKey(queryName, contextKey) {
  const q = normalizeQueryName(queryName);
  const c = String(contextKey ?? "").trim();
  const raw = `${q}|||${c}`;
  return crypto.createHash("sha256").update(raw, "utf8").digest("hex");
}
