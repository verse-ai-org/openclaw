/**
 * Travel Planner Database Manager (Node port of travel_db.py)
 * Persists preferences and trips under ~/.openclaw/agents/travel-planner/
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

/** @type {string | null} */
let dbDirOverride = null;

/** For tests only: redirect DB to a temp directory. */
export function setTravelPlannerDbDirForTests(dir) {
  dbDirOverride = dir;
}

function dbDir() {
  if (process.env.TRAVEL_PLANNER_DB_DIR) {
    return process.env.TRAVEL_PLANNER_DB_DIR;
  }
  return dbDirOverride ?? path.join(os.homedir(), ".openclaw", "agents", "travel-planner");
}

const preferencesFile = () => path.join(dbDir(), "preferences.json");
const tripsFile = () => path.join(dbDir(), "trips.json");
const dataDir = () => path.join(dbDir(), "data");
const evidenceDir = () => path.join(dataDir(), "evidence");

const DEFAULT_TRIP_STAGE = "intake";

/** Default values for all trip fields. Centralises the schema so that
 * normalizeTripRecord never needs per-field ??= assignments. */
const TRIP_DEFAULTS = {
  // ---- lifecycle ----
  stage: DEFAULT_TRIP_STAGE,
  planning_mode: "explore",

  // ---- trip intent / constraints ----
  destination_text: "",
  travel_month: null,
  travel_month_text: "",
  date_flexibility: "",
  transport_preferences: [],
  constraints: [],
  must_do: [],
  nice_to_have: [],

  // ---- route planning ----
  // selected_route is the active route snapshot:
  // - before confirm: current recommended route
  // - after confirm: user-chosen route
  selected_route: {},
  route_source_preference: "auto",
  route_source_used: "",
  route_source_fallbacks: [],
  route_evidence_meta: null,
  // Single source of truth for route candidates shown to user.
  route_options: [],
  route_choice_confirmed: false,
  chosen_route_id: "",
  route_plan: null,

  // ---- route validation ----
  route_validation: null,
  live_results: null,

  // ---- booking planning ----
  booking_strategy: {},
  booking_ready: null,
  bookings_confirmed: false,
  confirmed_bookings: {},

  // ---- in-trip / service preferences ----
  during_trip: false,
  daily_brief_preferences: { local_morning_hour: 7 },
  service_preferences: { daily_channel_brief: false, pre_trip_reminders: false },
};

function emptyRoutePlanning() {
  return {
    used_platform: "",
    fallback_count: 0,
    fallback_reason: "",
    fallback_chain: [],
    recommended_route: null,
    alternatives: [],
    rejected_routes: [],
    decision_summary: {},
  };
}

function emptyLiveValidation() {
  return {
    stage: "",
    priority_checks: [],
    tool_plan: {
      flights: [],
      pois: [],
      transport: [],
    },
    decision_gates: [],
    booking_ready_sections: [],
    response_upgrade_rule: "",
  };
}

function emptyBookingReady() {
  return {
    status: "",
    summary: {},
    recommended_sections: [],
    transport_options: [],
    hotel_options: [],
    anchor_pois: [],
    booking_watchouts: [],
    next_decision: "",
    decision_gates: [],
  };
}

function emptyLiveResults() {
  return {
    flights: {},
    hotels: {},
    pois: {},
    transport: {},
    updated_at: "",
  };
}

