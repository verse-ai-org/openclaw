/**
 * Route framing module
 *
 * Single responsibility:
 * - decide route candidates (primary + backup) from normalized trip input
 * - expose source metadata so downstream modules know whether route is XHS-first or fallback
 *
 * Non-goals:
 * - do NOT generate daily itinerary cards
 * - do NOT run live booking validation
 *
 * Design note:
 * Route framing is intentionally isolated here so `plan_generator.mjs` can stay focused on
 * composing the final plan document from an already-framed route.
 */

import { fileURLToPath } from "node:url";

import {
  assertOnlyFlags,
  isCliHelp,
  parseCliArgs,
  readJsonFromCliValue,
  requireFlag,
} from "./cli_args.mjs";

function normalizeText(value) {
  return String(value).trim().toLowerCase();
}

function destinationKey(tripRequest) {
  const destination = tripRequest.destination || {};
  const parts = [
    destination.city || "",
    destination.region || "",
    destination.country || "",
    tripRequest.destination_text || "",
  ];
  const text = parts.filter(Boolean).join(" ");
  const normalized = normalizeText(text);
  return "generic";
}

/**
 * Build a normalized route candidate from XHS evidence.
 * This helper never talks to XHS directly; it only consumes pre-normalized evidence
 * written on the trip record by the agent orchestration step.
 *
 * @param {object} xhsEvidence
 * @returns {{
 *   recommended_route: object,
 *   alternatives: object[],
 *   evidence_links: string[],
 *   evidence_summary: string,
 *   source_confidence: string
 * }}
 */
function buildXhsRouteCandidates(xhsEvidence) {
  const routes = xhsEvidence.route_hints?.popular_loops || [];
  const stops = xhsEvidence.route_hints?.popular_stops || [];
  const bases = xhsEvidence.stay_hints?.recommended_bases || [];
  const summary = String(xhsEvidence.summary || "").trim();
  const quality = String(xhsEvidence.evidence_quality || "low").toLowerCase();
  const links = (xhsEvidence.sources || []).slice(0, 8).map((item) => item.url).filter(Boolean);

  const recommendedRoute = {
    route_id: "xhs_primary_1",
    title: "Xiaohongshu high-frequency route",
    summary: summary || "Route synthesized from Xiaohongshu recent travel notes.",
    stops: routes[0] || [],
    hotel_bases: bases,
    poi_cities: stops.slice(0, 8),
    source: "xiaohongshu",
    evidence_quality: quality,
    evidence_links: links,
  };

  const alternatives = routes.slice(1, 3).map((routeStops, index) => ({
    route_id: `xhs_alt_${index + 1}`,
    title: `Xiaohongshu backup route ${index + 1}`,
    summary: "Alternative route extracted from Xiaohongshu notes.",
    stops: routeStops,
    source: "xiaohongshu",
    evidence_quality: quality,
  }));

  // Keep at least 2 route choices for user confirmation.
  if (alternatives.length === 0 && recommendedRoute.stops.length >= 3) {
    alternatives.push({
      route_id: "xhs_alt_scenic_relaxed",
      title: "Xiaohongshu scenic-relaxed variant",
      summary: "Lower transfer pressure variant derived from high-frequency stops.",
      stops: recommendedRoute.stops.slice(0, Math.max(3, recommendedRoute.stops.length - 1)),
      source: "xiaohongshu",
      evidence_quality: quality,
    });
  }

  const routeOptions = [recommendedRoute, ...alternatives].slice(0, 3);
  const comparison = routeOptions.map((option, index) => ({
    route_id: option.route_id,
    rank: index + 1,
    fit_reason:
      index === 0
        ? "Best fit from Xiaohongshu high-frequency route evidence."
        : "Backup option with different transfer/pace tradeoff.",
    risk_note: index === 0 ? "Expect holiday crowding on hot stops." : "May trade scenery density for lower logistics risk.",
  }));

  return {
    recommended_route: recommendedRoute,
    alternatives,
    route_options: routeOptions,
    comparison,
    evidence_links: links,
    evidence_summary: summary,
    source_confidence: quality,
  };
}

