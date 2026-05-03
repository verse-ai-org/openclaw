import { parseArgs, requireFlag, optionalFlag, okJson, failJson } from "./lib/cli.mjs";
import { readMaybeJsonFromCliValue } from "./lib/json.mjs";
import { ARTIFACTS, STAGES } from "./lib/contracts.mjs";
import { existsArtifact, readArtifact, writeArtifact } from "./lib/artifacts.mjs";
import { appendTripEvent } from "./lib/events.mjs";
import { requireStageAtLeast, requireBookingsConfirmed } from "./lib/guards.mjs";
import {
  validatePoiCache,
  validateRouteEvidence,
  validateRoutePlan,
  validateRouteValidation,
} from "./lib/schema.mjs";

import fs from "node:fs";
import { tripDir } from "./lib/paths.mjs";
import { readJsonFile, writeJsonAtomic } from "./lib/json.mjs";

function tripFile(tripId) {
  return `${tripDir(tripId)}/trip.json`;
}

function loadTrip(tripId) {
  const p = tripFile(tripId);
  if (!fs.existsSync(p)) return null;
  return readJsonFile(p);
}

function writeTrip(trip) {
  writeJsonAtomic(tripFile(trip.id), trip);
}

function patchTripStage(tripId, patch) {
  const trip = loadTrip(tripId);
  if (!trip) return { ok: false, reasons: ["trip not found"] };
  const next = { ...trip, ...(patch && typeof patch === "object" ? patch : {}) };
  next.updated_at = new Date().toISOString();
  writeTrip(next);
  return { ok: true, trip: next };
}

function getRouteOptions(routePlanPayload) {
  if (
    routePlanPayload &&
    typeof routePlanPayload === "object" &&
    Array.isArray(routePlanPayload.route_options)
  ) {
    return routePlanPayload.route_options;
  }
  return [];
}

function validateSavedRouteEvidence(tripId) {
  const evidence = readArtifact(tripId, ARTIFACTS.ROUTE_EVIDENCE);
  if (!evidence) {
    return { ok: false, message: "evidence gate failed: missing route-evidence.json" };
  }
  const evidenceCheck = validateRouteEvidence(evidence);
  if (!evidenceCheck.ok) {
    return {
      ok: false,
      message: "evidence gate failed: invalid route-evidence.json",
      extra: { reasons: evidenceCheck.reasons },
    };
  }
  return { ok: true, evidence };
}

function validateRouteOptionIdsAgainstEvidence(routeOptions, evidence) {
  const evidenceRoutes = Array.isArray(evidence?.routes) ? evidence.routes : [];
  const evidenceRouteIdSet = new Set(
    evidenceRoutes
      .map((r) => (r && typeof r === "object" ? String(r.route_id || "").trim() : ""))
      .filter(Boolean),
  );
  const unknownRouteIds = routeOptions
    .map((o) => (o && typeof o === "object" ? String(o.route_id || "").trim() : ""))
    .filter((id) => id && !evidenceRouteIdSet.has(id));
  if (unknownRouteIds.length > 0) {
    return {
      ok: false,
      message: "route-id gate failed: route_options not found in route-evidence.routes",
      extra: { unknown_route_ids: [...new Set(unknownRouteIds)] },
    };
  }
  return { ok: true };
}

function collectUsedPoiIds(routeOptions) {
  const usedPoiIds = new Set();
  for (const opt of routeOptions) {
    const stops = opt && typeof opt === "object" ? opt.stop_points : null;
    if (Array.isArray(stops)) {
      for (const s of stops) {
        const poiId = s && typeof s === "object" ? String(s.poi_id || "").trim() : "";
        if (poiId) usedPoiIds.add(poiId);
      }
    }
  }
  return usedPoiIds;
}

/** Unique stop `name` values across all route_options (for single-route POI coverage gate). */
function buildStopNamesFromRouteOptions(routeOptions) {
  const names = new Set();
  for (const opt of routeOptions) {
    const stops = Array.isArray(opt?.stop_points) ? opt.stop_points : [];
    for (const stop of stops) {
      const name = String(stop?.name || "").trim();
      if (name) names.add(name);
    }
  }
  return [...names.values()].sort((a, b) => a.localeCompare(b));
}

