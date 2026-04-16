/**
 * Travel Planner Database Manager (Node port of travel_db.py)
 * Persists preferences and trips under ~/.openclaw/agents/travel-planner/
 *
 * POI cache operations (get_poi_cache / save_poi_cache) delegate to poi-cache.mjs.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  assertOnlyFlags,
  readJsonFromCliValue,
  requireCmd,
  requireFlag,
  runScript,
} from "./cli_args.mjs";
import {
  getPreferencesFilePath,
  getPreferences,
  setPreferencesDbDirForTests,
} from "./preferences.mjs";
import {
  addExpense,
  addTrip,
  addItineraryItem,
  deleteTrip,
  endTrip,
  getActiveTrips,
  getBudgetSummary,
  getSelectedRoute,
  getTripById,
  getTripExpenses,
  getTrips,
  getItinerary,
  moveTripToPast,
  normalizeTripRecord,
  setTripsDbDirForTests,
  STAGE_VALUES,
  updateTrip,
} from "./trips.mjs";
import {
  checkStepGate,
  confirmBookingChoice,
  confirmRouteChoice,
  getRouteEvidence,
  saveBookingReadyPackage,
  saveLiveResults,
  saveRouteEvidence,
  saveRouteFramingWithSource,
  saveXhsEvidence,
  setTripWorkflowDbDirForTests,
  startTrip,
} from "./trip-workflow.mjs";

export {
  addPreviousDestination,
  addToBucketList,
  getPreferences,
  getPreferencesFilePath,
  isInitialized,
  normalizePacePreference,
  savePreferences,
  setPreferencesDbDirForTests,
  updatePreference,
} from "./preferences.mjs";

export {
  addExpense,
  addTrip,
  addItineraryItem,
  deleteTrip,
  endTrip,
  getActiveTrips,
  getBudgetSummary,
  getSelectedRoute,
  getTripArtifactsDir,
  getTripById,
  getTripExpenses,
  getTrips,
  getItinerary,
  moveTripToPast,
  normalizeTripRecord,
  readStep4PlanOutput,
  readStep5RouteValidation,
  updateTrip,
} from "./trips.mjs";

export {
  checkStepGate,
  confirmBookingChoice,
  confirmRouteChoice,
  getRouteEvidence,
  saveBookingReadyPackage,
  saveLiveResults,
  saveRouteEvidence,
  saveRouteFramingWithSource,
  saveXhsEvidence,
  startTrip,
} from "./trip-workflow.mjs";

/** @type {string | null} */
let dbDirOverride = null;

/** For tests only: redirect DB to a temp directory. */
export function setTravelPlannerDbDirForTests(dir) {
  dbDirOverride = dir;
  setPreferencesDbDirForTests(dir);
  setTripsDbDirForTests(dir);
  setTripWorkflowDbDirForTests(dir);
}

function dbDir() {
  if (process.env.TRAVEL_PLANNER_DB_DIR) {
    return process.env.TRAVEL_PLANNER_DB_DIR;
  }
  return dbDirOverride ?? path.join(os.homedir(), ".openclaw", "agents", "travel-planner");
}

const tripsFile = () => path.join(dbDir(), "trips.json");
const dataDir = () => path.join(dbDir(), "data");
const evidenceDir = () => path.join(dataDir(), "evidence");
const poiCacheFile = () => path.join(dataDir(), "poi-cache.json");


export function ensureDbFiles() {
  fs.mkdirSync(dbDir(), { recursive: true });
  fs.mkdirSync(evidenceDir(), { recursive: true });

  // Delegate preferences initialization to preferences.mjs as the single source of truth.
  getPreferences();

  if (!fs.existsSync(tripsFile())) {
    const defaultTrips = {
      schema_version: 2,
      current_trips: [],
      past_trips: [],
      trip_ideas: [],
    };
    fs.writeFileSync(tripsFile(), JSON.stringify(defaultTrips, null, 2), "utf8");
  }

  if (!fs.existsSync(poiCacheFile())) {
    const defaultPoiCache = {
      schema_version: 1,
      entries: {},
      updated_at: new Date().toISOString(),
    };
    fs.writeFileSync(poiCacheFile(), JSON.stringify(defaultPoiCache, null, 2), "utf8");
  }
}

function loadJson(filePath) {
  ensureDbFiles();
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function saveJson(filePath, data) {
  ensureDbFiles();
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function normalizePoiCacheKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\|+/g, "|");
}

function toFiniteNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return NaN;
  const parsed = Number.parseFloat(value.trim());
  return Number.isFinite(parsed) ? parsed : NaN;
}

function loadPoiCacheStore() {
  const raw = loadJson(poiCacheFile());
  const entries = raw?.entries && typeof raw.entries === "object" ? raw.entries : {};
  return {
    schema_version: Number(raw?.schema_version || 1),
    entries,
    updated_at: String(raw?.updated_at || ""),
  };
}

