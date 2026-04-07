import { fileURLToPath } from "node:url";

import { buildBookingReadyPackage } from "./scripts/booking_ready.mjs";
import { buildDailyBrief, buildPreTripBrief } from "./scripts/briefing.mjs";
import { buildLiveValidation } from "./scripts/live_validation.mjs";
import { generateTripPlan } from "./scripts/plan_generator.mjs";
import { selectRouteCandidates } from "./scripts/route_selector.mjs";
import { buildXhsEvidence, buildXhsSearchQueries } from "./scripts/xhs_evidence_builder.mjs";
import {
  addExpense,
  addItineraryItem,
  addPreviousDestination,
  addToBucketList,
  addTrip,
  confirmRouteChoice,
  confirmBookingChoice,
  deleteTrip,
  endTrip,
  ensureDbFiles,
  exportAll,
  getBudgetSummary,
  getItinerary,
  getPreferences,
  getTravelStats,
  getTripById,
  getTripExpenses,
  getTrips,
  isInitialized,
  moveTripToPast,
  normalizeTripRecord,
  resetAll,
  saveBookingReadyPackage,
  saveLiveResults,
  savePreferences,
  saveRouteFraming,
  saveRouteFramingWithSource,
  saveRouteFramingMetadata,
  saveXhsEvidence,
  setTravelPlannerDbDirForTests,
  setTripStage,
  startTrip,
  updatePreference,
  updateTrip,
} from "./scripts/travel_db.mjs";

export {
  addExpense,
  addItineraryItem,
  addPreviousDestination,
  addToBucketList,
  addTrip,
  confirmRouteChoice,
  buildBookingReadyPackage,
  buildDailyBrief,
  buildLiveValidation,
  buildPreTripBrief,
  buildXhsEvidence,
  buildXhsSearchQueries,
  confirmBookingChoice,
  deleteTrip,
  endTrip,
  ensureDbFiles,
  exportAll,
  generateTripPlan,
  getBudgetSummary,
  getItinerary,
  getPreferences,
  getTravelStats,
  getTripById,
  getTripExpenses,
  getTrips,
  isInitialized,
  moveTripToPast,
  normalizeTripRecord,
  resetAll,
  saveBookingReadyPackage,
  saveLiveResults,
  savePreferences,
  saveRouteFraming,
  saveRouteFramingWithSource,
  saveRouteFramingMetadata,
  saveXhsEvidence,
  selectRouteCandidates,
  setTravelPlannerDbDirForTests,
  setTripStage,
  startTrip,
  updatePreference,
  updateTrip,
};

const __filename = fileURLToPath(import.meta.url);
/**
 * @param {"save_live_results"|"save_booking_ready"|"confirm_booking"|"start_trip"|"save_xhs_evidence"|"save_route_framing"|"confirm_route_choice"|"set_route_source_preference"} action
 * @param {...unknown} args For save_* : `(tripId, data)`. For confirm_booking : `(tripId, category, choice)`.
 * For start_trip : `(tripId)`.
 */
function runDbAction(action, ...args) {
  if (action === "save_live_results") {
    const [tripId, data = {}] = args;
    return { ok: saveLiveResults(tripId, data) };
  }
  if (action === "save_booking_ready") {
    const [tripId, data = {}] = args;
    return { ok: saveBookingReadyPackage(tripId, data) };
  }
  if (action === "confirm_booking") {
    const [tripId, category, choice = {}] = args;
    return { ok: confirmBookingChoice(tripId, category, choice) };
  }
  if (action === "start_trip") {
    const [tripId] = args;
    return { ok: startTrip(tripId) };
  }
  if (action === "save_xhs_evidence") {
    const [tripId, data = {}] = args;
    return { ok: saveXhsEvidence(tripId, data) };
  }
  if (action === "save_route_framing") {
    const [
      tripId,
      recommendedRoute = {},
      alternatives = [],
      rejectedRoutes = [],
      decisionSummary = {},
      recommendationSourceRuntime = "",
      sourceReason = "",
      routeSourcePreference = "",
      fallbackChain = [],
    ] = args;
    const fallbackCount = Array.isArray(fallbackChain) ? fallbackChain.length : 0;
    const fallbackReason = fallbackCount > 0 ? String(fallbackChain[0]?.reason || "") : "";
    const okRoute = saveRouteFramingWithSource(
      tripId,
      recommendedRoute,
      alternatives,
      rejectedRoutes,
      decisionSummary,
      recommendationSourceRuntime,
      fallbackCount,
      fallbackReason,
      fallbackChain,
    );
    const okMeta = saveRouteFramingMetadata(
      tripId,
      recommendationSourceRuntime,
      sourceReason,
      routeSourcePreference,
      fallbackChain,
    );
    return { ok: okRoute && okMeta };
  }
  if (action === "confirm_route_choice") {
    const [tripId, routeId] = args;
    return { ok: confirmRouteChoice(tripId, routeId) };
  }
  if (action === "set_route_source_preference") {
    const [tripId, routeSourcePreference = "xhs"] = args;
    return {
      ok: updateTrip(tripId, {
        route_source_preference: String(routeSourcePreference || "xhs"),
      }),
    };
  }
  throw new Error(`Unknown DB action: ${action}`);
}