export function ensureDbFiles() {
  fs.mkdirSync(dbDir(), { recursive: true });
  fs.mkdirSync(evidenceDir(), { recursive: true });

  if (!fs.existsSync(preferencesFile())) {
    const defaultPrefs = {
      initialized: false,
      created_at: new Date().toISOString(),
      travel_style: "",
      budget_level: "",
      accommodation_preference: [],
      hotel_preferences: [],
      interests: [],
      dietary_restrictions: [],
      accessibility_needs: [],
      preferred_activities: [],
      pace_preference: "",
      travel_companions: "",
      departure_city: "",
      transport_preferences: [],
      walking_tolerance: "",
      room_requirements: [],
      language_skills: [],
      previous_destinations: [],
      bucket_list: [],
    };
    fs.writeFileSync(preferencesFile(), JSON.stringify(defaultPrefs, null, 2), "utf8");
  }

  if (!fs.existsSync(tripsFile())) {
    const defaultTrips = {
      schema_version: 2,
      current_trips: [],
      past_trips: [],
      trip_ideas: [],
    };
    fs.writeFileSync(tripsFile(), JSON.stringify(defaultTrips, null, 2), "utf8");
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

function sanitizeFileToken(value) {
  return String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, "_");
}

function evidenceFilePath(tripId, platform = "xhs") {
  const safeTripId = sanitizeFileToken(tripId);
  const safePlatform = sanitizeFileToken(platform || "xhs");
  return path.join(evidenceDir(), `${safeTripId}.${safePlatform}.json`);
}

function normalizePlatformName(platform) {
  const text = String(platform || "")
    .trim()
    .toLowerCase();
  if (!text) return "search";
  if (text === "xiaohongshu" || text === "小红书") return "xhs";
  if (text === "search" || text === "搜索" || text === "search_engine" || text === "搜索引擎") return "search";
  return text;
}

function normalizeEvidenceQuality(value) {
  const text = String(value || "")
    .trim()
    .toLowerCase();
  if (text === "high" || text === "medium" || text === "low") return text;
  return "low";
}

function normalizeVerificationStatus(value) {
  const text = String(value || "")
    .trim()
    .toLowerCase();
  if (text === "user_input_unverified") return "user_input_unverified";
  return "verified_by_platform_tool";
}

function normalizeEvidenceSourceItem(item, index) {
  const metricsRaw = item?.metrics && typeof item.metrics === "object" ? item.metrics : {};
  const metrics = {};
  for (const [key, value] of Object.entries(metricsRaw)) {
    if (value == null || value === "") continue;
    metrics[key] = value;
  }
  if (Number(item?.like_count || 0) > 0 && metrics.like_count == null) {
    metrics.like_count = Number(item.like_count);
  }
  if (Number(item?.save_count || 0) > 0 && metrics.save_count == null) {
    metrics.save_count = Number(item.save_count);
  }
  return {
    id: String(item?.id || `source_${index + 1}`),
    title: String(item?.title || ""),
    url: String(item?.url || ""),
    type: String(item?.type || item?.note_type || "generic"),
    metrics,
    raw: item?.raw && typeof item.raw === "object" ? item.raw : {},
  };
}

function normalizeEvidenceV1(platform, evidencePayload) {
  const payload = evidencePayload && typeof evidencePayload === "object" ? evidencePayload : {};
  const platformName = normalizePlatformName(payload.platform || platform);
  const sourcesRaw = Array.isArray(payload.sources) ? payload.sources : [];
  const sources = sourcesRaw
    .slice(0, 20)
    .map((item, index) => normalizeEvidenceSourceItem(item, index))
    .filter((item) => item.title || item.url);
  return {
    platform: platformName,
    evidence_version: String(payload.evidence_version || "v1"),
    query: payload.query && typeof payload.query === "object" ? payload.query : {},
    summary: String(payload.summary || ""),
    evidence_quality: normalizeEvidenceQuality(payload.evidence_quality),
    verification_status: normalizeVerificationStatus(payload.verification_status),
    generated_at: String(payload.generated_at || new Date().toISOString()),
    sources,
    route_hints: payload.route_hints && typeof payload.route_hints === "object" ? payload.route_hints : {},
    meta: payload.meta && typeof payload.meta === "object" ? payload.meta : {},
  };
}

function buildEvidenceMeta(evidence, evidencePath) {
  const sourceRefs = evidence.sources.slice(0, 3).map((item) => ({
    id: item.id,
    title: item.title,
    url: item.url,
    type: item.type,
    metrics: item.metrics || {},
  }));
  return {
    platform: evidence.platform,
    evidence_version: evidence.evidence_version,
    quality: evidence.evidence_quality,
    verification_status: evidence.verification_status,
    query: evidence.query || {},
    source_count: evidence.sources.length,
    source_refs: sourceRefs,
    evidence_file: path.relative(dbDir(), evidencePath),
    generated_at: evidence.generated_at,
  };
}

function requiresStrictEvidence(platform) {
  return platform === "xhs" || platform === "amap";
}

function hasRequiredEvidence(meta, usedPlatform) {
  if (!meta || typeof meta !== "object") return false;
  if (normalizePlatformName(meta.platform) !== usedPlatform) return false;
  const sourceCount = Number(meta.source_count || 0);
  return sourceCount > 0 && String(meta.evidence_file || "").trim() !== "";
}

export function normalizeTripRecord(trip) {
  // Merge defaults first (preserves existing values), then fix up object fields
  // that need to be initialised from factory functions rather than plain literals.
  Object.assign(trip, { ...TRIP_DEFAULTS, ...trip });
  // Open-phase schema cleanup: actively drop deprecated duplicated fields.
  delete trip.route_candidates;
  delete trip.source_reason;
  if (!trip.route_plan) trip.route_plan = emptyRoutePlanning();
  if (!trip.route_evidence_meta) trip.route_evidence_meta = {};
  if (!trip.route_validation) trip.route_validation = emptyLiveValidation();
  if (!trip.live_results) trip.live_results = emptyLiveResults();
  if (!trip.booking_ready) trip.booking_ready = emptyBookingReady();
  return trip;
}

export function isInitialized() {
  const prefs = loadJson(preferencesFile());
  return prefs.initialized === true;
}

export function getPreferences() {
  const prefs = loadJson(preferencesFile());
  prefs.hotel_preferences ??= [];
  prefs.departure_city ??= "";
  prefs.transport_preferences ??= [];
  prefs.walking_tolerance ??= "";
  prefs.room_requirements ??= [];
  return prefs;
}

export function savePreferences(preferences) {
  const prefs = loadJson(preferencesFile());
  Object.assign(prefs, preferences);
  prefs.initialized = true;
  prefs.last_updated = new Date().toISOString();
  saveJson(preferencesFile(), prefs);
}

export function updatePreference(key, value) {
  const prefs = loadJson(preferencesFile());
  prefs[key] = value;
  prefs.last_updated = new Date().toISOString();
  saveJson(preferencesFile(), prefs);
}

export function addToBucketList(destination, notes = "") {
  const prefs = loadJson(preferencesFile());
  prefs.bucket_list ??= [];
  prefs.bucket_list.push({
    destination,
    notes,
    added_at: new Date().toISOString(),
  });
  saveJson(preferencesFile(), prefs);
}

export function addPreviousDestination(destination) {
  const prefs = loadJson(preferencesFile());
  prefs.previous_destinations ??= [];
  if (!prefs.previous_destinations.includes(destination)) {
    prefs.previous_destinations.push(destination);
  }
  saveJson(preferencesFile(), prefs);
}

export function getTrips(status = "all") {
  const trips = loadJson(tripsFile());
  for (const key of ["current_trips", "past_trips", "trip_ideas"]) {
    trips[key] ??= [];
    trips[key] = trips[key].map((t) => normalizeTripRecord(t));
  }

  if (status === "all") return trips;
  if (status === "current" || status === "past" || status === "ideas") {
    const key = status === "ideas" ? "trip_ideas" : `${status}_trips`;
    return { [key]: trips[key] ?? [] };
  }
  return {};
}

export function addTrip(trip, status = "current") {
  const trips = loadJson(tripsFile());
  const tripId = String(Date.now() / 1000);
  trip.id = tripId;
  trip.created_at = new Date().toISOString();
  normalizeTripRecord(trip);

  if (status === "current") trips.current_trips.push(trip);
  else if (status === "past") trips.past_trips.push(trip);
  else if (status === "idea") trips.trip_ideas.push(trip);

  saveJson(tripsFile(), trips);
  return tripId;
}

export function updateTrip(tripId, updates) {
  const trips = loadJson(tripsFile());
  for (const tripList of [trips.current_trips, trips.past_trips, trips.trip_ideas]) {
    for (const trip of tripList) {
      if (trip.id === tripId) {
        Object.assign(trip, updates);
        normalizeTripRecord(trip);
        trip.updated_at = new Date().toISOString();
        saveJson(tripsFile(), trips);
        return true;
      }
    }
  }
  return false;
}

export function getTripById(tripId) {
  const trips = loadJson(tripsFile());
  for (const tripList of [trips.current_trips, trips.past_trips, trips.trip_ideas]) {
    for (const trip of tripList) {
      if (trip.id === tripId) return normalizeTripRecord({ ...trip });
    }
  }
  return null;
}

export function setTripStage(tripId, stage) {
  return updateTrip(tripId, { stage });
}

export function saveRouteFramingWithSource(
  tripId,
  recommendedRoute,
  alternatives,
  rejectedRoutes,
  decisionSummary,
  usedPlatform = "",
  fallbackCount = 0,
  fallbackReason = "",
  fallbackChain = [],
  sourceReason = "",
  routeSourcePreference = "",
) {
  const trip = getTripById(tripId);
  if (!trip) return false;
  const routeOptions =
    recommendedRoute && Object.keys(recommendedRoute).length
      ? [recommendedRoute, ...(alternatives || [])]
      : alternatives || [];
  const platform = normalizePlatformName(usedPlatform || "");
  const evidenceMeta = trip.route_evidence_meta || {};
  if (requiresStrictEvidence(platform) && !hasRequiredEvidence(evidenceMeta, platform)) {
    return false;
  }
  if (routeOptions.length < 2) return false;
  const normalizedFallbacks = Array.isArray(fallbackChain) ? fallbackChain : [];
  const normalizedDecisionSummary = {
    ...(decisionSummary && typeof decisionSummary === "object" ? decisionSummary : {}),
    ...(sourceReason ? { source_reason: sourceReason } : {}),
  };
  const updates = {
    stage: "route_plan",
    selected_route: recommendedRoute || {},
    route_options: routeOptions,
    route_choice_confirmed: false,
    chosen_route_id: "",
    route_source_used: usedPlatform || "",
    route_source_fallbacks: normalizedFallbacks,
    ...(routeSourcePreference ? { route_source_preference: routeSourcePreference } : {}),
    route_plan: {
      used_platform: usedPlatform || "",
      fallback_count: Number.isFinite(Number(fallbackCount)) ? Number(fallbackCount) : 0,
      fallback_reason: fallbackReason || "",
      fallback_chain: normalizedFallbacks,
      recommended_route: recommendedRoute,
      alternatives: alternatives || [],
      rejected_routes: rejectedRoutes || [],
      decision_summary: normalizedDecisionSummary,
    },
  };
  return updateTrip(tripId, updates);
}

export function confirmRouteChoice(tripId, routeId) {
  const trip = getTripById(tripId);
  if (!trip) return false;
  const options = trip.route_options || [];
  if (!Array.isArray(options) || options.length < 2) return false;
  const chosen = options.find((option) => option?.route_id === routeId);
  if (!chosen) return false;
  return updateTrip(tripId, {
    selected_route: chosen,
    route_choice_confirmed: true,
    chosen_route_id: routeId,
    stage: "plan_ready",
  });
}

export function saveXhsEvidence(tripId, xhsEvidence) {
  return saveRouteEvidence(tripId, "xhs", xhsEvidence);
}

export function saveRouteEvidence(tripId, platform, evidencePayload) {
  const normalized = normalizeEvidenceV1(platform, evidencePayload);
  const platformName = normalized.platform;
  const evidencePath = evidenceFilePath(tripId, platformName);
  saveJson(evidencePath, normalized);
  return updateTrip(tripId, {
    route_evidence_meta: buildEvidenceMeta(normalized, evidencePath),
  });
}

export function getRouteEvidence(tripId, platform = "") {
  const trip = getTripById(tripId);
  if (!trip) return null;
  const selectedPlatform = normalizePlatformName(platform || "");
  const hasExplicitPlatform = String(platform || "").trim() !== "";
  const defaultMeta = trip.route_evidence_meta || {};
  const relPath = hasExplicitPlatform
    ? path.relative(dbDir(), evidenceFilePath(tripId, selectedPlatform))
    : String(defaultMeta.evidence_file || "");
  let payload = null;
  let meta = defaultMeta;
  if (relPath) {
    const absPath = path.join(dbDir(), relPath);
    if (fs.existsSync(absPath)) {
      payload = loadJson(absPath);
      if (hasExplicitPlatform) {
        const normalized = normalizeEvidenceV1(selectedPlatform, payload || {});
        meta = buildEvidenceMeta(normalized, absPath);
      }
    }
  }
  return {
    trip_id: tripId,
    meta,
    evidence: payload,
  };
}

export function saveLiveResults(tripId, liveResults) {
  const normalized = { ...emptyLiveResults(), ...liveResults };
  normalized.updated_at = new Date().toISOString();
  return updateTrip(tripId, { live_results: normalized });
}

export function saveBookingReadyPackage(tripId, bookingReady) {
  const nextStage = bookingReady?.status === "ready" ? "ready_to_book" : "plan_ready";
  return updateTrip(tripId, { booking_ready: bookingReady, stage: nextStage });
}

export function confirmBookingChoice(tripId, category, choice) {
  const trip = getTripById(tripId);
  if (!trip) return false;
  const confirmed = { ...trip.confirmed_bookings };
  confirmed[category] = choice;
  const updates = { confirmed_bookings: confirmed };
  if (category === "flight" || category === "hotel") {
    updates.bookings_confirmed = true;
    updates.stage = "ready_to_book";
  }
  return updateTrip(tripId, updates);
}

export function startTrip(tripId) {
  return updateTrip(tripId, { stage: "in_trip", during_trip: true });
}

export function endTrip(tripId) {
  return updateTrip(tripId, { during_trip: false });
}

export function moveTripToPast(tripId) {
  const trips = loadJson(tripsFile());
  for (let i = 0; i < trips.current_trips.length; i++) {
    if (trips.current_trips[i].id === tripId) {
      const trip = trips.current_trips[i];
      trip.completed_at = new Date().toISOString();
      normalizeTripRecord(trip);
      trips.current_trips.splice(i, 1);
      trips.past_trips.push(trip);
      saveJson(tripsFile(), trips);
      return true;
    }
  }
  return false;
}

export function deleteTrip(tripId) {
  const trips = loadJson(tripsFile());
  for (const tripList of [trips.current_trips, trips.past_trips, trips.trip_ideas]) {
    for (let i = 0; i < tripList.length; i++) {
      if (tripList[i].id === tripId) {
        tripList.splice(i, 1);
        saveJson(tripsFile(), trips);
        return true;
      }
    }
  }
  return false;
}

export function addExpense(tripId, expense) {
  const trips = loadJson(tripsFile());
  for (const tripList of [trips.current_trips, trips.past_trips]) {
    for (const trip of tripList) {
      if (trip.id === tripId) {
        trip.expenses ??= [];
        expense.id = Date.now() / 1000;
        expense.date ??= new Date().toISOString();
        trip.expenses.push(expense);
        trip.budget ??= {};
        const total = trip.expenses.reduce((s, e) => s + (e.amount || 0), 0);
        trip.budget.spent = total;
        saveJson(tripsFile(), trips);
        return true;
      }
    }
  }
  return false;
}

export function getTripExpenses(tripId) {
  const trip = getTripById(tripId);
  return trip?.expenses ?? [];
}

export function getBudgetSummary(tripId) {
  const trip = getTripById(tripId);
  if (!trip) return {};

  const budget = trip.budget || {};
  const expenses = trip.expenses || [];
  const totalBudget = budget.total || 0;
  const spent = expenses.reduce((s, e) => s + (e.amount || 0), 0);
  const remaining = totalBudget - spent;
  const categories = {};
  for (const expense of expenses) {
    const cat = expense.category || "Other";
    categories[cat] = (categories[cat] || 0) + (expense.amount || 0);
  }
  return {
    total_budget: totalBudget,
    spent,
    remaining,
    percentage_used: totalBudget > 0 ? (spent / totalBudget) * 100 : 0,
    by_category: categories,
  };
}

export function addItineraryItem(tripId, item) {
  const trips = loadJson(tripsFile());
  for (const trip of trips.current_trips) {
    if (trip.id === tripId) {
      trip.itinerary ??= [];
      item.id = Date.now() / 1000;
      trip.itinerary.push(item);
      trip.itinerary.sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));
      saveJson(tripsFile(), trips);
      return true;
    }
  }
  return false;
}