function savePoiCacheStore(store) {
  saveJson(poiCacheFile(), {
    schema_version: 1,
    entries: store.entries || {},
    updated_at: new Date().toISOString(),
  });
}

function normalizePoiCacheEntry(key, value, ttlHours = 72) {
  const now = new Date();
  const fallbackFetchedAt = now.toISOString();
  const fetchedAtRaw = String(value?.fetched_at || "").trim();
  const fetchedAt = fetchedAtRaw || fallbackFetchedAt;
  const ttl = Number.isFinite(Number(ttlHours)) ? Number(ttlHours) : 72;
  const expiresAt = new Date(now.getTime() + Math.max(1, ttl) * 3600_000).toISOString();
  const lat = toFiniteNumber(value?.lat);
  const lng = toFiniteNumber(value?.lng);
  return {
    key,
    name: String(value?.name || ""),
    destination_text: String(value?.destination_text || ""),
    provider: String(value?.provider || "flyai"),
    image: String(value?.image || ""),
    subtitle: String(value?.subtitle || ""),
    source_url: String(value?.source_url || ""),
    ...(Number.isFinite(lat) ? { lat } : {}),
    ...(Number.isFinite(lng) ? { lng } : {}),
    fetched_at: fetchedAt,
    expires_at: String(value?.expires_at || expiresAt),
    raw: value?.raw && typeof value.raw === "object" ? value.raw : {},
  };
}

function isPoiCacheEntryExpired(entry, now = new Date()) {
  const expiresAt = String(entry?.expires_at || "").trim();
  if (!expiresAt) return true;
  const ts = Date.parse(expiresAt);
  if (Number.isNaN(ts)) return true;
  return ts <= now.getTime();
}

