import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { assertOnlyFlags, readJsonFromCliValue, requireCmd, requireFlag, runScript } from "./cli_args.mjs";
import {
  getSelectedRoute,
  getTripById,
  STAGE_VALUES,
  updateTrip,
} from "./trips.mjs";

/** @type {string | null} */
let dbDirOverride = null;

export function setTripWorkflowDbDirForTests(dir) {
  dbDirOverride = dir;
}

function dbDir() {
  if (process.env.TRAVEL_PLANNER_DB_DIR) {
    return process.env.TRAVEL_PLANNER_DB_DIR;
  }
  return dbDirOverride ?? path.join(os.homedir(), ".openclaw", "agents", "travel-planner");
}

const evidenceDir = () => path.join(dbDir(), "data", "evidence");
const tripsDataDir = () => path.join(dbDir(), "data", "trips");

function loadJson(filePath) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function saveJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
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
  return path.join(tripsDataDir(), safeTripId, `evidence.${safePlatform}.json`);
}

function legacyEvidenceFilePath(tripId, platform = "xhs") {
  const safeTripId = sanitizeFileToken(tripId);
  const safePlatform = sanitizeFileToken(platform || "xhs");
  return path.join(evidenceDir(), `${safeTripId}.${safePlatform}.json`);
}

function resolveExistingEvidencePath(tripId, platform) {
  const nextPath = evidenceFilePath(tripId, platform);
  if (fs.existsSync(nextPath)) return nextPath;
  const legacyPath = legacyEvidenceFilePath(tripId, platform);
  if (fs.existsSync(legacyPath)) return legacyPath;
  return nextPath;
}

