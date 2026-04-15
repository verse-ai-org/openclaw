import { readJsonFromCliValue, runScript } from "./cli_args.mjs";

function normalizeKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
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

  // AMap POI sometimes returns "location" as "lng,lat".
  const locRaw = firstNonEmptyString(item.location);
  let locationLat = lat;
  let locationLng = lng;
  if ((!Number.isFinite(locationLat) || !Number.isFinite(locationLng)) && locRaw.includes(",")) {
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
    const key = normalizeKey(record.name);
    if (!key || index.has(key)) continue;
    index.set(key, record);
  }
  return index;
}

function attachByStops(routeOptions, poiIndex) {
  const routeStopMedia = {};
  const routeStopPoints = {};

  for (const route of routeOptions) {
    const routeId = String(route?.route_id || "").trim();
    const stops = Array.isArray(route?.stops) ? route.stops : [];
    if (!routeId || stops.length === 0) continue;

    const mediaByStop = {};
    const pointsByStop = {};

    for (const stop of stops) {
      const stopLabel = String(stop || "").trim();
      if (!stopLabel) continue;
      const match = poiIndex.get(normalizeKey(stopLabel));
      if (!match) continue;

      if (match.image || match.subtitle) {
        mediaByStop[stopLabel] = {
          ...(match.image ? { image: match.image } : {}),
          ...(match.subtitle ? { subtitle: match.subtitle } : {}),
        };
      }
      if (Number.isFinite(match.lat) && Number.isFinite(match.lng)) {
        pointsByStop[stopLabel] = {
          lat: match.lat,
          lng: match.lng,
          label: stopLabel,
        };
      }
    }

    if (Object.keys(mediaByStop).length > 0) routeStopMedia[routeId] = mediaByStop;
    if (Object.keys(pointsByStop).length > 0) routeStopPoints[routeId] = pointsByStop;
  }

  return { route_stop_media: routeStopMedia, route_stop_points: routeStopPoints };
}

export function buildRouteUiEnrichment(input = {}) {
  const routeOptions = Array.isArray(input.route_options) ? input.route_options : [];
  const poiIndex = buildPoiIndex(input);
  const attached = attachByStops(routeOptions, poiIndex);
  return {
    route_options_count: routeOptions.length,
    matched_poi_count: poiIndex.size,
    ...attached,
  };
}

runScript({
  name: "route-ui-enrichment.mjs",
  description: "将 flyai/amap POI 结果适配为 route-plan 可消费的图文与坐标增强输入",
  usage: "node route-ui-enrichment.mjs --input=<json|@file>",
  flags: [
    {
      name: "input",
      desc: "{ route_options, pois|flyai_pois|amap_pois } JSON 或 @文件路径",
    },
  ],
  required: ["input"],
  callerUrl: import.meta.url,
  run(args) {
    const payload = readJsonFromCliValue("input", args.input, undefined);
    console.log(JSON.stringify(buildRouteUiEnrichment(payload), null, 2));
  },
});
