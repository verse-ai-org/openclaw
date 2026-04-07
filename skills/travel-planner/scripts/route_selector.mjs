/** Route framing module (single-platform + fallback metadata). */

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

function normalizePlatform(value) {
  const text = normalizeText(value);
  if (text === "xhs" || text === "xiaohongshu" || text === "小红书") return "xhs";
  if (text === "amap" || text === "gaode" || text === "高德地图") return "amap";
  if (text === "web" || text === "web_search" || text === "search" || text === "搜索引擎") return "web";
  if (text === "auto" || !text) return "auto";
  return "xhs";
}

function inferDestinationLabel(tripRequest) {
  return String(
    tripRequest.destination_text ||
      tripRequest.destination?.region ||
      tripRequest.destination?.city ||
      tripRequest.destination?.country ||
      "目的地",
  ).trim();
}

function inferDurationDays(tripRequest) {
  const days = Number.parseInt(String(tripRequest.duration_days || 5), 10);
  if (!Number.isFinite(days) || days <= 0) return 5;
  return days;
}

function buildPlatformDefaultCandidates(tripRequest, platform) {
  const destinationLabel = inferDestinationLabel(tripRequest);
  const days = inferDurationDays(tripRequest);
  const baseTitle =
    platform === "xhs"
      ? "小红书热度优先线"
      : platform === "amap"
        ? "高德可达性优先线"
        : "搜索引擎时效优先线";
  const baseSummary =
    platform === "xhs"
      ? `基于${destinationLabel}的热门游记偏好生成，适合先框定玩法。`
      : platform === "amap"
        ? `基于${destinationLabel}的路网与转场可达性生成，适合控行车/换乘压力。`
        : `基于${destinationLabel}的公开网页信息生成，适合补充时效与临时信息。`;

  const primary = {
    route_id: `${platform}_primary_${days}d`,
    title: `${destinationLabel}${days}天·${baseTitle}`,
    summary: baseSummary,
    source_platform: platform,
    duration_days: days,
  };
  const altFast = {
    route_id: `${platform}_alt_fast_${days}d`,
    title: `${destinationLabel}${days}天·紧凑覆盖线`,
    summary: "覆盖点位更多，但转场压力更高。",
    source_platform: platform,
    duration_days: days,
  };
  const altRelaxed = {
    route_id: `${platform}_alt_relaxed_${days}d`,
    title: `${destinationLabel}${days}天·轻松慢游线`,
    summary: "转场更少，留白更多，适合稳节奏。",
    source_platform: platform,
    duration_days: days,
  };

  return {
    ok: true,
    recommended_route: primary,
    alternatives: [altFast, altRelaxed],
    route_options: [primary, altFast, altRelaxed],
    source_confidence: platform === "web" ? "low" : "medium",
    evidence_summary: "",
    evidence_links: [],
  };
}

function buildXhsCandidatesFromEvidence(xhsEvidence) {
  const loops = Array.isArray(xhsEvidence?.route_hints?.popular_loops)
    ? xhsEvidence.route_hints.popular_loops
    : [];
  if (loops.length === 0) return null;
  const quality = String(xhsEvidence?.evidence_quality || "medium").toLowerCase();
  const links = (xhsEvidence?.sources || []).map((item) => item?.url).filter(Boolean).slice(0, 8);
  const primaryStops = Array.isArray(loops[0]) ? loops[0] : [];
  const primary = {
    route_id: "xhs_primary_1",
    title: "小红书高频路线",
    summary: String(xhsEvidence?.summary || "基于小红书游记聚合生成"),
    stops: primaryStops,
    source_platform: "xhs",
    evidence_quality: quality,
    evidence_links: links,
  };
  const alternatives = loops.slice(1, 3).map((stops, index) => ({
    route_id: `xhs_alt_${index + 1}`,
    title: `小红书备选路线${index + 1}`,
    summary: "基于小红书不同游记取向生成的备选。",
    stops: Array.isArray(stops) ? stops : [],
    source_platform: "xhs",
    evidence_quality: quality,
  }));
  return {
    ok: true,
    recommended_route: primary,
    alternatives,
    route_options: [primary, ...alternatives].slice(0, 3),
    source_confidence: quality === "high" ? "high" : "medium",
    evidence_summary: String(xhsEvidence?.summary || ""),
    evidence_links: links,
  };
}