export function getPoiCache(keys, includeExpired = false) {
  const normalizedKeys = (Array.isArray(keys) ? keys : [])
    .map((key) => normalizePoiCacheKey(key))
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
    const expired = isPoiCacheEntryExpired(hit, now);
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

export function savePoiCache(payload, defaultTtlHours = 72) {
  const store = loadPoiCacheStore();
  const now = new Date().toISOString();
  const upsertCandidates = [];
  if (Array.isArray(payload?.entries)) {
    for (const item of payload.entries) {
      if (!item || typeof item !== "object") continue;
      const key = normalizePoiCacheKey(item.key);
      if (!key) continue;
      upsertCandidates.push([key, item]);
    }
  } else if (payload?.entries && typeof payload.entries === "object") {
    for (const [rawKey, item] of Object.entries(payload.entries)) {
      const key = normalizePoiCacheKey(rawKey);
      if (!key || !item || typeof item !== "object") continue;
      upsertCandidates.push([key, item]);
    }
  }
  let upserted = 0;
  for (const [key, item] of upsertCandidates) {
    const ttlHours = Number(item.ttl_hours || defaultTtlHours);
    store.entries[key] = normalizePoiCacheEntry(key, item, ttlHours);
    upserted++;
  }
  store.updated_at = now;
  savePoiCacheStore(store);
  return {
    ok: true,
    upserted,
    total_entries: Object.keys(store.entries).length,
    updated_at: now,
  };
}

export function setTripStage(tripId, stage) {
  return updateTrip(tripId, { stage });
}

export function getTravelStats() {
  const trips = loadJson(tripsFile());
  const prefs = getPreferences();
  const pastTrips = trips.past_trips || [];
  const currentTrips = trips.current_trips || [];

  const countriesVisited = new Set();
  const citiesVisited = new Set();
  let totalDays = 0;
  let totalSpent = 0;

  for (const trip of pastTrips) {
    const dest = trip.destination;
    if (dest?.country) countriesVisited.add(dest.country);
    if (dest?.city) citiesVisited.add(dest.city);
    if (trip.duration_days) totalDays += trip.duration_days;
    totalSpent += trip.budget?.spent || 0;
  }

  return {
    total_trips: pastTrips.length,
    countries_visited: countriesVisited.size,
    cities_visited: citiesVisited.size,
    total_days_traveled: totalDays,
    total_spent: totalSpent,
    current_trips: currentTrips.length,
    bucket_list_size: (prefs.bucket_list || []).length,
    countries_list: [...countriesVisited].sort(),
    average_trip_duration: pastTrips.length ? totalDays / pastTrips.length : 0,
  };
}

export function exportAll() {
  return {
    preferences: getPreferences(),
    trips: getTrips("all"),
    stats: getTravelStats(),
    exported_at: new Date().toISOString(),
  };
}

export function resetAll() {
  for (const filePath of [getPreferencesFilePath(), tripsFile()]) {
    try {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch {
      /* ignore */
    }
  }
  ensureDbFiles();
}

// All known flags across all --cmd values (used for flag validation per-command).
const CMD_FLAGS = {
  get_trips: ["cmd", "status"],
  get_trip: ["cmd", "trip-id"],
  get_active_trips: ["cmd"],
  add_trip: ["cmd", "payload", "list"],
  patch_trip: ["cmd", "trip-id", "payload"],
  update_trip: ["cmd", "trip-id", "payload"],
  save_live_results: ["cmd", "trip-id", "payload"],
  save_booking_ready: ["cmd", "trip-id", "payload"],
  save_route_evidence: ["cmd", "trip-id", "platform", "payload"],
  get_poi_cache: ["cmd", "keys", "include-expired"],
  save_poi_cache: ["cmd", "payload", "ttl-hours"],
  get_route_evidence: ["cmd", "trip-id", "platform"],
  check_step_gate: ["cmd", "trip-id", "step"],
  save_route_plan: [
    "cmd",
    "trip-id",
    "recommended-route",
    "alternatives",
    "rejected-routes",
    "decision-summary",
    "route-source-used",
    "source-reason",
    "route-source-preference",
    "route-source-fallbacks",
  ],
  confirm_route_choice: ["cmd", "trip-id", "route-id"],
  confirm_booking: ["cmd", "trip-id", "category", "payload"],
  start_trip: ["cmd", "trip-id"],
  stats: ["cmd"],
  export: ["cmd"],
  reset: ["cmd"],
};

runScript({
  name: "db.mjs",
  description: "旅行规划数据库管理器，本地 JSON 存储于 ~/.openclaw/agents/travel-planner/",
  usage: "node db.mjs --cmd=<name> [其他 flag...]",
  flags: Object.keys(CMD_FLAGS)
    .flatMap((cmd) => CMD_FLAGS[cmd].map((f) => ({ name: f, desc: `用于 --cmd=${cmd}` })))
    .filter((f, i, arr) => arr.findIndex((x) => x.name === f.name) === i),
  required: ["cmd"],
  callerUrl: import.meta.url,
  run(args) {
    const command = requireCmd(args);
    // Per-command flag guard
    const allowed =
      CMD_FLAGS[command] ?? CMD_FLAGS[command === "update_trip" ? "patch_trip" : command];
    if (allowed) assertOnlyFlags(args, allowed);
    if (command === "get_trips") {
      const status = args.status && args.status !== "" ? args.status : "all";
      console.log(JSON.stringify(getTrips(status), null, 2));
    } else if (command === "get_trip") {
      const tripId = requireFlag(args, "trip-id");
      console.log(JSON.stringify(getTripById(tripId) || {}, null, 2));
    } else if (command === "get_active_trips") {
      console.log(JSON.stringify({ active_trips: getActiveTrips() }, null, 2));
    } else if (command === "add_trip") {
      const payload = readJsonFromCliValue("add_trip", args.payload, undefined);
      const listRaw = args.list && args.list !== "" ? args.list : "current";
      const status = listRaw === "past" ? "past" : listRaw === "idea" ? "idea" : "current";
      try {
        const tripId = addTrip(payload, status);
        console.log(JSON.stringify({ ok: true, trip_id: tripId }, null, 2));
      } catch (e) {
        console.error(`Error: add_trip failed (${e instanceof Error ? e.message : String(e)})`);
        process.exit(1);
      }
    } else if (command === "patch_trip" || command === "update_trip") {
      const tripId = requireFlag(args, "trip-id");
      const payload = readJsonFromCliValue(command, args.payload, undefined);
      try {
        const ok = updateTrip(tripId, payload);
        console.log(JSON.stringify({ ok }, null, 2));
        if (!ok) {
          console.error(`Error: trip not found: ${tripId}`);
          process.exit(1);
        }
      } catch (e) {
        console.error(`Error: ${e instanceof Error ? e.message : String(e)}`);
        process.exit(1);
      }
    } else if (command === "save_live_results") {
      const tripId = requireFlag(args, "trip-id");
      const payload = readJsonFromCliValue("save_live_results", args.payload, {});
      console.log(JSON.stringify({ ok: saveLiveResults(tripId, payload) }, null, 2));
    } else if (command === "save_booking_ready") {
      const tripId = requireFlag(args, "trip-id");
      const payload = readJsonFromCliValue("save_booking_ready", args.payload, {});
      console.log(JSON.stringify({ ok: saveBookingReadyPackage(tripId, payload) }, null, 2));
    } else if (command === "save_route_evidence") {
      const tripId = requireFlag(args, "trip-id");
      const platform = requireFlag(args, "platform");
      const payload = readJsonFromCliValue("save_route_evidence", args.payload, {});
      const ok = saveRouteEvidence(tripId, platform, payload);
      console.log(JSON.stringify({ ok }, null, 2));
      if (!ok) {
        console.error(`Error: trip not found: ${tripId}`);
        process.exit(1);
      }
    } else if (command === "get_poi_cache") {
      // Delegated to poi-cache.mjs — kept here for backward compatibility.
      const keysRaw = readJsonFromCliValue("keys", args.keys, []);
      const keys = Array.isArray(keysRaw) ? keysRaw : [];
      const includeExpired =
        String(args["include-expired"] || "")
          .trim()
          .toLowerCase() === "true";
      console.log(JSON.stringify(getPoiCache(keys, includeExpired), null, 2));
    } else if (command === "save_poi_cache") {
      // Delegated to poi-cache.mjs — kept here for backward compatibility.
      const payload = readJsonFromCliValue("save_poi_cache", args.payload, {});
      const ttlHours = Number(args["ttl-hours"] || 72);
      console.log(JSON.stringify(savePoiCache(payload, ttlHours), null, 2));
    } else if (command === "get_route_evidence") {
      const tripId = requireFlag(args, "trip-id");
      const platform = String(args.platform || "");
      const result = getRouteEvidence(tripId, platform);
      console.log(JSON.stringify(result || {}, null, 2));
      if (!result) {
        console.error(`Error: trip not found: ${tripId}`);
        process.exit(1);
      }
    } else if (command === "check_step_gate") {
      const tripId = requireFlag(args, "trip-id");
      const step = requireFlag(args, "step");
      const result = checkStepGate(tripId, step);
      console.log(JSON.stringify(result || {}, null, 2));
      if (!result) {
        console.error(`Error: trip not found: ${tripId}`);
        process.exit(1);
      }
    } else if (command === "save_route_plan") {
      const tripId = requireFlag(args, "trip-id");
      const recommendedRoute = readJsonFromCliValue(
        "recommended-route",
        args["recommended-route"],
        {},
      );
      const alternatives = readJsonFromCliValue("alternatives", args.alternatives, []);
      const rejectedRoutes = readJsonFromCliValue("rejected-routes", args["rejected-routes"], []);
      const decisionSummary = readJsonFromCliValue(
        "decision-summary",
        args["decision-summary"],
        {},
      );
      const routeSourceUsed = String(args["route-source-used"] || "");
      const sourceReason = String(args["source-reason"] || "");
      const routeSourcePref = String(args["route-source-preference"] || "");
      const fallbackChain = (() => {
        const raw = readJsonFromCliValue(
          "route-source-fallbacks",
          args["route-source-fallbacks"],
          [],
        );
        return Array.isArray(raw) ? raw : [];
      })();
      const fallbackCount = fallbackChain.length;
      const fallbackReason = fallbackCount > 0 ? String(fallbackChain[0]?.reason || "") : "";
      // Single write — sourceReason + routeSourcePref merged in
      const ok = saveRouteFramingWithSource(
        tripId,
        recommendedRoute,
        alternatives,
        rejectedRoutes,
        decisionSummary,
        routeSourceUsed,
        fallbackCount,
        fallbackReason,
        fallbackChain,
        sourceReason,
        routeSourcePref,
      );
      console.log(JSON.stringify({ ok }, null, 2));
      if (!ok) {
        console.error(`Error: trip not found: ${tripId}`);
        process.exit(1);
      }
    } else if (command === "confirm_route_choice") {
      const tripId = requireFlag(args, "trip-id");
      const routeId = requireFlag(args, "route-id");
      const ok = confirmRouteChoice(tripId, routeId);
      console.log(JSON.stringify({ ok }, null, 2));
      if (!ok) {
        console.error(
          `Error: confirm_route_choice failed (trip or route not found): ${tripId}/${routeId}`,
        );
        process.exit(1);
      }
    } else if (command === "confirm_booking") {
      const tripId = requireFlag(args, "trip-id");
      const category = requireFlag(args, "category");
      const payload = readJsonFromCliValue("confirm_booking", args.payload, {});
      console.log(JSON.stringify({ ok: confirmBookingChoice(tripId, category, payload) }, null, 2));
    } else if (command === "start_trip") {
      const tripId = requireFlag(args, "trip-id");
      console.log(JSON.stringify({ ok: startTrip(tripId) }, null, 2));
    } else if (command === "stats") {
      console.log(JSON.stringify(getTravelStats(), null, 2));
    } else if (command === "export") {
      console.log(JSON.stringify(exportAll(), null, 2));
    } else if (command === "reset") {
      console.error("重置操作不支持非交互调用；请删除 JSON 文件或使用 API。");
      process.exit(1);
    } else {
      console.error(`未知 --cmd 值: ${command}`);
      process.exit(1);
    }
  },
});
