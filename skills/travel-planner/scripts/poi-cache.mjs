/**
 * poi-cache.mjs — POI 缓存的独立 CLI 工具
 *
 * 命令：
 *   --cmd=get              批量查缓存，返回 hits/misses
 *   --cmd=save             写入/更新缓存条目（TTL 72h 默认）
 *   --cmd=build-stop-media 从缓存 entries 直接输出 stop_media 平铺映射
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  parseCliArgs,
  assertOnlyFlags,
  requireFlag,
  readJsonFromCliValue,
} from "./cli_args.mjs";

// ─── 文件路径 ────────────────────────────────────────────────────────────────

function dataDir() {
  const env = process.env.TRAVEL_PLANNER_DATA_DIR;
  if (env) return env;
  return path.join(
    os.homedir(),
    ".openclaw",
    "agents",
    "travel-planner",
    "data",
  );
}

function poiCacheFile() {
  return path.join(dataDir(), "poi-cache.json");
}

// ─── 低层 JSON 读写 ──────────────────────────────────────────────────────────

function ensurePoiCacheFile() {
  const file = poiCacheFile();
  if (!fs.existsSync(file)) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(
      file,
      JSON.stringify(
        {
          schema_version: 1,
          entries: {},
          updated_at: new Date().toISOString(),
        },
        null,
        2,
      ),
      "utf8",
    );
  }
}

function loadPoiCacheStore() {
  ensurePoiCacheFile();
  try {
    const raw = JSON.parse(fs.readFileSync(poiCacheFile(), "utf8"));
    const entries =
      raw?.entries && typeof raw.entries === "object" ? raw.entries : {};
    return {
      schema_version: Number(raw?.schema_version || 1),
      entries,
      updated_at: String(raw?.updated_at || ""),
    };
  } catch {
    return { schema_version: 1, entries: {}, updated_at: "" };
  }
}

function savePoiCacheStore(store) {
  ensurePoiCacheFile();
  fs.writeFileSync(
    poiCacheFile(),
    JSON.stringify(
      {
        schema_version: 1,
        entries: store.entries || {},
        updated_at: new Date().toISOString(),
      },
      null,
      2,
    ),
    "utf8",
  );
}

// ─── 工具函数 ────────────────────────────────────────────────────────────────

function normalizeKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\|+/g, "|");
}

/**
 * Canonical cache key = evidence stop name only.
 * Backward-compat: if legacy key format "destination|stop|provider" is provided,
 * extract the middle stop segment and normalize it.
 */
function normalizeStopCacheKey(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const parts = raw
    .split("|")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length >= 3) {
    return normalizeKey(parts.slice(1, -1).join("|"));
  }
  return normalizeKey(raw);
}

function toFinite(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return NaN;
  const n = Number.parseFloat(value.trim());
  return Number.isFinite(n) ? n : NaN;
}

function firstStr(...vals) {
  for (const v of vals) {
    const s = String(v ?? "").trim();
    if (s) return s;
  }
  return "";
}