/**
 * Route framing entry.
 *
 * Decision strategy:
 * 1) default to `xhs_first`
 * 2) if XHS evidence is sufficiently strong, produce XHS-driven primary/backup routes
 * 3) otherwise return fallback metadata + actionable next step; downstream can still continue safely
 *
 * @param {object} tripRequest
 * @returns {{
 *   destination_key: string,
 *   recommended_route: object,
 *   alternatives: object[],
 *   rejected_routes: object[],
 *   framing_source: "agent_tools",
 *   recommendation_source: string,
 *   source_reason: string,
 *   source_confidence: string,
 *   evidence_summary: string,
 *   evidence_links: string[],
 *   route_options: object[],
 *   comparison: object[],
 *   requires_xhs_evidence: boolean,
 *   next_action: string,
 *   planning_note: string,
 * }}
 */
export function selectRouteCandidates(tripRequest) {
  const key = destinationKey(tripRequest);
  const policy = tripRequest.recommendation_source_policy || "xhs_first";
  const xhsEvidence = tripRequest.xhs_evidence || {};
  const quality = String(xhsEvidence.evidence_quality || "low").toLowerCase();
  const hasUsableLoops = Array.isArray(xhsEvidence.route_hints?.popular_loops) &&
    xhsEvidence.route_hints.popular_loops.length > 0;
  const hasUsableXhsEvidence =
    policy === "xhs_first" && hasUsableLoops && (quality === "high" || quality === "medium");

  const xhsCandidates = hasUsableXhsEvidence
    ? buildXhsRouteCandidates(xhsEvidence)
    : {
        recommended_route: {},
        alternatives: [],
        route_options: [],
        comparison: [],
        evidence_links: [],
        evidence_summary: "",
        source_confidence: "low",
      };

  const sourceReason =
    policy === "model_only"
      ? "model_only"
      : hasUsableXhsEvidence
        ? ""
        : xhsEvidence.generated_at
          ? "xhs_low_signal"
          : "xhs_runtime_error";
  const recommendationSource =
    policy === "model_only" ? "model_only" : hasUsableXhsEvidence ? "xhs_first" : "model_fallback";

  return {
    destination_key: key,
    recommended_route: xhsCandidates.recommended_route,
    alternatives: xhsCandidates.alternatives,
    rejected_routes: [],
    framing_source: "agent_tools",
    recommendation_source: recommendationSource,
    source_reason: sourceReason,
    source_confidence: xhsCandidates.source_confidence,
    evidence_summary: xhsCandidates.evidence_summary,
    evidence_links: xhsCandidates.evidence_links,
    route_options: xhsCandidates.route_options,
    comparison: xhsCandidates.comparison,
    requires_xhs_evidence: policy === "xhs_first" && !hasUsableXhsEvidence,
    next_action:
      policy === "xhs_first" && !hasUsableXhsEvidence
        ? "Run Xiaohongshu search/detail first, normalize xhs_evidence.route_hints.popular_loops, then re-run route framing."
        : "",
    planning_note:
      "This skill does not ship pre-baked routes. Default to Xiaohongshu-first route framing; " +
      "if evidence is missing or weak, return fallback metadata and explicit next action before validation.",
  };
}

function printRouteSelectorHelp() {
  console.log(`route_selector.mjs — route framing decision module

All flags use --key=value. JSON may be inline or @path.

This script consumes trip + optional xhs_evidence and returns route framing candidates + source metadata.
It does not perform external network calls itself.

Usage:
  node route_selector.mjs --input=<trip_request_json|@file>

Example:
  node route_selector.mjs --input='{"destination":{"region":"Xinjiang"},"duration_days":7}'
`);
}

function main() {
  const argv = process.argv.slice(2);
  if (isCliHelp(argv)) {
    printRouteSelectorHelp();
    process.exit(0);
  }
  const args = parseCliArgs(argv);
  assertOnlyFlags(args, ["input"]);
  requireFlag(args, "input");
  const payload = readJsonFromCliValue("input", args.input, undefined);
  console.log(JSON.stringify(selectRouteCandidates(payload), null, 2));
}

const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] === __filename) {
  main();
}
