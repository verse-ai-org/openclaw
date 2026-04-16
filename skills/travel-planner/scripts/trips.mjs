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
import { normalizePacePreference } from "./preferences.mjs";

/** @type {string | null} */
let dbDirOverride = null;

export function setTripsDbDirForTests(dir) {
  dbDirOverride = dir;
}

function dbDir() {
  if (process.env.TRAVEL_PLANNER_DB_DIR) {
    return process.env.TRAVEL_PLANNER_DB_DIR;
  }
  return (
    dbDirOverride ??
    path.join(os.homedir(), ".openclaw", "agents", "travel-planner")
  );
}

const tripsFile = () => path.join(dbDir(), "trips.json");
const tripsDataDir = () => path.join(dbDir(), "data", "trips");
const tripRecordFile = (tripId) =>
  path.join(tripsDataDir(), String(tripId || ""), "trip.json");

/** Per-trip artifact directory (`data/trips/<id>/`). */
export function getTripArtifactsDir(tripId) {
  return path.join(tripsDataDir(), String(tripId || ""));
}

const STEP4_PLAN_OUTPUT_FILE = "step4.plan-output.json";

const EXTERNALIZED_FIELDS = {
  route_validation: {
    file: "step5.route-validation.json",
    ref: "route_validation_ref",
    empty: null,
  },
  live_results: {
    file: "step8.live-results.json",
    ref: "live_results_ref",
    empty: null,
  },
  booking_ready: {
    file: "step8.booking-ready.json",
    ref: "booking_ready_ref",
    empty: null,
  },
};

export function getTripsFilePath() {
  return tripsFile();
}

const DEFAULT_TRIP_STAGE = "intake";
export const STAGE_VALUES = {
  INTAKE: "intake",
  ROUTE_PLANNED: "route_plan",
  ROUTE_CONFIRMED: "plan_ready",
  BOOKING_READY: "ready_to_book",
  IN_TRIP: "in_trip",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
};

const TRIP_DEFAULTS = {
  stage: DEFAULT_TRIP_STAGE,
  destination_text: "",
  travel_month: null,
  travel_month_text: "",
  date_flexibility: "",
  transport_preferences: [],
  constraints: [],
  must_do: [],
  nice_to_have: [],
  chosen_route_id: "",
  route_source_preference: "auto",
  route_source_used: "",
  route_source_fallbacks: [],
  route_evidence_meta: null,
  step4_plan_output_ref: "",
  route_options: [],
  route_choice_confirmed: false,
  route_plan: null,
  route_validation: null,
  live_results: null,
  booking_ready: null,
  bookings_confirmed: false,
  confirmed_bookings: {},
  during_trip: false,
};

function emptyRoutePlanning() {
  return {
    used_platform: "",
    fallback_count: 0,
    fallback_reason: "",
    fallback_chain: [],
    recommended_route_id: "",
    alternative_ids: [],
    rejected_route_ids: [],
    decision_summary: {},
  };
}

