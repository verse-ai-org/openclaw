/**
 * Travel Planner Database Manager (Node port of travel_db.py)
 * Persists preferences and trips under ~/.openclaw/agents/travel-planner/
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  assertOnlyFlags,
  isCliHelp,
  parseCliArgs,
  readJsonFromCliValue,
  requireCmd,
  requireFlag,
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

const DEFAULT_TRIP_STAGE = "intake";

function emptyRouteFraming() {
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
      hotels: [],
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

export function normalizeTripRecord(trip) {
  trip.stage ??= DEFAULT_TRIP_STAGE;
  trip.planning_mode ??= "explore";
  trip.destination_text ??= "";
  trip.travel_month ??= null;
  trip.travel_month_text ??= "";
  trip.date_flexibility ??= "";
  trip.transport_preferences ??= [];
  trip.constraints ??= [];
  trip.must_do ??= [];
  trip.nice_to_have ??= [];
  trip.selected_route ??= {};
  trip.route_source_preference ??= "xhs";
  trip.route_source_used ??= "";
  trip.route_source_fallbacks ??= [];
  trip.source_reason ??= "";
  trip.route_candidates ??= [];
  trip.route_options ??= [];
  trip.route_choice_confirmed ??= false;
  trip.chosen_route_id ??= "";
  trip.route_framing ??= emptyRouteFraming();
  trip.live_validation ??= emptyLiveValidation();
  trip.live_results ??= emptyLiveResults();
  trip.booking_strategy ??= {};
  trip.booking_ready ??= emptyBookingReady();
  trip.bookings_confirmed ??= false;
  trip.confirmed_bookings ??= {};
  trip.during_trip ??= false;
  trip.daily_brief_preferences ??= { local_morning_hour: 7 };
  trip.service_preferences ??= { daily_channel_brief: false, pre_trip_reminders: false };
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

export function saveRouteFraming(tripId, recommendedRoute, alternatives, rejectedRoutes, decisionSummary) {
  const routeOptions =
    recommendedRoute && Object.keys(recommendedRoute).length
      ? [recommendedRoute, ...(alternatives || [])]
      : alternatives || [];
  const updates = {
    stage: "route_framing",
    selected_route: recommendedRoute || {},
    route_candidates: routeOptions,
    route_options: routeOptions,
    route_choice_confirmed: false,
    chosen_route_id: "",
    route_framing: {
      recommended_route: recommendedRoute,
      alternatives: alternatives || [],
      rejected_routes: rejectedRoutes || [],
      decision_summary: decisionSummary || {},
    },
  };
  return updateTrip(tripId, updates);
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
) {
  const routeOptions =
    recommendedRoute && Object.keys(recommendedRoute).length
      ? [recommendedRoute, ...(alternatives || [])]
      : alternatives || [];
  const normalizedFallbacks = Array.isArray(fallbackChain) ? fallbackChain : [];
  const updates = {
    stage: "route_framing",
    selected_route: recommendedRoute || {},
    route_candidates: routeOptions,
    route_options: routeOptions,
    route_choice_confirmed: false,
    chosen_route_id: "",
    route_source_used: usedPlatform || "",
    route_source_fallbacks: normalizedFallbacks,
    route_framing: {
      used_platform: usedPlatform || "",
      fallback_count: Number.isFinite(Number(fallbackCount)) ? Number(fallbackCount) : 0,
      fallback_reason: fallbackReason || "",
      fallback_chain: normalizedFallbacks,
      recommended_route: recommendedRoute,
      alternatives: alternatives || [],
      rejected_routes: rejectedRoutes || [],
      decision_summary: decisionSummary || {},
    },
  };
  return updateTrip(tripId, updates);
}

export function confirmRouteChoice(tripId, routeId) {
  const trip = getTripById(tripId);
  if (!trip) return false;
  const options = trip.route_options || trip.route_candidates || [];
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
  return updateTrip(tripId, {
    source_reason: xhsEvidence?.summary || "",
  });
}

export function saveRouteFramingMetadata(
  tripId,
  routeSourceUsed,
  sourceReason,
  routeSourcePreference,
  routeSourceFallbacks = [],
) {
  return updateTrip(tripId, {
    route_source_used: routeSourceUsed || "",
    source_reason: sourceReason || "",
    ...(routeSourcePreference ? { route_source_preference: routeSourcePreference } : {}),
    route_source_fallbacks: Array.isArray(routeSourceFallbacks) ? routeSourceFallbacks : [],
  });
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

function printTravelDbHelp() {
  console.log(`Travel Planner Database Manager — local JSON store under ~/.openclaw/agents/travel-planner/

All flags use --key=value. JSON may be inline or @path (e.g. --payload=@trip.json).

Usage:
  node travel_db.mjs --cmd=<name> [--flag=...]

Commands:
  --cmd=is_initialized
    Print true or false.
  --cmd=get_preferences
    Print preferences JSON.
  --cmd=save_preferences --payload=<json|@file>
    Merge-save preferences (sets initialized).
  --cmd=get_trips [--status=current|past|ideas|all]
    Default status: all.
  --cmd=get_trip --trip-id=<id>
  --cmd=add_trip --payload=<json|@file> [--list=current|past|idea]
    Create a trip; prints { ok, trip_id }. Default list: current.
  --cmd=patch_trip --trip-id=<id> --payload=<json|@file>
  --cmd=update_trip --trip-id=<id> --payload=<json|@file>
    Alias of patch_trip.
  --cmd=save_live_results --trip-id=<id> [--payload=<json|@file>]
    Default payload: {}.
  --cmd=save_booking_ready --trip-id=<id> [--payload=<json|@file>]
  --cmd=confirm_booking --trip-id=<id> --category=<name> [--payload=<json|@file>]
  --cmd=start_trip --trip-id=<id>
  --cmd=stats
  --cmd=export
    Full dump (preferences + trips + stats).
  --cmd=reset
    Not supported non-interactively; delete JSON files or use API.

Examples:
  node travel_db.mjs --cmd=is_initialized
  node travel_db.mjs --cmd=save_preferences --payload='{"departure_city":"成都","budget_level":"mid-range"}'
`);
}

function main() {
  const argv = process.argv.slice(2);
  if (isCliHelp(argv)) {
    printTravelDbHelp();
    process.exit(0);
  }

  const args = parseCliArgs(argv);
  const command = requireCmd(args);

  if (command === "is_initialized") {
    assertOnlyFlags(args, ["cmd"]);
    console.log(isInitialized() ? "true" : "false");
  } else if (command === "save_preferences") {
    assertOnlyFlags(args, ["cmd", "payload"]);
    const payload = readJsonFromCliValue("save_preferences", args.payload, undefined);
    savePreferences(payload);
    console.log(JSON.stringify({ ok: true }, null, 2));
  } else if (command === "get_preferences") {
    assertOnlyFlags(args, ["cmd"]);
    console.log(JSON.stringify(getPreferences(), null, 2));
  } else if (command === "get_trips") {
    assertOnlyFlags(args, ["cmd", "status"]);
    const status = args.status && args.status !== "" ? args.status : "all";
    console.log(JSON.stringify(getTrips(status), null, 2));
  } else if (command === "get_trip") {
    assertOnlyFlags(args, ["cmd", "trip-id"]);
    const tripId = requireFlag(args, "trip-id");
    console.log(JSON.stringify(getTripById(tripId) || {}, null, 2));
  } else if (command === "add_trip") {
    assertOnlyFlags(args, ["cmd", "payload", "list"]);
    const payload = readJsonFromCliValue("add_trip", args.payload, undefined);
    const listRaw = args.list && args.list !== "" ? args.list : "current";
    const status =
      listRaw === "past" ? "past" : listRaw === "idea" ? "idea" : "current";
    try {
      const tripId = addTrip(payload, status);
      console.log(JSON.stringify({ ok: true, trip_id: tripId }, null, 2));
    } catch (e) {
      console.error(`Error: add_trip failed (${e instanceof Error ? e.message : String(e)})`);
      process.exit(1);
    }
  } else if (command === "patch_trip" || command === "update_trip") {
    assertOnlyFlags(args, ["cmd", "trip-id", "payload"]);
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
    assertOnlyFlags(args, ["cmd", "trip-id", "payload"]);
    const tripId = requireFlag(args, "trip-id");
    const payload = readJsonFromCliValue("save_live_results", args.payload, {});
    console.log(JSON.stringify({ ok: saveLiveResults(tripId, payload) }, null, 2));
  } else if (command === "save_booking_ready") {
    assertOnlyFlags(args, ["cmd", "trip-id", "payload"]);
    const tripId = requireFlag(args, "trip-id");
    const payload = readJsonFromCliValue("save_booking_ready", args.payload, {});
    console.log(JSON.stringify({ ok: saveBookingReadyPackage(tripId, payload) }, null, 2));
  } else if (command === "confirm_booking") {
    assertOnlyFlags(args, ["cmd", "trip-id", "category", "payload"]);
    const tripId = requireFlag(args, "trip-id");
    const category = requireFlag(args, "category");
    const payload = readJsonFromCliValue("confirm_booking", args.payload, {});
    console.log(JSON.stringify({ ok: confirmBookingChoice(tripId, category, payload) }, null, 2));
  } else if (command === "start_trip") {
    assertOnlyFlags(args, ["cmd", "trip-id"]);
    const tripId = requireFlag(args, "trip-id");
    console.log(JSON.stringify({ ok: startTrip(tripId) }, null, 2));
  } else if (command === "stats") {
    assertOnlyFlags(args, ["cmd"]);
    console.log(JSON.stringify(getTravelStats(), null, 2));
  } else if (command === "export") {
    assertOnlyFlags(args, ["cmd"]);
    console.log(JSON.stringify(exportAll(), null, 2));
  } else if (command === "reset") {
    assertOnlyFlags(args, ["cmd"]);
    console.error("Interactive reset not supported from CLI in Node port; use API or delete files manually.");
    process.exit(1);
  } else {
    console.error(`Unknown --cmd value: ${command}`);
    process.exit(1);
  }
}

const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] === __filename) {
  main();
}