function buildRouteCandidatesFromInput(tripRequest, platform) {
  const candidates = Array.isArray(tripRequest.route_candidates) ? tripRequest.route_candidates : [];
  const options = Array.isArray(tripRequest.route_options) ? tripRequest.route_options : [];
  const sourceOptions = (candidates.length > 0 ? candidates : options).slice(0, 3);
  if (sourceOptions.length === 0) {
    if (platform === "xhs") {
      const fromEvidence = buildXhsCandidatesFromEvidence(tripRequest.xhs_evidence || {});
      if (fromEvidence) return fromEvidence;
    }
    return buildPlatformDefaultCandidates(tripRequest, platform);
  }
  const mapped = sourceOptions.map((item, index) => ({
    ...item,
    route_id: item?.route_id || `${platform}_route_${index + 1}`,
    source_platform: platform,
  }));
  return {
    ok: true,
    recommended_route: mapped[0] || {},
    alternatives: mapped.slice(1),
    route_options: mapped,
    source_confidence: "medium",
    evidence_summary: String(tripRequest.source_reason || "").trim(),
    evidence_links: [],
  };
}

/**
 * Route framing entry.
 *
 * Decision strategy:
 * 1) single platform only
 * 2) default platform: xhs
 * 3) when preference=auto, follow xhs -> amap -> web
 *
 * @param {object} tripRequest
 * @returns {{
 *   destination_key: string,
 *   recommended_route: object,
 *   alternatives: object[],
 *   rejected_routes: object[],
 *   framing_source: "agent_tools",
 *   used_platform: string,
 *   fallback_count: number,
 *   fallback_chain: Array<{platform: string, reason: string}>,
 *   fallback_reason: string,
 *   source_reason: string,
 *   source_confidence: string,
 *   evidence_summary: string,
 *   evidence_links: string[],
 *   route_options: object[],
 *   comparison: object[],
 *   next_action: string,
 *   planning_note: string,
 * }}
 */
export function selectRouteCandidates(tripRequest) {
  const key = destinationKey(tripRequest);
  const preference = normalizePlatform(tripRequest.route_source_preference || "xhs");
  const fallbackChain = Array.isArray(tripRequest.route_source_fallbacks)
    ? tripRequest.route_source_fallbacks
    : [];
  const usedPlatform = normalizePlatform(
    tripRequest.route_source_used || (preference === "auto" ? "xhs" : preference),
  );
  const candidates = buildRouteCandidatesFromInput(tripRequest, usedPlatform);
  const sourceReason = String(tripRequest.source_reason || "").trim();
  const nextAction = candidates.ok
    ? ""
    : "Switch to the next platform in fallback chain: xhs -> amap -> web.";

  return {
    destination_key: key,
    recommended_route: candidates.recommended_route,
    alternatives: candidates.alternatives,
    rejected_routes: [],
    framing_source: "agent_tools",
    used_platform: usedPlatform,
    fallback_count: fallbackChain.length,
    fallback_chain: fallbackChain,
    fallback_reason: fallbackChain.length > 0 ? String(fallbackChain[0]?.reason || "") : "",
    source_reason: sourceReason,
    source_confidence: candidates.source_confidence,
    evidence_summary: candidates.evidence_summary,
    evidence_links: candidates.evidence_links,
    route_options: candidates.route_options,
    comparison: candidates.route_options.map((option, index) => ({
      route_id: option.route_id,
      rank: index + 1,
      fit_reason: index === 0 ? "Primary recommendation from selected platform." : "Backup option.",
      risk_note: "Verify transport and hotel feasibility before booking.",
    })),
    next_action: nextAction,
    planning_note:
      "Single-platform route framing. Default xhs; if failed, fallback to amap then web search.",
  };
}

function printRouteSelectorHelp() {
  console.log(`route_selector.mjs — route framing decision module

All flags use --key=value. JSON may be inline or @path.

This script consumes trip input and returns route framing candidates + platform metadata.
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
