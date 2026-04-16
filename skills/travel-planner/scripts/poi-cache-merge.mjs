import { readJsonFromCliValue, runScript } from "./cli_args.mjs";

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function toNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return NaN;
  const parsed = Number.parseFloat(value.trim());
  return Number.isFinite(parsed) ? parsed : NaN;
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

function buildCacheKey(destinationText, stopName, provider = "flyai") {
  const destination = normalizeText(destinationText || "unknown");
  const stop = normalizeText(stopName);
  const source = normalizeText(provider || "flyai");
  return `${destination}|${stop}|${source}`;
}

function normalizePoiRecord(item) {
  if (!item || typeof item !== "object") return null;
  const name = firstNonEmptyString(item.name, item.title, item.poiName, item.poi_name);
  if (!name) return null;
  const image = firstHttpUrl(item.mainPic, item.picUrl, item.image, item.imageUrl, item.photo);
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
  return {
    name,
    image,
    subtitle,
    ...(Number.isFinite(lat) ? { lat } : {}),
    ...(Number.isFinite(lng) ? { lng } : {}),
    raw: item,
  };
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

function buildPoiIndex(input) {
  const index = new Map();
  const pois = []
    .concat(firstList(input.flyai_pois))
    .concat(firstList(input.amap_pois))
    .concat(firstList(input.pois));
  for (const item of pois) {
    const normalized = normalizePoiRecord(item);
    if (!normalized) continue;
    const key = normalizeText(normalized.name);
    if (!key || index.has(key)) continue;
    index.set(key, normalized);
  }
  return index;
}

function dedupeStops(routeOptions) {
  const seen = new Set();
  const list = [];
  for (const route of routeOptions) {
    const stops = Array.isArray(route?.stops) ? route.stops : [];
    for (const stop of stops) {
      const label = String(stop || "").trim();
      if (!label) continue;
      const key = normalizeText(label);
      if (seen.has(key)) continue;
      seen.add(key);
      list.push(label);
    }
  }
  return list;
}

export function mergePoiCacheAndResults(input = {}) {
  const destinationText = String(input.destination_text || input.destination || "").trim();
  const routeOptions = Array.isArray(input.route_options) ? input.route_options : [];
  const cacheEntries = input.cache_entries && typeof input.cache_entries === "object" ? input.cache_entries : {};
  const provider = String(input.provider || "flyai");
  const poiIndex = buildPoiIndex(input);
  const stops = dedupeStops(routeOptions);
  const misses = [];
  const cacheUpserts = {};
  const mediaByStop = {};
  const pointsByStop = {};

  for (const stop of stops) {
    const stopKey = normalizeText(stop);
    const cacheKey = buildCacheKey(destinationText, stop, provider);
    const cached = cacheEntries[cacheKey];
    let record = null;
    if (cached && typeof cached === "object" && (cached.image || cached.subtitle)) {
      record = {
        name: stop,
        image: String(cached.image || ""),
        subtitle: String(cached.subtitle || ""),
        lat: toNumber(cached.lat),
        lng: toNumber(cached.lng),
      };
    } else if (poiIndex.has(stopKey)) {
      const found = poiIndex.get(stopKey);
      record = { ...found, name: stop };
      cacheUpserts[cacheKey] = {
        key: cacheKey,
        destination_text: destinationText,
        provider,
        name: stop,
        image: found.image || "",
        subtitle: found.subtitle || "",
        ...(Number.isFinite(found.lat) ? { lat: found.lat } : {}),
        ...(Number.isFinite(found.lng) ? { lng: found.lng } : {}),
        raw: found.raw || {},
      };
    } else {
      misses.push({
        stop,
        cache_key: cacheKey,
        provider,
      });
    }

    if (!record) continue;
    if (record.image || record.subtitle) {
      mediaByStop[stop] = {
        ...(record.image ? { image: record.image } : {}),
        ...(record.subtitle ? { subtitle: record.subtitle } : {}),
      };
    }
    if (Number.isFinite(record.lat) && Number.isFinite(record.lng)) {
      pointsByStop[stop] = {
        lat: record.lat,
        lng: record.lng,
        label: stop,
      };
    }
  }

  const routeStopMedia = {};
  const routeStopPoints = {};
  for (const route of routeOptions) {
    const routeId = String(route?.route_id || "").trim();
    if (!routeId) continue;
    const stopsInRoute = Array.isArray(route?.stops) ? route.stops : [];
    const media = {};
    const points = {};
    for (const stop of stopsInRoute) {
      const label = String(stop || "").trim();
      if (!label) continue;
      if (mediaByStop[label]) media[label] = mediaByStop[label];
      if (pointsByStop[label]) points[label] = pointsByStop[label];
    }
    if (Object.keys(media).length > 0) routeStopMedia[routeId] = media;
    if (Object.keys(points).length > 0) routeStopPoints[routeId] = points;
  }

  return {
    destination_text: destinationText,
    route_options_count: routeOptions.length,
    stop_count: stops.length,
    cache_hit_count: Object.keys(mediaByStop).length - Object.keys(cacheUpserts).length,
    fresh_match_count: Object.keys(cacheUpserts).length,
    miss_count: misses.length,
    misses,
    cache_upserts: cacheUpserts,
    route_stop_media: routeStopMedia,
    route_stop_points: routeStopPoints,
  };
}

runScript({
  name: "poi-cache-merge.mjs",
  description:
    "优先使用 POI 缓存，缺失再合并 flyai/amap 结果，输出 route_stop_media 与 route_stop_points",
  usage: "node poi-cache-merge.mjs --input=<json|@file>",
  flags: [
    {
      name: "input",
      desc: "{ destination_text, route_options, cache_entries, flyai_pois?, amap_pois? }",
    },
  ],
  required: ["input"],
  callerUrl: import.meta.url,
  run(args) {
    const payload = readJsonFromCliValue("input", args.input, undefined);
    console.log(JSON.stringify(mergePoiCacheAndResults(payload), null, 2));
  },
});