/**
 * Skill entry: routes by `mode`. Throws on missing required fields for persist modes.
 * `auto_validate` is plan-only and does not run external commands.
 *
 * @param {object} [input]
 * @param {string} [input.mode="trip_plan"]
 *   `"route_framing"` | `"live_validation"` | `"booking_ready"` | `"auto_validate"` | `"briefing"` | `"trip_plan"` |
 *   `"persist_live_results"` | `"persist_booking_ready"` | `"confirm_booking"` | `"start_trip"` |
 *   `"persist_xhs_evidence"` | `"persist_route_framing"` | `"confirm_route_choice"` | `"build_xhs_evidence"` | `"set_route_source_preference"`
 * @param {object} [input.trip] Trip record (aliases: `tripData`).
 * @param {object} [input.route] Selected route (else `trip.selected_route`).
 * @param {object} [input.preferences] Traveler prefs for validation/briefs.
 * @param {object} [input.validation] Live-validation package (`booking_ready` / `auto_validate`).
 * @param {object} [input.results] Alias: `liveResults`. Tool outputs (`flights`/`hotels`/`pois`/`transport`).
 * @param {object} [input.plan] Plan object (briefing).
 * @param {string} [input.tripId] Required for persist / `auto_validate` persistence / `trip_plan` id default.
 * @param {boolean} [input.persist=true] Reserved for compatibility. No-op in `auto_validate`.
 * @param {boolean} [input.execute=false] Reserved for compatibility. `auto_validate` remains plan-only.
 * @param {string} [input.briefMode="pre_trip"] `"pre_trip"` | `"daily"`.
 * @param {number} [input.day=1] Day index for daily brief.
 * @param {object} [input.bookingReady] Payload for `persist_booking_ready`.
 * @param {string} [input.category] For `confirm_booking`.
 * @param {object} [input.choice] For `confirm_booking`.
 * @param {"xhs"|"amap"|"web"|"auto"} [input.routeSourcePreference]
 * @param {string} [input.routeSourceUsed]
 * @param {Array<{platform:string,reason:string}>} [input.routeSourceFallbacks]
 * @returns {unknown} Depends on `mode` (objects from `scripts/*.mjs` or `{ ok }` for DB modes).
 */