function firstUrl(...vals) {
  for (const v of vals) {
    const s = firstStr(v);
    if (s && /^https?:\/\//i.test(s)) return s;
  }
  return "";
}

function isExpired(entry, now = new Date()) {
  const ts = Date.parse(String(entry?.expires_at || ""));
  return Number.isNaN(ts) || ts <= now.getTime();
}

function normalizeEntry(key, value, ttlHours = 72) {
  const now = new Date();
  const ttl = Number.isFinite(Number(ttlHours)) ? Number(ttlHours) : 72;
  const expiresAt = new Date(
    now.getTime() + Math.max(1, ttl) * 3600_000,
  ).toISOString();
  const lat = toFinite(value?.lat);
  const lng = toFinite(value?.lng);
  return {
    key,
    name: firstStr(value?.name),
    evidence_name: firstStr(value?.evidence_name),
    source_poi_name: firstStr(value?.source_poi_name),
    destination_text: firstStr(value?.destination_text),
    provider: firstStr(value?.provider, "flyai"),
    image: firstStr(value?.image),
    subtitle: firstStr(value?.subtitle),
    source_url: firstStr(value?.source_url),
    ...(Number.isFinite(lat) ? { lat } : {}),
    ...(Number.isFinite(lng) ? { lng } : {}),
    fetched_at: firstStr(value?.fetched_at, now.toISOString()),
    expires_at: firstStr(value?.expires_at, expiresAt),
    raw: value?.raw && typeof value.raw === "object" ? value.raw : {},
  };
}

export function normalizePoiRecord(item) {
  if (!item || typeof item !== "object") return null;
  const name = firstStr(item.name, item.title, item.poiName, item.poi_name);
  if (!name) return null;
  const image = firstUrl(
    item.mainPic,
    item.picUrl,
    item.image,
    item.imageUrl,
    item.photo,
  );
  const subtitle = firstStr(
    item.address,
    item.summary,
    item.desc,
    item.description,
    item.tag,
    item.categoryName,
  );
  const lat = toFinite(item.lat ?? item.latitude ?? item.y);
  const lng = toFinite(item.lng ?? item.longitude ?? item.x);
  return {
    name,
    image,
    subtitle,
    ...(Number.isFinite(lat) ? { lat } : {}),
    ...(Number.isFinite(lng) ? { lng } : {}),
    raw: item,
  };
}

function firstList(payload) {
  if (Array.isArray(payload)) return payload;
  const root = payload && typeof payload === "object" ? payload : {};
  const data = root.data && typeof root.data === "object" ? root.data : {};
  for (const candidate of [
    data.itemList,
    data.items,
    data.list,
    root.itemList,
    root.items,
    root.list,
    root.results,
    root.pois,
  ]) {
    if (Array.isArray(candidate)) return candidate;
  }
  return [];
}

export function buildPoiIndex(input) {
  const index = new Map();
  const pois = []
    .concat(firstList(input.flyai_pois))
    .concat(firstList(input.amap_pois))
    .concat(firstList(input.pois));
  for (const item of pois) {
    const normalized = normalizePoiRecord(item);
    if (!normalized) continue;
    const k = normalizeKey(normalized.name);
    if (!k || index.has(k)) continue;
    index.set(k, normalized);
  }
  return index;
}

function firstNormalizedPoi(input) {
  const candidates = []
    .concat(firstList(input?.flyai_pois))
    .concat(firstList(input?.amap_pois))
    .concat(firstList(input?.pois));
  for (const item of candidates) {
    const normalized = normalizePoiRecord(item);
    if (normalized) return normalized;
  }
  return null;
}

function findBestPoiForStop(stop, input, poiIndex) {
  const stopKey = normalizeKey(stop);
  if (!stopKey) return null;
  if (poiIndex.has(stopKey)) return poiIndex.get(stopKey);

  // Fallback: use first semantically close POI, then first available POI.
  for (const record of poiIndex.values()) {
    const nameKey = normalizeKey(record.name);
    if (!nameKey) continue;
    if (nameKey.includes(stopKey) || stopKey.includes(nameKey)) return record;
  }
  return firstNormalizedPoi(input);
}

export function mergePoiCacheAndResults(input = {}) {
  const routeOptions = Array.isArray(input.route_options)
    ? input.route_options
    : [];
  const cacheEntries =
    input.cache_entries && typeof input.cache_entries === "object"
      ? input.cache_entries
      : {};
  const poiIndex = buildPoiIndex(input);

  // dedupe stops
  const seen = new Set();
  const stops = [];
  for (const route of routeOptions) {
    for (const stop of Array.isArray(route?.stops) ? route.stops : []) {
      const label = String(stop || "").trim();
      const k = normalizeKey(label);
      if (!label || seen.has(k)) continue;
      seen.add(k);
      stops.push(label);
    }
  }

  const misses = [];
  const cacheUpserts = {};
  const mediaByStop = {};
  const pointsByStop = {};

  for (const stop of stops) {
    const cacheKey = normalizeStopCacheKey(stop);
    const cached = cacheEntries[cacheKey];
    let record = null;
    if (
      cached &&
      typeof cached === "object" &&
      (cached.image || cached.subtitle)
    ) {
      record = {
        name: stop,
        source_poi_name: firstStr(cached.source_poi_name, cached.name),
        image: firstStr(cached.image),
        subtitle: firstStr(cached.subtitle),
        lat: toFinite(cached.lat),
        lng: toFinite(cached.lng),
      };
    } else {
      const found = findBestPoiForStop(stop, input, poiIndex);
      if (!found) {
        misses.push({ stop, cache_key: cacheKey });
      } else {
        record = { ...found, name: stop, source_poi_name: found.name };
        cacheUpserts[cacheKey] = {
          key: cacheKey,
          name: stop,
          evidence_name: stop,
          source_poi_name: found.name || "",
          image: found.image || "",
          subtitle: found.subtitle || "",
          ...(Number.isFinite(found.lat) ? { lat: found.lat } : {}),
          ...(Number.isFinite(found.lng) ? { lng: found.lng } : {}),
          raw: found.raw || {},
        };
      }
    }
    if (!record) {
      continue;
    }
    if (record.image || record.subtitle)
      mediaByStop[stop] = {
        ...(record.image ? { image: record.image } : {}),
        ...(record.subtitle ? { subtitle: record.subtitle } : {}),
      };
    if (Number.isFinite(record.lat) && Number.isFinite(record.lng))
      pointsByStop[stop] = { lat: record.lat, lng: record.lng, label: stop };
  }

  const routeStopMedia = {};
  const routeStopPoints = {};
  for (const route of routeOptions) {
    const routeId = String(route?.route_id || "").trim();
    if (!routeId) continue;
    const media = {};
    const points = {};
    for (const stop of Array.isArray(route?.stops) ? route.stops : []) {
      const label = String(stop || "").trim();
      if (mediaByStop[label]) media[label] = mediaByStop[label];
      if (pointsByStop[label]) points[label] = pointsByStop[label];
    }
    if (Object.keys(media).length > 0) routeStopMedia[routeId] = media;
    if (Object.keys(points).length > 0) routeStopPoints[routeId] = points;
  }

  return {
    route_options_count: routeOptions.length,
    stop_count: stops.length,
    cache_hit_count:
      Object.keys(mediaByStop).length - Object.keys(cacheUpserts).length,
    fresh_match_count: Object.keys(cacheUpserts).length,
    miss_count: misses.length,
    misses,
    cache_upserts: cacheUpserts,
    route_stop_media: routeStopMedia,
    route_stop_points: routeStopPoints,
  };
}

// ─── 导出函数（供 db.mjs delegate 使用）──────────────────────────────────────

/**
 * 批量查询缓存，返回 { ok, hit_count, miss_count, misses, entries }
 */
export function getPoiCache(keys, includeExpired = false) {
  const normalizedKeys = (Array.isArray(keys) ? keys : [])
    .map(normalizeStopCacheKey)
    .filter(Boolean);
  const store = loadPoiCacheStore();
  const entries = {};
  const misses = [];
  const now = new Date();
  for (const key of normalizedKeys) {
    const hit = store.entries[key];
    if (!hit) {
      misses.push(key);
      continue;
    }
    const expired = isExpired(hit, now);
    if (expired && !includeExpired) {
      misses.push(key);
      continue;
    }
    entries[key] = { ...hit, expired };
  }
  return {
    ok: true,
    keys_requested: normalizedKeys.length,
    hit_count: Object.keys(entries).length,
    miss_count: misses.length,
    misses,
    entries,
  };
}

/**
 * 写入/更新缓存条目，payload = { entries: { key: entry } } 或 { entries: entry[] }
 */
export function savePoiCache(payload, defaultTtlHours = 72) {
  const store = loadPoiCacheStore();
  const upsertCandidates = [];
  if (Array.isArray(payload?.entries)) {
    for (const item of payload.entries) {
      if (!item || typeof item !== "object") continue;
      const key = normalizeStopCacheKey(
        item.key || item.evidence_name || item.name,
      );
      if (key) upsertCandidates.push([key, item]);
    }
  } else if (payload?.entries && typeof payload.entries === "object") {
    for (const [rawKey, item] of Object.entries(payload.entries)) {
      const key = normalizeStopCacheKey(
        rawKey || item?.key || item?.evidence_name || item?.name,
      );
      if (key && item && typeof item === "object")
        upsertCandidates.push([key, item]);
    }
  }
  let upserted = 0;
  for (const [key, item] of upsertCandidates) {
    store.entries[key] = normalizeEntry(
      key,
      item,
      Number(item.ttl_hours || defaultTtlHours),
    );
    upserted++;
  }
  store.updated_at = new Date().toISOString();
  savePoiCacheStore(store);
  return {
    ok: true,
    upserted,
    total_entries: Object.keys(store.entries).length,
    updated_at: store.updated_at,
  };
}

/**
 * 从缓存 entries 构建 stop_media 平铺映射 { 景点名: { image, subtitle } }。
 * 现在使用“景点名主键”模式；destination/provider 过滤参数仅保留兼容。
 */
export function buildStopMedia(destinationText, provider = "flyai") {
  const store = loadPoiCacheStore();
  const stopMedia = {};
  const stopPoints = {};
  for (const [key, entry] of Object.entries(store.entries)) {
    const stopName = entry.evidence_name || entry.name || key;
    if (!stopName) continue;
    if (isExpired(entry)) continue;
    if (entry.image || entry.subtitle) {
      stopMedia[stopName] = {
        ...(entry.image ? { image: entry.image } : {}),
        ...(entry.subtitle ? { subtitle: entry.subtitle } : {}),
      };
    }
    const lat = toFinite(entry.lat);
    const lng = toFinite(entry.lng);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      stopPoints[stopName] = { lat, lng, label: stopName };
    }
  }
  return {
    stop_media: stopMedia,
    stop_points: stopPoints,
    count: Object.keys(stopMedia).length,
  };
}

