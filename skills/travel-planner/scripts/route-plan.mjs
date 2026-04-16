/** Route framing module (single-platform + fallback metadata). */

import { readJsonFromCliValue, runScript } from "./cli_args.mjs";

function normalizeText(value) {
  return String(value).trim().toLowerCase();
}

function normalizePlatform(value) {
  const text = normalizeText(value);
  if (text === "xhs" || text === "xiaohongshu" || text === "小红书")
    return "xhs";
  if (
    text === "search" ||
    text === "搜索" ||
    text === "search_engine" ||
    text === "搜索引擎"
  )
    return "search";
  if (text === "auto" || !text) return "search";
  return "search";
}

function uniqueStops(input) {
  const seen = new Set();
  const list = [];
  for (const item of input || []) {
    const stop =
      typeof item === "string"
        ? item.trim()
        : item && typeof item === "object"
          ? String(item.name || item.label || item.title || "").trim()
          : String(item || "").trim();
    if (!stop) continue;
    const key = stop.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    list.push(stop);
  }
  return list;
}

function parseStopsFromLoopText(text) {
  const cleaned = String(text || "")
    .replace(/^[^:：]*[：:]/, "")
    .replace(/\s+/g, "");
  if (!cleaned) return [];
  const parts = cleaned
    .split(/->|→|—|-|>/g)
    .map((part) =>
      String(part || "")
        .replace(/[()（）]/g, "")
        .replace(/^[\s,，。；;、|/]+|[\s,，。；;、|/]+$/g, "")
        .trim(),
    )
    .filter(Boolean);
  return uniqueStops(parts);
}

function normalizeLoops(input) {
  const loops = Array.isArray(input) ? input : [];
  const normalized = [];
  for (const loop of loops) {
    if (Array.isArray(loop)) {
      const list = uniqueStops(loop);
      if (list.length >= 2) normalized.push(list);
      continue;
    }
    if (typeof loop === "string") {
      const list = parseStopsFromLoopText(loop);
      if (list.length >= 2) normalized.push(list);
    }
  }
  return normalized;
}

