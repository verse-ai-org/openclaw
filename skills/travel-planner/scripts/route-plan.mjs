/** Route framing module (single-platform + fallback metadata). */

import { readJsonFromCliValue, runScript } from "./cli_args.mjs";

function normalizeText(value) {
  return String(value).trim().toLowerCase();
}

function normalizePlatform(value) {
  const text = normalizeText(value);
  if (text === "xhs" || text === "xiaohongshu" || text === "小红书") return "xhs";
  if (text === "search" || text === "搜索" || text === "search_engine" || text === "搜索引擎")
    return "search";
  if (text === "auto" || !text) return "search";
  return "search";
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
    source_confidence: platform === "search" ? "low" : "medium",
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
  const links = (xhsEvidence?.sources || [])
    .map((item) => item?.url)
    .filter(Boolean)
    .slice(0, 8);
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
  // 若只有 1 条 loop，补一个平台默认备选，确保 route_options.length >= 2
  if (alternatives.length === 0) {
    alternatives.push({
      route_id: "xhs_alt_generic",
      title: "备选路线（自动补全）",
      summary: "基于小红书证据自动补全的备选路线框架，待进一步补充。",
      stops: primaryStops.slice().reverse().filter(Boolean),
      source_platform: "xhs",
      evidence_quality: quality,
    });
  }

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

function uniqueStops(input) {
  const seen = new Set();
  const list = [];
  for (const item of input || []) {
    const stop = String(item || "").trim();
    if (!stop) continue;
    const key = stop.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    list.push(stop);
  }
  return list;
}

function buildSearchCandidatesFromEvidence(searchEvidence) {
  const quality = String(searchEvidence?.evidence_quality || "low").toLowerCase();
  const links = (searchEvidence?.sources || [])
    .map((item) => item?.url)
    .filter(Boolean)
    .slice(0, 8);

  const loops = Array.isArray(searchEvidence?.route_hints?.popular_loops)
    ? searchEvidence.route_hints.popular_loops.filter(
        (item) => Array.isArray(item) && item.length > 1,
      )
    : [];
  const keyDestinations = uniqueStops(searchEvidence?.route_hints?.key_destinations || []);

  const primaryStops = loops.length > 0 ? uniqueStops(loops[0]) : keyDestinations;
  if (primaryStops.length < 2) return null;

  const primary = {
    route_id: "search_primary_1",
    title: "搜索证据主路线",
    summary:
      String(searchEvidence?.summary || "").trim() ||
      `基于搜索结果提炼锚点：${primaryStops.join(" → ")}`,
    stops: primaryStops,
    source_platform: "search",
    evidence_quality: quality,
    evidence_links: links,
  };

  const alternatives = [];
  for (const loop of loops.slice(1, 3)) {
    const stops = uniqueStops(loop);
    if (stops.length < 2) continue;
    alternatives.push({
      route_id: `search_alt_loop_${alternatives.length + 1}`,
      title: `搜索证据备选路线${alternatives.length + 1}`,
      summary: "基于搜索证据中不同攻略线索生成。",
      stops,
      source_platform: "search",
      evidence_quality: quality,
      evidence_links: links,
    });
  }

  if (alternatives.length === 0) {
    const reversed = primaryStops.slice().reverse();
    if (reversed.length >= 2) {
      alternatives.push({
        route_id: "search_alt_reverse",
        title: "搜索证据备选路线（反向）",
        summary: "基于同一锚点链路的反向备选，用于节奏对比。",
        stops: reversed,
        source_platform: "search",
        evidence_quality: quality,
        evidence_links: links,
      });
    }
  }

  return {
    ok: true,
    recommended_route: primary,
    alternatives,
    route_options: [primary, ...alternatives].slice(0, 3),
    source_confidence: quality === "high" ? "medium" : "low",
    evidence_summary: String(searchEvidence?.summary || ""),
    evidence_links: links,
  };
}

function buildRouteCandidatesFromInput(tripRequest, platform) {
  const options = Array.isArray(tripRequest.route_options) ? tripRequest.route_options : [];
  const sourceOptions = options.slice(0, 3);
  if (sourceOptions.length === 0) {
    if (platform === "xhs") {
      const fromEvidence = buildXhsCandidatesFromEvidence(tripRequest.route_evidence || {});
      if (fromEvidence) return fromEvidence;
    }
    if (platform === "search") {
      const fromEvidence = buildSearchCandidatesFromEvidence(tripRequest.route_evidence || {});
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
    evidence_summary: "",
    evidence_links: [],
  };
}

/**
 * Route framing entry.
 *
 * Decision strategy:
 * 1) single platform only
 * 2) default platform: xhs
 * 3) when preference=auto, follow xhs -> search
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
 *   requires_platform_evidence: boolean,
 *   required_evidence_platform: string,
 *   planning_note: string,
 * }}
 */
export function selectRouteCandidates(tripRequest) {
  const inferredPreference =
    tripRequest.route_source_preference ||
    tripRequest.route_source_used ||
    tripRequest.route_evidence?.platform ||
    "xhs";
  const preference = normalizePlatform(inferredPreference);
  const policy = String(tripRequest.recommendation_source_policy || "").trim();
  // xhs_first policy: 若无上游证据则需要 agent 先走 xhs 检索链路
  const isXhsFirst = policy === "xhs_first" || preference === "xhs";
  const hasXhsEvidence =
    isXhsFirst &&
    tripRequest.route_evidence != null &&
    Array.isArray(tripRequest.route_evidence?.route_hints?.popular_loops) &&
    tripRequest.route_evidence.route_hints.popular_loops.length > 0;

  if (isXhsFirst && !hasXhsEvidence) {
    // 还没有小红书证据：要求 agent 先走第四步 xhs 检索链路
    return {
      destination_key: "generic",
      recommendation_source: policy || "xhs_first",
      requires_route_evidence: true,
      requires_platform_evidence: true,
      required_evidence_platform: "xhs",
      recommended_route: {},
      alternatives: [],
      rejected_routes: [],
      framing_source: "agent_tools",
      used_platform: "xhs",
      fallback_count: 0,
      fallback_chain: [],
      fallback_reason: "",
      source_reason: "",
      source_confidence: "none",
      evidence_summary: "",
      evidence_links: [],
      route_options: [],
      comparison: [],
      next_action:
        "Fetch Xiaohongshu route evidence first: call @skills/xiaohongshu search-feeds, " +
        "then normalize to RouteEvidenceV1 and persist with save_route_evidence before route planning.",
      planning_note:
        "Xiaohongshu-first policy active. No XHS evidence found. " +
        "Must complete XHS search fallback before route framing can proceed.",
    };
  }

  const fallbackChain = Array.isArray(tripRequest.route_source_fallbacks)
    ? tripRequest.route_source_fallbacks
    : [];
  const usedPlatform = normalizePlatform(
    tripRequest.route_source_used || (preference === "auto" ? "xhs" : preference),
  );
  const candidates = buildRouteCandidatesFromInput(tripRequest, usedPlatform);
  const sourceReason = "";

  return {
    destination_key: "generic",
    recommendation_source: policy || usedPlatform,
    requires_route_evidence: false,
    requires_platform_evidence: false,
    required_evidence_platform: "",
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
    next_action: candidates.ok
      ? ""
      : "Switch to the next platform in fallback chain: xhs -> search.",
    planning_note: "Single-platform route framing. Default xhs; if failed, fallback to search.",
  };
}

runScript({
  name: "route-plan.mjs",
  description: "路线框定决策模块，消费上游证据输出结构化候选路线",
  usage: "node route-plan.mjs --input=<trip_request_json|@file>",
  flags: [{ name: "input", desc: "trip 请求对象 JSON 或 @文件路径" }],
  required: ["input"],
  callerUrl: import.meta.url,
  run(args) {
    const payload = readJsonFromCliValue("input", args.input, undefined);
    console.log(JSON.stringify(selectRouteCandidates(payload), null, 2));
  },
});