function travel_planner(input = {}) {
  const mode = input.mode || "trip_plan";
  const trip = input.trip || input.tripData || {};
  const route = input.route || trip.selected_route || {};
  const preferences = input.preferences || {};
  const validation = input.validation || {};
  const results = input.liveResults || input.results || {};
  const plan = input.plan || {};

  if (mode === "route_framing") {
    return selectRouteCandidates(trip);
  }

  if (mode === "build_xhs_evidence") {
    return buildXhsEvidence(input);
  }

  if (mode === "live_validation") {
    return buildLiveValidation(trip, route, preferences);
  }

  if (mode === "booking_ready") {
    return buildBookingReadyPackage(trip, route, validation, results);
  }

  if (mode === "auto_validate") {
    const computedValidation =
      Object.keys(validation).length > 0
        ? validation
        : buildLiveValidation(trip, route, preferences);
    return {
      validation: computedValidation,
      live_results: results,
      booking_ready: buildBookingReadyPackage(trip, route, computedValidation, results),
      validation_errors: [],
      execution_mode: "plan_only",
      requires_user_choice: true,
      must_confirm_before_next_step: true,
      confirmation_question:
        computedValidation?.feasibility?.confirmation_question ||
        "轻验证已完成，是否确认进入下一步细化？",
      feasibility_status: computedValidation?.feasibility?.status || "pending_confirmation",
      next_step_options: [
        {
          id: "confirm_and_continue",
          label: "确认并继续下一步",
          description: "Confirm this light validation result and proceed to detailed planning.",
        },
        {
          id: "revise_route_or_dates",
          label: "先调整路线或日期",
          description: "Revise route/date first, then rerun light validation.",
        },
      ],
    };
  }

  if (mode === "briefing") {
    const briefMode = input.briefMode || "pre_trip";
    const day = Number(input.day || 1);
    if (briefMode === "pre_trip") {
      return buildPreTripBrief(trip, plan);
    }
    return buildDailyBrief(trip, plan, day);
  }

  if (mode === "trip_plan") {
    const tempTrip = {
      id: input.tripId || "runtime-trip",
      ...trip,
      ...(results && Object.keys(results).length > 0 ? { live_results: results } : {}),
      ...(route && Object.keys(route).length > 0 ? { selected_route: route } : {}),
    };
    return generateTripPlan(tempTrip);
  }

  if (mode === "persist_live_results") {
    if (!input.tripId) {
      throw new Error("persist_live_results requires tripId");
    }
    return runDbAction("save_live_results", input.tripId, results);
  }

  if (mode === "persist_booking_ready") {
    if (!input.tripId) {
      throw new Error("persist_booking_ready requires tripId");
    }
    return runDbAction("save_booking_ready", input.tripId, input.bookingReady || {});
  }

  if (mode === "confirm_booking") {
    if (!input.tripId || !input.category) {
      throw new Error("confirm_booking requires tripId and category");
    }
    return runDbAction("confirm_booking", input.tripId, input.category, input.choice || {});
  }

  if (mode === "start_trip") {
    if (!input.tripId) {
      throw new Error("start_trip requires tripId");
    }
    return runDbAction("start_trip", input.tripId);
  }

  if (mode === "persist_xhs_evidence") {
    if (!input.tripId) {
      throw new Error("persist_xhs_evidence requires tripId");
    }
    return runDbAction("save_xhs_evidence", input.tripId, input.xhsEvidence || {});
  }

  if (mode === "persist_route_framing") {
    if (!input.tripId) {
      throw new Error("persist_route_framing requires tripId");
    }
    const computedFraming = input.routeFraming || selectRouteCandidates(trip);
    return runDbAction(
      "save_route_framing",
      input.tripId,
      computedFraming.recommended_route || {},
      computedFraming.alternatives || [],
      computedFraming.rejected_routes || [],
      computedFraming.decision_summary || {},
      input.routeSourceUsed || computedFraming.used_platform || "",
      computedFraming.source_reason || "",
      input.routeSourcePreference || trip.route_source_preference || "xhs",
      input.routeSourceFallbacks || computedFraming.fallback_chain || [],
    );
  }

  if (mode === "confirm_route_choice") {
    if (!input.tripId || !input.routeId) {
      throw new Error("confirm_route_choice requires tripId and routeId");
    }
    return runDbAction("confirm_route_choice", input.tripId, input.routeId);
  }

  if (mode === "set_route_source_preference") {
    if (!input.tripId) {
      throw new Error("set_route_source_preference requires tripId");
    }
    return runDbAction(
      "set_route_source_preference",
      input.tripId,
      input.routeSourcePreference || "xhs",
    );
  }

  throw new Error(`Unsupported travel-planner mode: ${mode}`);
}

export default travel_planner;
export { travel_planner };

function printCliHint() {
  console.log(`travel-planner skill (import as ESM)

  import travel_planner from "./index.js";
  travel_planner({ mode: "trip_plan", trip: { destination: { country: "China" }, duration_days: 5 } });

Modes:
  route_framing, live_validation, booking_ready, auto_validate, briefing, trip_plan,
  persist_live_results, persist_booking_ready, confirm_booking, start_trip,
  persist_xhs_evidence, persist_route_framing, confirm_route_choice, build_xhs_evidence,
  set_route_source_preference

Also import named helpers, e.g. generateTripPlan, selectRouteCandidates, buildLiveValidation.

Env:
  OPENCLAW_SKILL_12306_DIR — directory of skills/12306 when monorepo root differs.
  TRAVEL_PLANNER_DB_DIR — JSON store root (see scripts/travel_db.mjs).

auto_validate is plan-only by default and does not run external commands.
`);
}

if (process.argv[1] === __filename) {
  printCliHint();
}