function slugify(text) {
  return String(text || "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function normalizeStopLookupKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
}

function buildStopMediaIndex(tripRequest, route) {
  const index = new Map();
  const addMedia = (key, value) => {
    const normalizedKey = normalizeStopLookupKey(key);
    if (!normalizedKey || !value || typeof value !== "object") return;
    index.set(normalizedKey, value);
  };

  const fromGlobal =
    tripRequest?.stop_media && typeof tripRequest.stop_media === "object"
      ? tripRequest.stop_media
      : {};
  for (const [key, value] of Object.entries(fromGlobal)) {
    addMedia(key, value);
  }

  const fromByRoute =
    tripRequest?.route_stop_media &&
    typeof tripRequest.route_stop_media === "object"
      ? tripRequest.route_stop_media
      : {};
  const routeScoped = fromByRoute?.[route?.route_id];
  if (routeScoped && typeof routeScoped === "object") {
    for (const [key, value] of Object.entries(routeScoped)) {
      addMedia(key, value);
    }
  }

  return index;
}

function resolveStopMedia(stop, stopMediaIndex) {
  const media = stopMediaIndex.get(normalizeStopLookupKey(stop));
  if (!media || typeof media !== "object") return {};
  const imageCandidates = [
    media.image,
    media.picUrl,
    media.mainPic,
    media.image_url,
  ].filter((item) => typeof item === "string" && /^https?:\/\//i.test(item));
  const descriptionCandidates = [
    media.description,
    media.subtitle,
    media.summary,
    media.note,
  ].filter(
    (item) => typeof item === "string" && String(item).trim().length > 0,
  );
  return {
    image: imageCandidates[0] || "",
    subtitle: descriptionCandidates[0] || "",
  };
}

function buildRouteSpotlightItems(route, tripRequest) {
  const stops = uniqueStops(route?.stops || []);
  const summary = String(route?.summary || "").trim();
  const stopMediaIndex = buildStopMediaIndex(tripRequest || {}, route || {});
  return stops.slice(0, 8).map((stop, index) => {
    const media = resolveStopMedia(stop, stopMediaIndex);
    const fallbackSubtitle =
      index === 0
        ? "起点站，建议预留补给与转场缓冲。"
        : index === stops.length - 1
          ? "收尾站，建议预留返程或复盘时间。"
          : summary || "沿线核心停留点，可按体力与天气灵活调整。";
    const item = {
      id: `${slugify(route?.route_id || "route")}-${slugify(stop) || `stop-${index + 1}`}`,
      name: stop,
      subtitle: media.subtitle || fallbackSubtitle,
      ...(media.image ? { image: media.image } : {}),
    };
    return item;
  });
}

function normalizeStopPoint(item) {
  if (!item || typeof item !== "object") return null;
  const lat = Number(item.lat);
  const lng = Number(item.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const label = String(item.label || item.name || "").trim();
  return {
    id: label ? slugify(label) : undefined,
    lat,
    lng,
    label: label || undefined,
    tooltip: "hover",
  };
}

function buildStopPointIndex(tripRequest, route) {
  const index = new Map();
  const addPoint = (key, value) => {
    const normalizedKey = normalizeStopLookupKey(key);
    if (!normalizedKey || !value || typeof value !== "object") return;
    const point = normalizeStopPoint(value);
    if (!point) return;
    index.set(normalizedKey, point);
  };

  const fromGlobal =
    tripRequest?.stop_points && typeof tripRequest.stop_points === "object"
      ? tripRequest.stop_points
      : {};
  for (const [key, value] of Object.entries(fromGlobal)) {
    addPoint(key, value);
  }

  const fromByRoute =
    tripRequest?.route_stop_points &&
    typeof tripRequest.route_stop_points === "object"
      ? tripRequest.route_stop_points
      : {};
  const routeScoped = fromByRoute?.[route?.route_id];
  if (routeScoped && typeof routeScoped === "object") {
    for (const [key, value] of Object.entries(routeScoped)) {
      addPoint(key, value);
    }
  }

  return index;
}

function firstList(payload) {
  if (Array.isArray(payload)) return payload;
  const root = payload && typeof payload === "object" ? payload : {};
  const data = root.data && typeof root.data === "object" ? root.data : {};
  const candidates = [
    data.itemList,
    data.items,
    data.list,
    root.itemList,
    root.items,
    root.list,
    root.results,
    root.pois,
  ];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
  }
  return [];
}

function toNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return NaN;
  const n = Number.parseFloat(value.trim());
  return Number.isFinite(n) ? n : NaN;
}

function firstNonEmptyString(...values) {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const text = value.trim();
    if (text) return text;
  }
  return "";
}