export function getItinerary(tripId) {
  const trip = getTripById(tripId);
  return trip?.itinerary ?? [];
}

export function getTravelStats() {
  const trips = loadJson(tripsFile());
  const prefs = loadJson(preferencesFile());
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
  for (const filePath of [preferencesFile(), tripsFile()]) {
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
  is_initialized: ["cmd"],
  save_preferences: ["cmd", "payload"],
  get_preferences: ["cmd"],
  get_trips: ["cmd", "status"],
  get_trip: ["cmd", "trip-id"],
  add_trip: ["cmd", "payload", "list"],
  patch_trip: ["cmd", "trip-id", "payload"],
  update_trip: ["cmd", "trip-id", "payload"],
  save_live_results: ["cmd", "trip-id", "payload"],
  save_booking_ready: ["cmd", "trip-id", "payload"],
  save_route_evidence: ["cmd", "trip-id", "platform", "payload"],
  get_route_evidence: ["cmd", "trip-id", "platform"],
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

    if (command === "is_initialized") {
      console.log(isInitialized() ? "true" : "false");
    } else if (command === "save_preferences") {
      const payload = readJsonFromCliValue("save_preferences", args.payload, undefined);
      savePreferences(payload);
      console.log(JSON.stringify({ ok: true }, null, 2));
    } else if (command === "get_preferences") {
      console.log(JSON.stringify(getPreferences(), null, 2));
    } else if (command === "get_trips") {
      const status = args.status && args.status !== "" ? args.status : "all";
      console.log(JSON.stringify(getTrips(status), null, 2));
    } else if (command === "get_trip") {
      const tripId = requireFlag(args, "trip-id");
      console.log(JSON.stringify(getTripById(tripId) || {}, null, 2));
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
    } else if (command === "get_route_evidence") {
      const tripId = requireFlag(args, "trip-id");
      const platform = String(args.platform || "");
      const result = getRouteEvidence(tripId, platform);
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