function emptyLiveValidation() {
  return {
    stage: "",
    transport_result: {
      required: false,
      mode: "",
      checked: false,
      raw: {},
      status: "",
    },
    weather_result: { locations_checked: [], raw: {}, status: "" },
    verdict: "",
    verdict_reasons: [],
    checked_at: "",
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
  return { flights: {}, hotels: {}, pois: {}, transport: {}, updated_at: "" };
}

function ensureTripsFile() {
  fs.mkdirSync(dbDir(), { recursive: true });
  fs.mkdirSync(tripsDataDir(), { recursive: true });
  if (!fs.existsSync(tripsFile())) {
    const defaultTrips = {
      schema_version: 3,
      current_trips: [],
      past_trips: [],
      trip_ideas: [],
    };
    fs.writeFileSync(
      tripsFile(),
      JSON.stringify(defaultTrips, null, 2),
      "utf8",
    );
  }
}

function loadTripsJson() {
  ensureTripsFile();
  try {
    const raw = fs.readFileSync(tripsFile(), "utf8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function saveTripsJson(data) {
  ensureTripsFile();
  fs.writeFileSync(tripsFile(), JSON.stringify(data, null, 2), "utf8");
}

function loadTripRecord(tripId) {
  const file = tripRecordFile(tripId);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function saveTripRecord(trip) {
  if (!trip?.id) return;
  const file = tripRecordFile(trip.id);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(trip, null, 2), "utf8");
}

function normalizeTripIdEntry(entry) {
  if (typeof entry === "string") return entry;
  if (entry && typeof entry === "object" && entry.id) return String(entry.id);
  return "";
}

function migrateLegacyTripsStore(indexStore) {
  let changed = false;
  for (const bucket of ["current_trips", "past_trips", "trip_ideas"]) {
    const list = Array.isArray(indexStore[bucket]) ? indexStore[bucket] : [];
    const ids = [];
    for (const item of list) {
      const id = normalizeTripIdEntry(item);
      if (!id) continue;
      ids.push(id);
      if (typeof item === "object") {
        const existing = loadTripRecord(id);
        if (!existing) {
          const clone = { ...item, id };
          normalizeTripRecord(clone);
          externalizeTripPayload(clone);
          saveTripRecord(clone);
          changed = true;
        }
      }
    }
    if (JSON.stringify(list) !== JSON.stringify(ids)) {
      indexStore[bucket] = ids;
      changed = true;
    }
  }
  if ((indexStore.schema_version || 0) < 3) {
    indexStore.schema_version = 3;
    changed = true;
  }
  if (changed) saveTripsJson(indexStore);
}

function listTripIds(indexStore, status = "all") {
  if (status === "current")
    return Array.isArray(indexStore.current_trips)
      ? indexStore.current_trips
      : [];
  if (status === "past")
    return Array.isArray(indexStore.past_trips) ? indexStore.past_trips : [];
  if (status === "ideas")
    return Array.isArray(indexStore.trip_ideas) ? indexStore.trip_ideas : [];
  return [
    ...(Array.isArray(indexStore.current_trips)
      ? indexStore.current_trips
      : []),
    ...(Array.isArray(indexStore.past_trips) ? indexStore.past_trips : []),
    ...(Array.isArray(indexStore.trip_ideas) ? indexStore.trip_ideas : []),
  ];
}

function generateTripId() {
  // Millisecond timestamp keeps ordering while avoiding decimal IDs.
  return String(Date.now());
}

function tripArtifactsDir(tripId) {
  return path.join(tripsDataDir(), String(tripId || ""));
}

function writeTripArtifact(tripId, field, payload) {
  const spec = EXTERNALIZED_FIELDS[field];
  if (!spec || !tripId) return null;
  const dir = tripArtifactsDir(tripId);
  fs.mkdirSync(dir, { recursive: true });
  const absolute = path.join(dir, spec.file);
  fs.writeFileSync(absolute, JSON.stringify(payload, null, 2), "utf8");
  return path.relative(dbDir(), absolute);
}

function readTripArtifact(refPath) {
  if (!refPath) return null;
  const absolute = path.join(dbDir(), String(refPath));
  if (!fs.existsSync(absolute)) return null;
  try {
    return JSON.parse(fs.readFileSync(absolute, "utf8"));
  } catch {
    return null;
  }
}

/** Load canonical Step 4 JSON from `trip.step4_plan_output_ref` (under travel-planner db dir). */
export function readStep4PlanOutput(trip) {
  if (!trip?.step4_plan_output_ref) return null;
  return readTripArtifact(trip.step4_plan_output_ref);
}

/** Load Step 5 `route_validation` artifact from `data/trips/<id>/step5.route-validation.json` (authoritative on disk). */
export function readStep5RouteValidation(tripId) {
  if (!tripId) return null;
  const abs = path.join(
    tripArtifactsDir(tripId),
    EXTERNALIZED_FIELDS.route_validation.file,
  );
  if (!fs.existsSync(abs)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(abs, "utf8"));
    return data && typeof data === "object" && !Array.isArray(data) ? data : null;
  } catch {
    return null;
  }
}

function hydrateRouteOptionsFromStep4(trip) {
  if (Array.isArray(trip.route_options) && trip.route_options.length > 0) return;
  const ref = trip.step4_plan_output_ref;
  if (!ref) return;
  const payload = readTripArtifact(ref);
  if (
    payload &&
    typeof payload === "object" &&
    !Array.isArray(payload) &&
    Array.isArray(payload.route_options)
  ) {
    trip.route_options = payload.route_options;
  }
}

function writeStep4PlanOutputFile(tripId, data) {
  if (!tripId || !data || typeof data !== "object") return null;
  const dir = tripArtifactsDir(tripId);
  fs.mkdirSync(dir, { recursive: true });
  const absolute = path.join(dir, STEP4_PLAN_OUTPUT_FILE);
  fs.writeFileSync(absolute, JSON.stringify(data, null, 2), "utf8");
  return path.relative(dbDir(), absolute);
}

function externalizeRouteOptionsIntoPlanOutput(trip) {
  if (!trip?.id) return;
  const ro = trip.route_options;
  if (!Array.isArray(ro) || ro.length === 0) return;
  const dir = tripArtifactsDir(trip.id);
  const absolute = path.join(dir, STEP4_PLAN_OUTPUT_FILE);
  let existing = {};
  if (fs.existsSync(absolute)) {
    try {
      const raw = JSON.parse(fs.readFileSync(absolute, "utf8"));
      existing = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    } catch {
      existing = {};
    }
  }
  const merged = { ...existing, route_options: ro };
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(absolute, JSON.stringify(merged, null, 2), "utf8");
  trip.step4_plan_output_ref = path.relative(dbDir(), absolute);
  delete trip.route_options;
}

function hydrateTripPayload(trip) {
  hydrateRouteOptionsFromStep4(trip);
  for (const [field, spec] of Object.entries(EXTERNALIZED_FIELDS)) {
    if (trip[field] !== undefined && trip[field] !== null) continue;
    const payload = readTripArtifact(trip[spec.ref]);
    if (payload !== null) {
      trip[field] = payload;
    }
  }
}

function externalizeTripPayload(trip) {
  if (!trip?.id) return;
  externalizeRouteOptionsIntoPlanOutput(trip);
  for (const [field, spec] of Object.entries(EXTERNALIZED_FIELDS)) {
    const value = trip[field];
    if (value === undefined || value === null) continue;
    const isEmptyArray = Array.isArray(value) && value.length === 0;
    const isEmptyObject =
      !Array.isArray(value) &&
      typeof value === "object" &&
      value !== null &&
      Object.keys(value).length === 0;
    if (isEmptyArray || isEmptyObject) continue;
    const relativePath = writeTripArtifact(trip.id, field, value);
    if (relativePath) {
      trip[spec.ref] = relativePath;
      delete trip[field];
    }
  }
}

function inferCanonicalStage(trip) {
  const stage = String(trip.stage || "").trim();
  if (stage === STAGE_VALUES.CANCELLED || stage === STAGE_VALUES.COMPLETED)
    return stage;
  if (trip.during_trip) return STAGE_VALUES.IN_TRIP;
  if (trip.bookings_confirmed || trip.booking_ready?.status === "ready")
    return STAGE_VALUES.BOOKING_READY;
  if (trip.route_choice_confirmed && trip.chosen_route_id)
    return STAGE_VALUES.ROUTE_CONFIRMED;
  if (Array.isArray(trip.route_options) && trip.route_options.length >= 2)
    return STAGE_VALUES.ROUTE_PLANNED;
  return STAGE_VALUES.INTAKE;
}

function reconcileTripState(trip) {
  if (trip.pace_preference !== undefined) {
    trip.pace_preference = normalizePacePreference(trip.pace_preference);
  }
  const options = Array.isArray(trip.route_options) ? trip.route_options : [];
  const hasChosenRoute = options.some(
    (option) => option?.route_id === trip.chosen_route_id,
  );
  if (!hasChosenRoute) {
    trip.chosen_route_id = "";
    trip.route_choice_confirmed = false;
  }
  if (!trip.chosen_route_id) {
    trip.route_choice_confirmed = false;
  }
  if (
    trip.stage !== STAGE_VALUES.COMPLETED &&
    trip.stage !== STAGE_VALUES.CANCELLED
  ) {
    trip.stage = inferCanonicalStage(trip);
  }
}

export function normalizeTripRecord(trip) {
  hydrateTripPayload(trip);
  Object.assign(trip, { ...TRIP_DEFAULTS, ...trip });
  delete trip.route_candidates;
  delete trip.source_reason;
  delete trip.step4_plan_output_full;
  delete trip.route_options_ref;
  if (!trip.route_plan) trip.route_plan = emptyRoutePlanning();
  if (!trip.route_evidence_meta) trip.route_evidence_meta = {};
  if (!trip.route_validation) trip.route_validation = emptyLiveValidation();
  if (!trip.live_results) trip.live_results = emptyLiveResults();
  if (!trip.booking_ready) trip.booking_ready = emptyBookingReady();
  reconcileTripState(trip);
  return trip;
}

export function getSelectedRoute(trip) {
  const id = trip.chosen_route_id || "";
  if (!id) return {};
  const options = Array.isArray(trip.route_options) ? trip.route_options : [];
  return options.find((o) => o?.route_id === id) ?? {};
}

export function getTrips(status = "all") {
  const indexStore = loadTripsJson();
  migrateLegacyTripsStore(indexStore);
  const loadList = (ids) =>
    ids
      .map((id) => loadTripRecord(id))
      .filter(Boolean)
      .map((trip) => normalizeTripRecord(trip));

  const current = loadList(listTripIds(indexStore, "current"));
  const past = loadList(listTripIds(indexStore, "past"));
  const ideas = loadList(listTripIds(indexStore, "ideas"));

  if (status === "all")
    return { current_trips: current, past_trips: past, trip_ideas: ideas };
  if (status === "current") return { current_trips: current };
  if (status === "past") return { past_trips: past };
  if (status === "ideas") return { trip_ideas: ideas };
  return {};
}

const INACTIVE_STAGES = new Set([
  STAGE_VALUES.COMPLETED,
  STAGE_VALUES.CANCELLED,
]);

export function getActiveTrips() {
  const trips = getTrips("current");
  const list = (trips.current_trips ?? []).filter(
    (t) => !INACTIVE_STAGES.has(t.stage),
  );
  return list.map((t) => ({
    id: t.id,
    destination_text: t.destination_text,
    stage: t.stage,
    duration_days: t.duration_days,
    departure_date: t.departure_date ?? "",
    travelers: t.travelers,
    created_at: t.created_at,
    updated_at: t.updated_at ?? "",
  }));
}

export function addTrip(trip, status = "current") {
  const indexStore = loadTripsJson();
  migrateLegacyTripsStore(indexStore);
  const tripId = generateTripId();
  trip.id = tripId;
  trip.created_at = new Date().toISOString();
  normalizeTripRecord(trip);
  externalizeTripPayload(trip);
  saveTripRecord(trip);

  if (status === "current") indexStore.current_trips.push(tripId);
  else if (status === "past") indexStore.past_trips.push(tripId);
  else if (status === "idea") indexStore.trip_ideas.push(tripId);

  saveTripsJson(indexStore);
  return tripId;
}

export function updateTrip(tripId, updates) {
  const indexStore = loadTripsJson();
  migrateLegacyTripsStore(indexStore);
  const allIds = new Set(listTripIds(indexStore, "all"));
  if (!allIds.has(String(tripId))) return false;
  const trip = loadTripRecord(tripId);
  if (!trip) return false;
  const planFull =
    updates &&
    typeof updates === "object" &&
    "step4_plan_output_full" in updates
      ? updates.step4_plan_output_full
      : null;
  Object.assign(trip, updates);
  if (planFull && typeof planFull === "object") {
    const rel = writeStep4PlanOutputFile(tripId, planFull);
    if (rel) {
      trip.step4_plan_output_ref = rel;
      if (Array.isArray(planFull.route_options)) {
        trip.route_options = planFull.route_options;
      }
    }
    delete trip.step4_plan_output_full;
  }
  normalizeTripRecord(trip);
  externalizeTripPayload(trip);
  trip.updated_at = new Date().toISOString();
  saveTripRecord(trip);
  return true;
}

export function getTripById(tripId) {
  const indexStore = loadTripsJson();
  migrateLegacyTripsStore(indexStore);
  const allIds = new Set(listTripIds(indexStore, "all"));
  if (!allIds.has(String(tripId))) return null;
  const trip = loadTripRecord(tripId);
  if (!trip) return null;
  return normalizeTripRecord({ ...trip });
}

export function setTripStage(tripId, stage) {
  return updateTrip(tripId, { stage });
}

export function endTrip(tripId) {
  return updateTrip(tripId, { during_trip: false });
}

export function moveTripToPast(tripId) {
  const indexStore = loadTripsJson();
  migrateLegacyTripsStore(indexStore);
  const current = Array.isArray(indexStore.current_trips)
    ? indexStore.current_trips
    : [];
  const idx = current.findIndex((id) => String(id) === String(tripId));
  if (idx < 0) return false;
  const trip = loadTripRecord(tripId);
  if (!trip) return false;
  trip.completed_at = new Date().toISOString();
  normalizeTripRecord(trip);
  externalizeTripPayload(trip);
  saveTripRecord(trip);
  current.splice(idx, 1);
  indexStore.past_trips.push(String(tripId));
  saveTripsJson(indexStore);
  return true;
}

export function deleteTrip(tripId) {
  const indexStore = loadTripsJson();
  migrateLegacyTripsStore(indexStore);
  let removed = false;
  for (const key of ["current_trips", "past_trips", "trip_ideas"]) {
    const list = Array.isArray(indexStore[key]) ? indexStore[key] : [];
    const idx = list.findIndex((id) => String(id) === String(tripId));
    if (idx >= 0) {
      list.splice(idx, 1);
      removed = true;
    }
  }
  if (!removed) return false;
  saveTripsJson(indexStore);
  return true;
}

export function addExpense(tripId, expense) {
  const trip = getTripById(tripId);
  if (!trip) return false;
  const expenses = Array.isArray(trip.expenses) ? [...trip.expenses] : [];
  const nextExpense = { ...expense, id: Date.now() / 1000 };
  if (!nextExpense.date) nextExpense.date = new Date().toISOString();
  expenses.push(nextExpense);
  const budget = { ...(trip.budget || {}) };
  budget.spent = expenses.reduce((s, e) => s + (e.amount || 0), 0);
  return updateTrip(tripId, { expenses, budget });
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
  const trip = getTripById(tripId);
  if (!trip) return false;
  const itinerary = Array.isArray(trip.itinerary) ? [...trip.itinerary] : [];
  itinerary.push({ ...item, id: Date.now() / 1000 });
  itinerary.sort((a, b) =>
    String(a.date || "").localeCompare(String(b.date || "")),
  );
  return updateTrip(tripId, { itinerary });
}

export function getItinerary(tripId) {
  const trip = getTripById(tripId);
  return trip?.itinerary ?? [];
}

const CMD_FLAGS = {
  get_trips: ["cmd", "status"],
  get_trip: ["cmd", "trip-id"],
  get_active_trips: ["cmd"],
  add_trip: ["cmd", "payload", "list"],
  patch_trip: ["cmd", "trip-id", "payload"],
  update_trip: ["cmd", "trip-id", "payload"],
};

runScript({
  name: "trips.mjs",
  description: "旅行规划 trip 数据管理器（schema/CRUD/预算/itinerary）",
  usage: "node trips.mjs --cmd=<name> [其他 flag...]",
  flags: Object.keys(CMD_FLAGS)
    .flatMap((cmd) =>
      CMD_FLAGS[cmd].map((f) => ({ name: f, desc: `用于 --cmd=${cmd}` })),
    )
    .filter((f, i, arr) => arr.findIndex((x) => x.name === f.name) === i),
  required: ["cmd"],
  callerUrl: import.meta.url,
  run(args) {
    const command = requireCmd(args);
    const allowed =
      CMD_FLAGS[command] ??
      CMD_FLAGS[command === "update_trip" ? "patch_trip" : command];
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
      const status =
        listRaw === "past" ? "past" : listRaw === "idea" ? "idea" : "current";
      try {
        const tripId = addTrip(payload, status);
        console.log(JSON.stringify({ ok: true, trip_id: tripId }, null, 2));
      } catch (e) {
        console.error(
          `Error: add_trip failed (${e instanceof Error ? e.message : String(e)})`,
        );
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
    } else {
      console.error(`未知 --cmd 值: ${command}`);
      process.exit(1);
    }
  },
});