function firstHttpUrl(...values) {
  for (const value of values) {
    const text = firstNonEmptyString(value);
    if (text && /^https?:\/\//i.test(text)) return text;
  }
  return "";
}

function normalizePoiRecord(item) {
  if (!item || typeof item !== "object") return null;
  const name = firstNonEmptyString(
    item.name,
    item.title,
    item.poiName,
    item.poi_name,
  );
  if (!name) return null;

  const image = firstHttpUrl(
    item.mainPic,
    item.picUrl,
    item.image,
    item.imageUrl,
    item.photo,
  );
  const subtitle = firstNonEmptyString(
    item.address,
    item.summary,
    item.desc,
    item.description,
    item.tag,
    item.categoryName,
  );
  const lat = toNumber(item.lat ?? item.latitude ?? item.y);
  const lng = toNumber(item.lng ?? item.longitude ?? item.x);
  const locRaw = firstNonEmptyString(item.location);
  let locationLat = lat;
  let locationLng = lng;
  if (
    (!Number.isFinite(locationLat) || !Number.isFinite(locationLng)) &&
    locRaw.includes(",")
  ) {
    const [locLngRaw, locLatRaw] = locRaw.split(",");
    const parsedLng = toNumber(locLngRaw);
    const parsedLat = toNumber(locLatRaw);
    if (Number.isFinite(parsedLat) && Number.isFinite(parsedLng)) {
      locationLat = parsedLat;
      locationLng = parsedLng;
    }
  }

  return {
    name,
    image,
    subtitle,
    lat: Number.isFinite(locationLat) ? locationLat : undefined,
    lng: Number.isFinite(locationLng) ? locationLng : undefined,
  };
}

function buildPoiIndex(input = {}) {
  const records = [];
  const groups = [
    firstList(input.pois),
    firstList(input.flyai_pois),
    firstList(input.amap_pois),
    Array.isArray(input.items) ? input.items : [],
  ];
  for (const group of groups) {
    for (const item of group) {
      const normalized = normalizePoiRecord(item);
      if (normalized) records.push(normalized);
    }
  }
  const index = new Map();
  for (const record of records) {
    const key = normalizeStopLookupKey(record.name);
    if (!key || index.has(key)) continue;
    index.set(key, record);
  }
  return index;
}

function buildPoiDrivenEnhancements(routeOptions, input) {
  const options = Array.isArray(routeOptions) ? routeOptions : [];
  const poiIndex = buildPoiIndex(input);
  if (poiIndex.size === 0 || options.length === 0) {
    return { route_stop_media: {}, route_stop_points: {} };
  }
  const routeStopMedia = {};
  const routeStopPoints = {};
  for (const route of options) {
    const routeId = String(route?.route_id || "").trim();
    const stops = uniqueStops(route?.stops || []);
    if (!routeId || stops.length === 0) continue;
    const mediaByStop = {};
    const pointsByStop = {};
    for (const stop of stops) {
      const match = poiIndex.get(normalizeStopLookupKey(stop));
      if (!match) continue;
      if (match.image || match.subtitle) {
        mediaByStop[stop] = {
          ...(match.image ? { image: match.image } : {}),
          ...(match.subtitle ? { subtitle: match.subtitle } : {}),
        };
      }
      if (Number.isFinite(match.lat) && Number.isFinite(match.lng)) {
        pointsByStop[stop] = {
          lat: match.lat,
          lng: match.lng,
          label: stop,
        };
      }
    }
    if (Object.keys(mediaByStop).length > 0)
      routeStopMedia[routeId] = mediaByStop;
    if (Object.keys(pointsByStop).length > 0)
      routeStopPoints[routeId] = pointsByStop;
  }
  return {
    route_stop_media: routeStopMedia,
    route_stop_points: routeStopPoints,
  };
}

function enrichTripRequestWithPoiResults(tripRequest, routeOptions) {
  const hasRouteStopMedia =
    tripRequest?.route_stop_media &&
    typeof tripRequest.route_stop_media === "object" &&
    !Array.isArray(tripRequest.route_stop_media);
  const hasRouteStopPoints =
    tripRequest?.route_stop_points &&
    typeof tripRequest.route_stop_points === "object" &&
    !Array.isArray(tripRequest.route_stop_points);
  if (hasRouteStopMedia || hasRouteStopPoints) {
    return tripRequest;
  }
  const enhancements = buildPoiDrivenEnhancements(routeOptions, tripRequest);
  if (
    Object.keys(enhancements.route_stop_media).length === 0 &&
    Object.keys(enhancements.route_stop_points).length === 0
  ) {
    return tripRequest;
  }
  return {
    ...tripRequest,
    route_stop_media: enhancements.route_stop_media,
    route_stop_points: enhancements.route_stop_points,
  };
}

function buildRouteVisualCache(routeOptions, tripRequest) {
  const options = Array.isArray(routeOptions) ? routeOptions : [];
  const routeStopMedia = {};
  const routeStopPoints = {};
  const enrichedOptions = options.map((route) => {
    const routeId = String(route?.route_id || "").trim();
    const stopMediaIndex = buildStopMediaIndex(tripRequest, route);
    const stopPointIndex = buildStopPointIndex(tripRequest, route);
    const stops = uniqueStops(route?.stops || []);
    const stopCards = stops.map((stop) => {
      const media = resolveStopMedia(stop, stopMediaIndex);
      const point = stopPointIndex.get(normalizeStopLookupKey(stop)) || {};
      return {
        name: stop,
        ...(media.image ? { image: media.image } : {}),
        ...(media.subtitle ? { subtitle: media.subtitle } : {}),
        ...(media.sourceUrl ? { source_url: media.sourceUrl } : {}),
        ...(Number.isFinite(point.lat) ? { lat: point.lat } : {}),
        ...(Number.isFinite(point.lng) ? { lng: point.lng } : {}),
      };
    });

    if (routeId) {
      const mediaByStop = {};
      const pointsByStop = {};
      for (const card of stopCards) {
        if (card.image || card.subtitle || card.source_url) {
          mediaByStop[card.name] = {
            ...(card.image ? { image: card.image } : {}),
            ...(card.subtitle ? { subtitle: card.subtitle } : {}),
            ...(card.source_url ? { sourceUrl: card.source_url } : {}),
          };
        }
        if (Number.isFinite(card.lat) && Number.isFinite(card.lng)) {
          pointsByStop[card.name] = {
            lat: card.lat,
            lng: card.lng,
            label: card.name,
          };
        }
      }
      if (Object.keys(mediaByStop).length > 0)
        routeStopMedia[routeId] = mediaByStop;
      if (Object.keys(pointsByStop).length > 0)
        routeStopPoints[routeId] = pointsByStop;
    }

    return {
      ...route,
      stop_cards: stopCards,
    };
  });

  return {
    route_options: enrichedOptions,
    route_stop_media: routeStopMedia,
    route_stop_points: routeStopPoints,
  };
}

function buildRouteToolUi(route, tripRequest) {
  const routeId = String(route?.route_id || "").trim() || "route";
  const title = String(route?.title || "").trim() || `候选路线 ${routeId}`;
  const description = String(route?.summary || "").trim();
  const items = buildRouteSpotlightItems(route, tripRequest);
  const carousel = {
    tool_name: "item_carousel",
    payload: {
      id: `route-carousel-${routeId}`,
      title,
      description,
      items,
    },
  };

  // Step 4 UI: carousel only (coordinates stay on stop_cards when present).
  return {
    route_id: routeId,
    item_carousel: carousel,
  };
}

function buildXhsCandidatesFromEvidence(xhsEvidence) {
  const loops = Array.isArray(xhsEvidence?.route_hints?.popular_loops)
    ? xhsEvidence.route_hints.popular_loops
    : [];
  if (loops.length === 0) return null;
  const quality = String(
    xhsEvidence?.evidence_quality || "medium",
  ).toLowerCase();
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

function buildSearchCandidatesFromEvidence(searchEvidence) {
  const quality = String(
    searchEvidence?.evidence_quality || "low",
  ).toLowerCase();
  const links = (searchEvidence?.sources || [])
    .map((item) => item?.url)
    .filter(Boolean)
    .slice(0, 8);

  const routeHints =
    searchEvidence?.route_hints &&
    typeof searchEvidence.route_hints === "object"
      ? searchEvidence.route_hints
      : searchEvidence;
  const loops = normalizeLoops(routeHints?.popular_loops);
  const keyDestinations = uniqueStops(routeHints?.key_destinations || []);

  const primaryStops =
    loops.length > 0 ? uniqueStops(loops[0]) : keyDestinations;
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
  const options = Array.isArray(tripRequest.route_options)
    ? tripRequest.route_options
    : [];
  const sourceOptions = options.slice(0, 3);
  if (sourceOptions.length === 0) {
    if (platform === "xhs") {
      const xhsEvidence =
        tripRequest.route_evidence || tripRequest.xhs_evidence || {};
      const fromEvidence = buildXhsCandidatesFromEvidence(xhsEvidence);
      if (fromEvidence) return fromEvidence;
    }
    const searchEvidence =
      tripRequest.route_evidence || tripRequest.search_evidence || {};
    const fromEvidence = buildSearchCandidatesFromEvidence(searchEvidence);
    if (fromEvidence) return fromEvidence;
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

function buildRouteToolUiMeta(routeToolUi) {
  const list = Array.isArray(routeToolUi) ? routeToolUi : [];
  const hasAnyCarouselItems = list.some((entry) => {
    const items = entry?.item_carousel?.payload?.items;
    return Array.isArray(items) && items.length > 0;
  });
  if (hasAnyCarouselItems) {
    return { route_tool_ui_ready: true, route_tool_ui_missing_reason: "" };
  }
  return {
    route_tool_ui_ready: false,
    route_tool_ui_missing_reason:
      "No route spotlight cards generated. Provide stops and optional route_stop_media/route_stop_points before rendering item_carousel.",
  };
}

function buildStep4ExecutionHints(routeToolUiMeta) {
  const ready = Boolean(routeToolUiMeta?.route_tool_ui_ready);
  return {
    option_list_allowed: ready,
    step4_tool_call_order: ready
      ? ["item_carousel", "option_list"]
      : [
          "repair_route_ui_inputs",
          "route_plan",
          "item_carousel",
          "option_list",
        ],
    step4_guard_note: ready
      ? "Route UI ready: render item_carousel before option_list."
      : "Route UI not ready: enrich stops/media/points and re-run route-plan before option_list.",
  };
}

/**
 * Route framing entry.
 *
 * Decision strategy:
 * 1) single platform only
 * 2) default platform: search
 * 3) when preference=auto, follow search by default; only use xhs when explicitly selected
 *
 * @param {object} tripRequest
 * @returns {{
 *   route_options: object[],
 *   route_tool_ui: object[],
 *   route_tool_ui_ready: boolean,
 *   route_tool_ui_missing_reason: string,
 *   option_list_allowed: boolean,
 *   step4_tool_call_order: string[],
 *   step4_guard_note: string,
 *   comparison: object[],
 *   next_action: string,
 *   planning_note: string,
 * }}
 */
export function selectRouteCandidates(tripRequest) {
  const inferredPreference =
    tripRequest.route_source_preference ||
    tripRequest.route_source_used ||
    tripRequest.route_evidence?.platform ||
    "search";
  const preference = normalizePlatform(inferredPreference);
  // Only explicit xhs selection should trigger the xhs evidence gate.
  const isXhsFirst = preference === "xhs";
  const xhsEvidenceSource =
    tripRequest.route_evidence || tripRequest.xhs_evidence || {};
  const hasXhsEvidence =
    isXhsFirst &&
    normalizeLoops(xhsEvidenceSource?.route_hints?.popular_loops).length > 0;

  if (isXhsFirst && !hasXhsEvidence) {
    // 还没有小红书证据：要求 agent 先走第四步 xhs 检索链路
    return {
      route_options: [],
      route_tool_ui: [],
      route_tool_ui_ready: false,
      route_tool_ui_missing_reason:
        "Xiaohongshu-first policy active but no XHS evidence found.",
      option_list_allowed: false,
      step4_tool_call_order: [
        "fetch_xhs_route_evidence",
        "route_plan",
        "item_carousel",
        "option_list",
      ],
      step4_guard_note:
        "XHS evidence required first. Run save_route_evidence(xhs) before route-plan.",
      comparison: [],
      next_action:
        "Fetch Xiaohongshu route evidence first: call @skills/xiaohongshu search-feeds, " +
        "then normalize to RouteEvidenceV1 and persist with save_route_evidence before route planning.",
      planning_note:
        "Xiaohongshu-first policy active. No XHS evidence found. " +
        "Must complete XHS search fallback before route framing can proceed.",
    };
  }

  const usedPlatform = normalizePlatform(
    tripRequest.route_source_used ||
      (preference === "auto" ? "search" : preference),
  );
  const candidates = buildRouteCandidatesFromInput(tripRequest, usedPlatform);
  const enrichedTripRequest = enrichTripRequestWithPoiResults(
    tripRequest,
    candidates.route_options,
  );
  const visualCache = buildRouteVisualCache(
    candidates.route_options,
    enrichedTripRequest,
  );
  const enrichedRouteOptions = visualCache.route_options.map((option) => {
    const { evidence_links: _omit, ...rest } = option && typeof option === "object" ? option : {};
    return rest;
  });
  const routeToolUi = enrichedRouteOptions.map((route) =>
    buildRouteToolUi(route, enrichedTripRequest),
  );
  const routeToolUiMeta = buildRouteToolUiMeta(routeToolUi);
  const step4Hints = buildStep4ExecutionHints(routeToolUiMeta);

  return {
    route_options: enrichedRouteOptions,
    route_tool_ui: routeToolUi,
    route_tool_ui_ready: routeToolUiMeta.route_tool_ui_ready,
    route_tool_ui_missing_reason: routeToolUiMeta.route_tool_ui_missing_reason,
    option_list_allowed: step4Hints.option_list_allowed,
    step4_tool_call_order: step4Hints.step4_tool_call_order,
    step4_guard_note: step4Hints.step4_guard_note,
    comparison: enrichedRouteOptions.map((option, index) => ({
      route_id: option.route_id,
      rank: index + 1,
      fit_reason:
        index === 0
          ? "Primary recommendation from selected platform."
          : "Backup option.",
      risk_note: "Verify transport and hotel feasibility before booking.",
    })),
    next_action: candidates.ok
      ? step4Hints.option_list_allowed
        ? ""
        : "Route UI not ready. Enrich stops/media/points and re-run route-plan before option_list."
      : "Switch to the next platform in fallback chain if the user explicitly approves it.",
    planning_note:
      "Single-platform route framing. Default search; use xhs only when the user explicitly selects it.",
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
