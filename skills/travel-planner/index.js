import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildBookingReadyPackage } from "./scripts/booking_ready.mjs";
import { buildDailyBrief, buildPreTripBrief } from "./scripts/briefing.mjs";
import { buildLiveValidation } from "./scripts/live_validation.mjs";
import { generateTripPlan } from "./scripts/plan_generator.mjs";
import { selectRouteCandidates } from "./scripts/route_selector.mjs";
import {
  confirmBookingChoice,
  saveBookingReadyPackage,
  saveLiveResults,
  startTrip,
} from "./scripts/travel_db.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");
const skill12306Dir = path.join(repoRoot, "skills", "12306");

function runCommand(command, args) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
  });

  if (result.status !== 0) {
    const detail = result.stderr?.trim() || result.stdout?.trim() || `${command} exited with code ${result.status}`;
    throw new Error(detail);
  }

  const stdout = result.stdout?.trim();
  if (!stdout) {
    return {};
  }

  return JSON.parse(stdout);
}

function stringify(value) {
  return JSON.stringify(value ?? {});
}

function runDbAction(action, ...args) {
  if (action === "save_live_results") {
    const [tripId, jsonStr] = args;
    const payload = jsonStr ? JSON.parse(jsonStr) : {};
    return { ok: saveLiveResults(tripId, payload) };
  }
  if (action === "save_booking_ready") {
    const [tripId, jsonStr] = args;
    const payload = jsonStr ? JSON.parse(jsonStr) : {};
    return { ok: saveBookingReadyPackage(tripId, payload) };
  }
  if (action === "confirm_booking") {
    const [tripId, category, jsonStr] = args;
    const payload = jsonStr ? JSON.parse(jsonStr) : {};
    return { ok: confirmBookingChoice(tripId, category, payload) };
  }
  if (action === "start_trip") {
    const [tripId] = args;
    return { ok: startTrip(tripId) };
  }
  throw new Error(`Unknown DB action: ${action}`);
}

function mergeBucket(existing, incoming) {
  const currentItems = existing?.data?.itemList || [];
  const nextItems = incoming?.data?.itemList || [];
  return {
    ...(existing || {}),
    ...(incoming || {}),
    data: {
      ...((existing || {}).data || {}),
      ...((incoming || {}).data || {}),
      itemList: [...currentItems, ...nextItems],
    },
  };
}

function executeValidationPlan(validation) {
  const toolPlan = validation?.tool_plan || {};
  const aggregated = {
    flights: {},
    hotels: {},
    pois: {},
    transport: {
      pending: toolPlan.transport || [],
      trains: [],
    },
  };
  const errors = [];

  const buckets = ["flights", "hotels", "pois"];
  for (const bucket of buckets) {
    const checks = toolPlan[bucket] || [];
    for (const check of checks) {
      if (check.runner !== "flyai") continue;
      if ((check.cli_args || []).some((arg) => String(arg).includes("<"))) {
        errors.push({
          bucket,
          decision: check.decision,
          error: "Missing required input placeholders.",
        });
        continue;
      }
      try {
        const output = runCommand("flyai", check.cli_args || []);
        aggregated[bucket] = mergeBucket(aggregated[bucket], output);
      } catch (error) {
        errors.push({
          bucket,
          decision: check.decision,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  for (const check of toolPlan.transport || []) {
    if (check.runner === "12306") {
      const args = (check.cli_args || []).map((arg) =>
        arg === "{12306_baseDir}/scripts/query.mjs"
          ? path.join(skill12306Dir, "scripts", "query.mjs")
          : arg,
      );
      try {
        const [, scriptPath, ...nodeArgs] = args;
        const output = runCommand("node", [scriptPath, ...nodeArgs]);
        aggregated.transport.trains.push(...(Array.isArray(output) ? output : []));
      } catch (error) {
        errors.push({
          bucket: "transport",
          decision: check.decision,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  return { aggregated, errors };
}

export default async function travel_planner(input = {}) {
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

    const { aggregated: executedResults, errors: validationErrors } = executeValidationPlan(computedValidation);
    const mergedResults = {
      flights: mergeBucket(results.flights, executedResults.flights),
      hotels: mergeBucket(results.hotels, executedResults.hotels),
      pois: mergeBucket(results.pois, executedResults.pois),
      transport: {
        ...(results.transport || {}),
        ...(executedResults.transport || {}),
      },
    };

    const bookingReady = buildBookingReadyPackage(trip, route, computedValidation, mergedResults);

    if (input.tripId && input.persist !== false) {
      runDbAction("save_live_results", input.tripId, stringify(mergedResults));
      runDbAction("save_booking_ready", input.tripId, stringify(bookingReady));
    }

    return {
      validation: computedValidation,
      live_results: mergedResults,
      booking_ready: bookingReady,
      validation_errors: validationErrors,
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
    return runDbAction("save_live_results", input.tripId, stringify(results));
  }

  if (mode === "persist_booking_ready") {
    if (!input.tripId) {
      throw new Error("persist_booking_ready requires tripId");
    }
    return runDbAction("save_booking_ready", input.tripId, stringify(input.bookingReady || {}));
  }

  if (mode === "confirm_booking") {
    if (!input.tripId || !input.category) {
      throw new Error("confirm_booking requires tripId and category");
    }
    return runDbAction("confirm_booking", input.tripId, input.category, stringify(input.choice || {}));
  }

  if (mode === "start_trip") {
    if (!input.tripId) {
      throw new Error("start_trip requires tripId");
    }
    return runDbAction("start_trip", input.tripId);
  }

  throw new Error(`Unsupported travel-planner mode: ${mode}`);
}