function normalizePlatformName(platform) {
  const text = String(platform || "")
    .trim()
    .toLowerCase();
  if (!text) return "search";
  if (text === "xiaohongshu" || text === "小红书") return "xhs";
  if (text === "search" || text === "搜索" || text === "search_engine" || text === "搜索引擎")
    return "search";
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
    route_hints:
      payload.route_hints && typeof payload.route_hints === "object" ? payload.route_hints : {},
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

function evaluateStepGate(trip, step) {
  const normalizedStep = String(step || "")
    .trim()
    .toLowerCase();
  const options = Array.isArray(trip.route_options) ? trip.route_options : [];
  const reasons = [];

  // Workflow-aligned step aliases (primary):
  // - Step 2: route planning (候选路线已持久化)
  // - Step 3: validate transport & weather (route_validation 已落盘)
  // - Step 4: itinerary skeleton (需要 Step 3 结果 + route_choice_confirmed)
  // - Step 5: itinerary detail & booking-ready (需要 Step 3 结果 + route_choice_confirmed)
  // - Step 6: in-trip support (需要 bookings_confirmed)
  //
  // Backward-compat: keep older internal numbering (step5..step9) and named aliases.
  if (
    normalizedStep === "route_plan" ||
    normalizedStep === "step2" ||
    normalizedStep === "2"
  ) {
    // Step 2 (route planning): route_options must already be persisted.
    if (options.length < 2) {
      reasons.push("需要至少 2 条候选路线（route_options >= 2）。");
    }
  } else if (
    normalizedStep === "route_validation" ||
    normalizedStep === "step3" ||
    normalizedStep === "3"
  ) {
    // Step 3 (validate transport & weather) — historically referenced as step5.
    if (!trip.route_choice_confirmed || !trip.chosen_route_id) {
      reasons.push("需要先确认路线（route_choice_confirmed=true 且存在 chosen_route_id）。");
    }
  } else if (
    normalizedStep === "itinerary_skeleton" ||
    normalizedStep === "plan_summary" ||
    normalizedStep === "step4_itinerary" ||
    normalizedStep === "step4" ||
    normalizedStep === "4"
  ) {
    // Step 4 (itinerary skeleton) — historically referenced as plan_summary / step6.
    if (!trip.route_choice_confirmed || !trip.chosen_route_id) {
      reasons.push("需要先确认路线后才能进入骨架确认。");
    }
    if (!String(trip.route_validation?.verdict || "").trim()) {
      reasons.push("需要先完成并持久化 route_validation.verdict。");
    }
  } else if (
    normalizedStep === "detailed_plan" ||
    normalizedStep === "booking_ready" ||
    normalizedStep === "step5" ||
    normalizedStep === "5" ||
    normalizedStep === "step7" ||
    normalizedStep === "7"
  ) {
    // Step 5 (detail & booking-ready) — historically split across step7/step8.
    if (!trip.route_choice_confirmed || !trip.chosen_route_id) {
      reasons.push("需要先确认路线。");
    }
    if (!String(trip.route_validation?.verdict || "").trim()) {
      reasons.push("需要先完成交通/天气验证（Step 5）。");
    }
  } else if (
    normalizedStep === "step8" ||
    normalizedStep === "8"
  ) {
    // Legacy alias for booking-ready stage gate.
    if (!trip.route_choice_confirmed || !trip.chosen_route_id) {
      reasons.push("需要先确认路线。");
    }
    if (!String(trip.route_validation?.verdict || "").trim()) {
      reasons.push("需要先完成 route_validation。");
    }
  } else if (
    normalizedStep === "in_trip" ||
    normalizedStep === "step6" ||
    normalizedStep === "step9" ||
    normalizedStep === "9"
  ) {
    // Step 6 (in-trip) — historically step9.
    if (!trip.bookings_confirmed) {
      reasons.push("需要先确认关键预订项（bookings_confirmed=true）。");
    }
  } else {
    reasons.push(`不支持的 step: ${step}`);
  }

  return {
    ok: reasons.length === 0,
    step: normalizedStep,
    stage: trip.stage,
    reasons,
  };
}

function canEnterBookingReady(trip) {
  return evaluateStepGate(trip, "booking_ready").ok;
}

function canConfirmBookingStage(trip) {
  return trip.stage === STAGE_VALUES.BOOKING_READY || canEnterBookingReady(trip);
}

function canStartTripStage(trip) {
  return evaluateStepGate(trip, "in_trip").ok;
}

function emptyLiveResults() {
  return { flights: {}, hotels: {}, pois: {}, transport: {}, updated_at: "" };
}

export function checkStepGate(tripId, step) {
  const trip = getTripById(tripId);
  if (!trip) return null;
  return evaluateStepGate(trip, step);
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
  /** @type {Record<string, unknown> | null} */ planOutputFull = null,
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
    stage: STAGE_VALUES.ROUTE_PLANNED,
    chosen_route_id: recommendedRoute && recommendedRoute.route_id ? recommendedRoute.route_id : "",
    route_options: routeOptions,
    route_choice_confirmed: false,
    route_source_used: usedPlatform || "",
    route_source_fallbacks: normalizedFallbacks,
    ...(routeSourcePreference ? { route_source_preference: routeSourcePreference } : {}),
    route_plan: {
      used_platform: usedPlatform || "",
      fallback_count: Number.isFinite(Number(fallbackCount)) ? Number(fallbackCount) : 0,
      fallback_reason: fallbackReason || "",
      fallback_chain: normalizedFallbacks,
      recommended_route_id:
        recommendedRoute && recommendedRoute.route_id ? recommendedRoute.route_id : "",
      alternative_ids: (alternatives || []).map((r) => r?.route_id).filter(Boolean),
      rejected_route_ids: (rejectedRoutes || []).map((r) => r?.route_id).filter(Boolean),
      decision_summary: normalizedDecisionSummary,
    },
    ...(planOutputFull && typeof planOutputFull === "object"
      ? { step4_plan_output_full: planOutputFull }
      : {}),
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
    chosen_route_id: routeId,
    route_choice_confirmed: true,
    stage: STAGE_VALUES.ROUTE_CONFIRMED,
  });
}

export function saveXhsEvidence(tripId, xhsEvidence) {
  return saveRouteEvidence(tripId, "xhs", xhsEvidence);
}