// ─── CLI 入口 ────────────────────────────────────────────────────────────────

const ALLOWED_FLAGS = [
  "cmd",
  "keys",
  "include-expired",
  "payload",
  "ttl-hours",
  "destination",
  "provider",
];

function printHelp() {
  console.log(`poi-cache.mjs — POI 缓存独立工具（整合 get/save/build-stop-media）

Commands:
  --cmd=get              批量查缓存
    --keys='["dest|stop|flyai",...]'   (required)
    --include-expired=true             (optional, default false)

  --cmd=save             写入缓存条目
    --payload='{"entries":{...}}'      (required, 或 @file)
    --ttl-hours=72                     (optional)

  --cmd=build-stop-media 从缓存输出 stop_media 平铺映射（供 A-4 使用）
    --destination=川西                 (optional, 过滤目的地)
    --provider=flyai                   (optional, 默认 flyai)
`);
}

// 仅当直接执行时运行（被 import 时跳过）
import { fileURLToPath } from "node:url";
const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] === __filename) {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv[0] === "--help" || argv[0] === "-h") {
    printHelp();
    process.exit(0);
  }
  const args = parseCliArgs(argv);
  assertOnlyFlags(args, ALLOWED_FLAGS);
  const cmd = args.cmd;
  if (!cmd) {
    console.error("Error: --cmd=<get|save|build-stop-media> is required");
    process.exit(1);
  }

  if (cmd === "get") {
    const keys = readJsonFromCliValue("keys", args.keys, undefined);
    const includeExpired =
      String(args["include-expired"] || "").toLowerCase() === "true";
    console.log(JSON.stringify(getPoiCache(keys, includeExpired), null, 2));
  } else if (cmd === "save") {
    const payload = readJsonFromCliValue("payload", args.payload, undefined);
    const ttl = Number(args["ttl-hours"] || 72);
    console.log(JSON.stringify(savePoiCache(payload, ttl), null, 2));
  } else if (cmd === "build-stop-media") {
    const destination = String(args.destination || "");
    const provider = String(args.provider || "flyai");
    console.log(JSON.stringify(buildStopMedia(destination, provider), null, 2));
  } else {
    console.error(
      `Error: unknown --cmd=${cmd}. Use get | save | build-stop-media`,
    );
    process.exit(1);
  }
}