function validatePoiCacheCoversPointNames(poiCache, pointNames) {
  const mergedPoints = Array.isArray(pointNames) ? pointNames : [];
  if (mergedPoints.length === 0) return { ok: true };
  const entries = Array.isArray(poiCache?.entries) ? poiCache.entries : [];
  const querySet = new Set(
    entries
      .map((e) => String(e?.query_name || "").trim())
      .filter(Boolean)
      .map((s) => s.toLocaleLowerCase()),
  );
  const missing = mergedPoints
    .map((p) => String(p || "").trim())
    .filter(Boolean)
    .filter((p) => !querySet.has(p.toLocaleLowerCase()));
  if (missing.length > 0) {
    return {
      ok: false,
      message: "poi gate failed: poi-cache does not cover required stop names (query_name match)",
      extra: { missing_points: missing },
    };
  }
  return { ok: true };
}

function validatePoiIds(tripId, usedPoiIds, routeOptions) {
  if (usedPoiIds.size === 0) return { ok: true };
  const poiCache = readArtifact(tripId, ARTIFACTS.POI_CACHE);
  if (!poiCache) return { ok: false, message: "poi gate failed: missing poi-cache.json" };
  const poiCheck = validatePoiCache(poiCache);
  if (!poiCheck.ok) {
    return {
      ok: false,
      message: "poi gate failed: invalid poi-cache.json",
      extra: { reasons: poiCheck.reasons },
    };
  }
  const entryList = Array.isArray(poiCache.entries) ? poiCache.entries : [];
  const entriesByPoiId = new Map();
  for (const entry of entryList) {
    const poiId = String(entry?.poi_id || "").trim();
    if (poiId) entriesByPoiId.set(poiId, entry);
  }
  const missing = [...usedPoiIds].filter((poiId) => !entriesByPoiId.has(poiId));
  if (missing.length > 0) {
    return { ok: false, message: "poi gate failed: missing poi_ids in poi-cache.json", extra: { missing } };
  }
  // Inline coordinates, images, and detail URLs in route_plan stop_points must be anchored to poi-cache.
  for (const opt of routeOptions) {
    const routeId = String(opt?.route_id || "").trim() || "unknown";
    const stops = Array.isArray(opt?.stop_points) ? opt.stop_points : [];
    for (const stop of stops) {
      const poiId = String(stop?.poi_id || "").trim();
      if (!poiId) continue;
      const cached = entriesByPoiId.get(poiId);
      if (!cached || typeof cached !== "object") continue;
      const lat = Number(stop?.lat);
      const lng = Number(stop?.lng);
      const cacheLat = Number(cached.lat);
      const cacheLng = Number(cached.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      if (!Number.isFinite(cacheLat) || !Number.isFinite(cacheLng)) continue;
      if (lat !== cacheLat || lng !== cacheLng) {
        return {
          ok: false,
          message: "poi gate failed: stop_points coords mismatch poi-cache",
          extra: {
            route_id: routeId,
            stop_name: String(stop?.name || "").trim(),
            poi_id: poiId,
            stop_coords: { lat, lng },
            cache_coords: { lat: cacheLat, lng: cacheLng },
          },
        };
      }

      const stopImage = String(stop?.image || "").trim();
      const cacheImage = String(cached.image || "").trim();
      if (stopImage && cacheImage && stopImage !== cacheImage) {
        return {
          ok: false,
          message: "poi gate failed: stop_points image mismatch poi-cache",
          extra: {
            route_id: routeId,
            stop_name: String(stop?.name || "").trim(),
            poi_id: poiId,
            stop_image: stopImage,
            cache_image: cacheImage,
          },
        };
      }
      if (stopImage && !cacheImage) {
        return {
          ok: false,
          message: "poi gate failed: stop_points image not verifiable by poi-cache",
          extra: {
            route_id: routeId,
            stop_name: String(stop?.name || "").trim(),
            poi_id: poiId,
            stop_image: stopImage,
          },
        };
      }
      if (!stopImage && cacheImage && stop && typeof stop === "object") {
        stop.image = cacheImage;
      }

      const stopDetailUrl = String(stop?.detail_url || "").trim();
      const cacheDetailUrl = String(cached.detail_url || "").trim();
      if (stopDetailUrl && cacheDetailUrl && stopDetailUrl !== cacheDetailUrl) {
        return {
          ok: false,
          message: "poi gate failed: stop_points detail_url mismatch poi-cache",
          extra: {
            route_id: routeId,
            stop_name: String(stop?.name || "").trim(),
            poi_id: poiId,
            stop_detail_url: stopDetailUrl,
            cache_detail_url: cacheDetailUrl,
          },
        };
      }
      if (stopDetailUrl && !cacheDetailUrl) {
        return {
          ok: false,
          message: "poi gate failed: stop_points detail_url not verifiable by poi-cache",
          extra: {
            route_id: routeId,
            stop_name: String(stop?.name || "").trim(),
            poi_id: poiId,
            stop_detail_url: stopDetailUrl,
          },
        };
      }
      if (!stopDetailUrl && cacheDetailUrl && stop && typeof stop === "object") {
        stop.detail_url = cacheDetailUrl;
      }
    }
  }
  return { ok: true };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const cmd = String(args.cmd || "").trim();
  try {
    if (!cmd || cmd === "help") {
      okJson({
        commands: [
          "save_route_evidence",
          "save_route_choice",
          "save_route_plan",
          "confirm_route_choice",
          "save_route_validation",
          "set_plan_depth_choice",
          "confirm_plan_overview",
          "start_trip",
          "doctor",
        ],
      });
      return;
    }

    if (cmd === "save_route_evidence") {
      const tripId = requireFlag(args, "trip-id");
      const payloadRaw = requireFlag(args, "payload");
      const parsed = readMaybeJsonFromCliValue(payloadRaw);
      if (!parsed.ok) return failJson(`invalid payload: ${parsed.error}`);
      const check = validateRouteEvidence(parsed.data);
      if (!check.ok) return failJson("route-evidence rejected", { reasons: check.reasons });

      writeArtifact(tripId, ARTIFACTS.ROUTE_EVIDENCE, parsed.data);
      appendTripEvent(tripId, "route_evidence_saved", {});
      okJson();
      return;
    }

    if (cmd === "save_route_choice") {
      const tripId = requireFlag(args, "trip-id");
      const routeId = String(requireFlag(args, "route-id") || "").trim();
      if (!routeId) return failJson("route-id required");

      const trip = loadTrip(tripId);
      if (!trip) return failJson("trip not found");
      if (String(trip.stage || "") !== STAGES.INTAKE) {
        return failJson("guard failed: save_route_choice only allowed from intake", {
          current_stage: trip.stage || "",
        });
      }

      const evidenceGate = validateSavedRouteEvidence(tripId);
      if (!evidenceGate.ok) return failJson(evidenceGate.message, evidenceGate.extra);

      const routes = Array.isArray(evidenceGate.evidence?.routes) ? evidenceGate.evidence.routes : [];
      const okRoute = routes.some((r) => r && String(r.route_id || "").trim() === routeId);
      if (!okRoute) return failJson("route-id not found in route-evidence", { route_id: routeId });

      const out = patchTripStage(tripId, {
        chosen_route_id: routeId,
        stage: STAGES.ROUTE_SELECTED,
      });
      if (!out.ok) return failJson("trip update failed", { reasons: out.reasons });
      appendTripEvent(tripId, "route_choice_saved", { route_id: routeId });
      okJson();
      return;
    }

    if (cmd === "save_route_plan") {
      const tripId = requireFlag(args, "trip-id");
      const payloadRaw = requireFlag(args, "payload");
      const parsed = readMaybeJsonFromCliValue(payloadRaw);
      if (!parsed.ok) return failJson(`invalid payload: ${parsed.error}`);
      const check = validateRoutePlan(parsed.data);
      if (!check.ok) return failJson("route-plan rejected", { reasons: check.reasons });
      const evidenceGate = validateSavedRouteEvidence(tripId);
      if (!evidenceGate.ok) return failJson(evidenceGate.message, evidenceGate.extra);
      const routeOptions = getRouteOptions(parsed.data);

      const tripBefore = loadTrip(tripId);
      if (!tripBefore) return failJson("trip not found");
      if (String(tripBefore.stage || "") !== STAGES.ROUTE_SELECTED) {
        return failJson("guard failed: save_route_plan only allowed at stage route_selected (after save_route_choice)", {
          current_stage: tripBefore.stage || "",
        });
      }
      const chosenEarly = String(tripBefore.chosen_route_id || "").trim();
      if (!chosenEarly) return failJson("guard failed: chosen_route_id required");
      const onlyId = String(routeOptions[0]?.route_id || "").trim();
      if (onlyId !== chosenEarly) {
        return failJson("route_plan rejected: route_id must match trip.chosen_route_id", {
          expected_route_id: chosenEarly,
          got_route_id: onlyId,
        });
      }

      const routeIdGate = validateRouteOptionIdsAgainstEvidence(routeOptions, evidenceGate.evidence);
      if (!routeIdGate.ok) return failJson(routeIdGate.message, routeIdGate.extra);

      const usedPoiIds = collectUsedPoiIds(routeOptions);
      const poiGate = validatePoiIds(tripId, usedPoiIds, routeOptions);
      if (!poiGate.ok) return failJson(poiGate.message, poiGate.extra);

      const poiCache = readArtifact(tripId, ARTIFACTS.POI_CACHE);
      const pointNamesForCoverage = buildStopNamesFromRouteOptions(routeOptions);
      const coverageGate = validatePoiCacheCoversPointNames(poiCache, pointNamesForCoverage);
      if (!coverageGate.ok) return failJson(coverageGate.message, coverageGate.extra);

      writeArtifact(tripId, ARTIFACTS.ROUTE_PLAN, parsed.data);
      const out = patchTripStage(tripId, { stage: STAGES.ROUTE_PLANNED });
      if (!out.ok) return failJson("trip update failed", { reasons: out.reasons });
      appendTripEvent(tripId, "route_plan_saved", { option_count: parsed.data.route_options?.length });
      okJson();
      return;
    }

    if (cmd === "confirm_route_choice") {
      const tripId = requireFlag(args, "trip-id");
      const routeId = requireFlag(args, "route-id");
      const trip = loadTrip(tripId);
      if (!trip) return failJson("trip not found");
      const gate = requireStageAtLeast(trip, STAGES.ROUTE_PLANNED);
      if (!gate.ok) return failJson("guard failed", { reasons: gate.reasons });

      const locked = String(trip.chosen_route_id || "").trim();
      if (locked && locked !== routeId) {
        return failJson("route-id must match trip.chosen_route_id", {
          expected_route_id: locked,
          got_route_id: routeId,
        });
      }

      const plan = readArtifact(tripId, ARTIFACTS.ROUTE_PLAN);
      const options = Array.isArray(plan?.route_options) ? plan.route_options : [];
      const ok = options.some((o) => String(o?.route_id || "") === routeId);
      if (!ok) return failJson("route-id not found in route-plan", { route_id: routeId });

      const out = patchTripStage(tripId, {
        chosen_route_id: routeId,
        stage: STAGES.ROUTE_CONFIRMED,
      });
      if (!out.ok) return failJson("trip update failed", { reasons: out.reasons });
      appendTripEvent(tripId, "route_choice_confirmed", { route_id: routeId });
      okJson();
      return;
    }

    if (cmd === "save_route_validation") {
      const tripId = requireFlag(args, "trip-id");
      const payloadRaw = requireFlag(args, "payload");
      const parsed = readMaybeJsonFromCliValue(payloadRaw);
      if (!parsed.ok) return failJson(`invalid payload: ${parsed.error}`);
      const check = validateRouteValidation(parsed.data);
      if (!check.ok) return failJson("route-validation rejected", { reasons: check.reasons });

      const trip = loadTrip(tripId);
      if (!trip) return failJson("trip not found");
      const gate = requireStageAtLeast(trip, STAGES.ROUTE_CONFIRMED);
      if (!gate.ok) return failJson("guard failed", { reasons: gate.reasons });

      writeArtifact(tripId, ARTIFACTS.ROUTE_VALIDATION, parsed.data);
      // Clear any previous plan depth decision; Step 4 must re-confirm the next depth after validation.
      const out = patchTripStage(tripId, {
        stage: STAGES.VALIDATED,
        plan_depth_choice: undefined,
        plan_overview_confirmed: false,
      });
      if (!out.ok) return failJson("trip update failed", { reasons: out.reasons });
      appendTripEvent(tripId, "route_validated", {
        verdict: parsed.data.verdict,
        cleared_plan_depth: true,
      });
      okJson();
      return;
    }

    if (cmd === "set_plan_depth_choice") {
      const tripId = requireFlag(args, "trip-id");
      const choice = String(requireFlag(args, "choice") || "").trim();
      if (!["plan_overview", "full_plan"].includes(choice)) {
        return failJson("invalid choice", { allowed: ["plan_overview", "full_plan"], choice });
      }

      const trip = loadTrip(tripId);
      if (!trip) return failJson("trip not found");
      const gate = requireStageAtLeast(trip, STAGES.VALIDATED);
      if (!gate.ok) return failJson("guard failed", { reasons: gate.reasons });

      const out = patchTripStage(tripId, {
        plan_depth_choice: choice,
        plan_overview_confirmed: false,
      });
      if (!out.ok) return failJson("trip update failed", { reasons: out.reasons });
      appendTripEvent(tripId, "plan_depth_chosen", { choice });
      okJson();
      return;
    }

    if (cmd === "confirm_plan_overview") {
      const tripId = requireFlag(args, "trip-id");
      const trip = loadTrip(tripId);
      if (!trip) return failJson("trip not found");
      const gate = requireStageAtLeast(trip, STAGES.VALIDATED);
      if (!gate.ok) return failJson("guard failed", { reasons: gate.reasons });
      const depth = String(trip.plan_depth_choice || "").trim();
      if (depth !== "plan_overview") {
        return failJson("guard failed: confirm_plan_overview requires plan_depth_choice=plan_overview", {
          plan_depth_choice: depth || "(missing)",
        });
      }
      if (!existsArtifact(tripId, ARTIFACTS.PLAN_OVERVIEW)) {
        return failJson("guard failed: plan-overview.json missing (run plan.mjs save_overview first)");
      }
      const out = patchTripStage(tripId, { plan_overview_confirmed: true });
      if (!out.ok) return failJson("trip update failed", { reasons: out.reasons });
      appendTripEvent(tripId, "plan_overview_confirmed", {});
      okJson();
      return;
    }

    if (cmd === "start_trip") {
      const tripId = requireFlag(args, "trip-id");
      const trip = loadTrip(tripId);
      if (!trip) return failJson("trip not found");
      const gate1 = requireStageAtLeast(trip, STAGES.VALIDATED);
      if (!gate1.ok) return failJson("guard failed", { reasons: gate1.reasons });
      const gate2 = requireBookingsConfirmed(trip);
      if (!gate2.ok) return failJson("guard failed", { reasons: gate2.reasons });

      const out = patchTripStage(tripId, { stage: STAGES.IN_TRIP });
      if (!out.ok) return failJson("trip update failed", { reasons: out.reasons });
      appendTripEvent(tripId, "trip_started", {});
      okJson();
      return;
    }

    if (cmd === "doctor") {
      const tripId = requireFlag(args, "trip-id");
      const trip = loadTrip(tripId);
      if (!trip) return failJson("trip not found");
      const artifacts = {
        poi_cache: !!readArtifact(tripId, ARTIFACTS.POI_CACHE),
        poi_preview: !!readArtifact(tripId, ARTIFACTS.POI_PREVIEW),
        route_evidence: !!readArtifact(tripId, ARTIFACTS.ROUTE_EVIDENCE),
        route_plan: !!readArtifact(tripId, ARTIFACTS.ROUTE_PLAN),
        route_validation: !!readArtifact(tripId, ARTIFACTS.ROUTE_VALIDATION),
        plan_overview: !!readArtifact(tripId, ARTIFACTS.PLAN_OVERVIEW),
        plan_details: !!readArtifact(tripId, ARTIFACTS.PLAN_DETAILS),
        live_results: !!readArtifact(tripId, ARTIFACTS.LIVE_RESULTS),
        booking_ready: !!readArtifact(tripId, ARTIFACTS.BOOKING_READY),
      };
      okJson({ trip, artifacts });
      return;
    }

    failJson(`unknown cmd: ${cmd}`);
  } catch (e) {
    failJson(e instanceof Error ? e.message : String(e));
  }
}

main();
