import fs from "node:fs";
import path from "node:path";

import { poiDir } from "./paths.mjs";
import { ensureDir, readJsonFile, writeJsonAtomic } from "./json.mjs";
import { stableQueryKey, normalizeQueryName } from "./poi-keys.mjs";

function entriesDir() {
  const p = path.join(poiDir(), "entries");
  ensureDir(p);
  return p;
}

function entryFilePath(poiId) {
  const safe = Buffer.from(String(poiId), "utf8").toString("base64url");
  return path.join(entriesDir(), `${safe}.json`);
}

function queryIndexPath() {
  ensureDir(poiDir());
  return path.join(poiDir(), "query-index.json");
}

/** @returns {{ mappings: Record<string, { poi_id: string, ingested_at: string }> }} */
export function readQueryIndex() {
  const p = queryIndexPath();
  if (!fs.existsSync(p)) return { mappings: {} };
  const o = readJsonFile(p);
  if (!o || typeof o !== "object") return { mappings: {} };
  if (!o.mappings || typeof o.mappings !== "object") return { mappings: {} };
  return { mappings: o.mappings };
}

export function writeQueryIndex(index) {
  writeJsonAtomic(queryIndexPath(), {
    schema_version: 1,
    mappings: index.mappings && typeof index.mappings === "object" ? index.mappings : {},
  });
}

export function readPoiStoreEntry(poiId) {
  const id = String(poiId || "").trim();
  if (!id) return null;
  const fp = entryFilePath(id);
  if (!fs.existsSync(fp)) return null;
  return readJsonFile(fp);
}

export function writePoiStoreEntry(entry) {
  const poiId = String(entry?.poi_id || "").trim();
  if (!poiId) throw new Error("writePoiStoreEntry: poi_id required");
  writeJsonAtomic(entryFilePath(poiId), entry);
}

/**
 * Persist entry and optional query_name → poi_id mapping.
 * @param {object} entry amap-style POI row (must include poi_id)
 * @param {string} contextKey required when query_name is present for indexing
 */
export function upsertPoiStoreEntry(entry, contextKey) {
  const qnRaw = String(entry?.query_name || "").trim();
  writePoiStoreEntry(entry);

  if (!qnRaw) return;
  const ctx = String(contextKey || "").trim();
  if (!ctx) {
    throw new Error("upsertPoiStoreEntry: context_key required when query_name is set");
  }
  const key = stableQueryKey(qnRaw, ctx);
  const idx = readQueryIndex();
  idx.mappings[key] = {
    poi_id: String(entry.poi_id).trim(),
    ingested_at: new Date().toISOString(),
    query_name: normalizeQueryName(qnRaw),
    context_key: ctx,
  };
  writeQueryIndex(idx);
}

/** Upsert all entries from a trip poi-cache / poi-preview payload. */
export function upsertPoiStoreFromPayloadEntries(entries, defaultContextKey) {
  const ctx0 = String(defaultContextKey || "").trim();
  const list = Array.isArray(entries) ? entries : [];
  for (const e of list) {
    if (!e || typeof e !== "object") continue;
    const perCtx = String(e.context_key || "").trim() || ctx0;
    if (!perCtx) {
      throw new Error("upsertPoiStoreFromPayloadEntries: context_key required (payload root or per-entry)");
    }
    upsertPoiStoreEntry(e, perCtx);
  }
}

export function resolveQueryToPoiEntry(queryName, contextKey) {
  const ctx = String(contextKey || "").trim();
  if (!ctx) return { hit: false, reason: "missing_context_key" };
  const key = stableQueryKey(queryName, ctx);
  const idx = readQueryIndex();
  const m = idx.mappings[key];
  if (!m?.poi_id) return { hit: false, query_key: key, reason: "miss" };
  const entry = readPoiStoreEntry(m.poi_id);
  return {
    hit: !!entry,
    query_key: key,
    poi_id: m.poi_id,
    entry,
  };
}

export function poiStoreStats() {
  const dir = entriesDir();
  let files = 0;
  try {
    files = fs.readdirSync(dir).filter((n) => n.endsWith(".json")).length;
  } catch {
    files = 0;
  }
  const idx = readQueryIndex();
  const mapCount = Object.keys(idx.mappings || {}).length;
  return { entry_files: files, query_mappings: mapCount };
}