export function saveRouteEvidence(tripId, platform, evidencePayload) {
  const trip = getTripById(tripId);
  if (!trip) return false;
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
    ? path.relative(dbDir(), resolveExistingEvidencePath(tripId, selectedPlatform))
    : String(defaultMeta.evidence_file || "");
  let payload = null;
  let meta = defaultMeta;
  if (relPath) {
    const absPath = path.join(dbDir(), relPath);
    const fallbackAbsPath =
      hasExplicitPlatform && !fs.existsSync(absPath)
        ? resolveExistingEvidencePath(tripId, selectedPlatform)
        : absPath;
    if (fs.existsSync(fallbackAbsPath)) {
      payload = loadJson(fallbackAbsPath);
      if (hasExplicitPlatform) {
        const normalized = normalizeEvidenceV1(selectedPlatform, payload || {});
        meta = buildEvidenceMeta(normalized, fallbackAbsPath);
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
  const trip = getTripById(tripId);
  if (!trip) return false;
  if (!canEnterBookingReady(trip)) return false;
  const nextStage =
    bookingReady?.status === "ready" ? STAGE_VALUES.BOOKING_READY : STAGE_VALUES.ROUTE_CONFIRMED;
  return updateTrip(tripId, { booking_ready: bookingReady, stage: nextStage });
}

export function confirmBookingChoice(tripId, category, choice) {
  const trip = getTripById(tripId);
  if (!trip) return false;
  if (!canConfirmBookingStage(trip)) return false;
  const confirmed = { ...trip.confirmed_bookings };
  confirmed[category] = choice;
  const updates = { confirmed_bookings: confirmed };
  if (category === "flight" || category === "hotel") {
    updates.bookings_confirmed = true;
    updates.stage = STAGE_VALUES.BOOKING_READY;
  }
  return updateTrip(tripId, updates);
}

export function startTrip(tripId) {
  const trip = getTripById(tripId);
  if (!trip) return false;
  if (!canStartTripStage(trip)) return false;
  return updateTrip(tripId, { stage: STAGE_VALUES.IN_TRIP, during_trip: true });
}

const CMD_FLAGS = {
  save_live_results: ["cmd", "trip-id", "payload"],
  save_booking_ready: ["cmd", "trip-id", "payload"],
  save_route_evidence: ["cmd", "trip-id", "platform", "payload"],
  get_route_evidence: ["cmd", "trip-id", "platform"],
  check_step_gate: ["cmd", "trip-id", "step"],
  save_route_plan: [
    "cmd",
    "trip-id",
    "plan-output",
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
};

runScript({
  name: "trip-workflow.mjs",
  description: "旅行规划 trip 流程状态与 evidence 管理器",
  usage: "node trip-workflow.mjs --cmd=<name> [其他 flag...]",
  flags: Object.keys(CMD_FLAGS)
    .flatMap((cmd) => CMD_FLAGS[cmd].map((f) => ({ name: f, desc: `用于 --cmd=${cmd}` })))
    .filter((f, i, arr) => arr.findIndex((x) => x.name === f.name) === i),
  required: ["cmd"],
  callerUrl: import.meta.url,
  run(args) {
    const command = requireCmd(args);
    const allowed = CMD_FLAGS[command];
    if (allowed) assertOnlyFlags(args, allowed);

    if (command === "save_live_results") {
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
      const planOutput = readJsonFromCliValue("plan-output", args["plan-output"], null);
      let recommendedRoute = {};
      let alternatives = [];
      if (planOutput && typeof planOutput === "object") {
        const options = Array.isArray(planOutput.route_options) ? planOutput.route_options : [];
        if (options.length < 2) {
          console.error("Error: --plan-output.route_options must contain at least 2 options");
          process.exit(1);
        }
        recommendedRoute = options[0] || {};
        alternatives = options.slice(1);
      }
      const rejectedRoutes = readJsonFromCliValue("rejected-routes", args["rejected-routes"], []);
      const decisionSummary = readJsonFromCliValue("decision-summary", args["decision-summary"], {});
      const routeSourceUsed = String(args["route-source-used"] || "");
      const sourceReason = String(args["source-reason"] || "");
      const routeSourcePref = String(args["route-source-preference"] || "");
      const fallbackChain = (() => {
        const raw = readJsonFromCliValue("route-source-fallbacks", args["route-source-fallbacks"], []);
        return Array.isArray(raw) ? raw : [];
      })();
      const fallbackCount = fallbackChain.length;
      const fallbackReason = fallbackCount > 0 ? String(fallbackChain[0]?.reason || "") : "";
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
        planOutput && typeof planOutput === "object" ? planOutput : null,
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
    } else {
      console.error(`未知 --cmd 值: ${command}`);
      process.exit(1);
    }
  },
});
