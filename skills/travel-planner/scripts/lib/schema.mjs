import { isPlainObject } from "./json.mjs";
import { isStage } from "./contracts.mjs";

export function validateTrip(obj) {
  const reasons = [];
  if (!isPlainObject(obj)) reasons.push("trip must be an object");
  else {
    if (!obj.id || String(obj.id).trim() === "") reasons.push("trip.id required");
    if (!isStage(obj.stage)) reasons.push(`trip.stage invalid: ${String(obj.stage || "")}`);
    if (!obj.created_at) reasons.push("trip.created_at required");
    if (!obj.updated_at) reasons.push("trip.updated_at required");
    if (typeof obj.bookings_confirmed !== "boolean")
      reasons.push("trip.bookings_confirmed must be boolean");
  }
  return { ok: reasons.length === 0, reasons };
}

export function validatePreferences(obj) {
  const reasons = [];
  if (!isPlainObject(obj)) reasons.push("preferences must be an object");
  return { ok: reasons.length === 0, reasons };
}

export function validateRoutePlan(obj) {
  const reasons = [];
  if (!isPlainObject(obj)) reasons.push("route-plan must be an object");
  else {
    const opts = obj.route_options;
    if (!Array.isArray(opts) || opts.length < 2) reasons.push("route_options must have >= 2 items");
    else {
      const routeIds = new Set();
      for (let i = 0; i < opts.length; i += 1) {
        const route = opts[i];
        const prefix = `route_options[${i}]`;
        if (!isPlainObject(route)) {
          reasons.push(`${prefix} must be an object`);
          continue;
        }
        const routeId = String(route.route_id || "").trim();
        if (!routeId) reasons.push(`${prefix}.route_id required`);
        else if (routeIds.has(routeId)) reasons.push(`${prefix}.route_id must be unique`);
        else routeIds.add(routeId);
        if (!String(route.title || "").trim()) reasons.push(`${prefix}.title required`);
        if (!String(route.summary || "").trim()) reasons.push(`${prefix}.summary required`);

        const stops = route.stop_points;
        if (!Array.isArray(stops) || stops.length < 2) {
          reasons.push(`${prefix}.stop_points[] required (>=2 items)`);
          continue;
        }
        for (let j = 0; j < stops.length; j += 1) {
          const stop = stops[j];
          const stopPrefix = `${prefix}.stop_points[${j}]`;
          if (!isPlainObject(stop)) {
            reasons.push(`${stopPrefix} must be an object`);
            continue;
          }
          if (!String(stop.name || "").trim()) reasons.push(`${stopPrefix}.name required`);
          if (!String(stop.poi_id || "").trim()) reasons.push(`${stopPrefix}.poi_id required`);
          if ("image" in stop && stop.image != null && String(stop.image).trim() === "") {
            reasons.push(`${stopPrefix}.image must be a non-empty string when provided`);
          }
          if ("detail_url" in stop && stop.detail_url != null && String(stop.detail_url).trim() === "") {
            reasons.push(`${stopPrefix}.detail_url must be a non-empty string when provided`);
          }
          const lat = Number(stop.lat);
          const lng = Number(stop.lng);
          if (!Number.isFinite(lat) || lat < -90 || lat > 90)
            reasons.push(`${stopPrefix}.lat invalid`);
          if (!Number.isFinite(lng) || lng < -180 || lng > 180)
            reasons.push(`${stopPrefix}.lng invalid`);
        }
      }
    }
  }
  return { ok: reasons.length === 0, reasons };
}

export function validateRouteEvidence(obj) {
  const reasons = [];
  if (!isPlainObject(obj)) reasons.push("route-evidence must be an object");
  else {
    const platform = String(obj.platform || "").trim();
    if (!platform) reasons.push("platform required (e.g. search|xhs)");
    const version = String(obj.evidence_version || "").trim();
    if (version !== "v2") reasons.push('evidence_version must be "v2"');
    const destination = String(obj.destination || "").trim();
    if (!destination) reasons.push("destination required");
    const durationDays = Number(obj.duration_days);
    if (!Number.isInteger(durationDays) || durationDays <= 0)
      reasons.push("duration_days must be a positive integer");
    const verification = String(obj.verification_status || "").trim();
    if (!verification) reasons.push("verification_status required");
    const generatedAt = String(obj.generated_at || "").trim();
    if (!generatedAt) reasons.push("generated_at required (ISO string)");
    const sources = obj.sources;
    if (!Array.isArray(sources) || sources.length === 0)
      reasons.push("sources[] required (non-empty)");
    const routes = obj.routes;
    if (!Array.isArray(routes) || routes.length < 2 || routes.length > 3) {
      reasons.push("routes[] required (2-3 items)");
    } else {
      const routeIds = new Set();
      for (let i = 0; i < routes.length; i += 1) {
        const route = routes[i];
        const prefix = `routes[${i}]`;
        if (!isPlainObject(route)) {
          reasons.push(`${prefix} must be an object`);
          continue;
        }
        const routeId = String(route.route_id || "").trim();
        if (!routeId) reasons.push(`${prefix}.route_id required`);
        else if (routeIds.has(routeId)) reasons.push(`${prefix}.route_id must be unique`);
        else routeIds.add(routeId);
        if (!String(route.title || "").trim()) reasons.push(`${prefix}.title required`);
        if (!String(route.summary || "").trim()) reasons.push(`${prefix}.summary required`);

        const stops = route.stops;
        if (!Array.isArray(stops) || stops.length < 2) {
          reasons.push(`${prefix}.stops[] required (>=2 items)`);
          continue;
        }
        let previousDay = 0;
        for (let j = 0; j < stops.length; j += 1) {
          const stop = stops[j];
          const stopPrefix = `${prefix}.stops[${j}]`;
          if (!isPlainObject(stop)) {
            reasons.push(`${stopPrefix} must be an object`);
            continue;
          }
          const stopName = String(stop.name || "").trim();
          if (!stopName) reasons.push(`${stopPrefix}.name required`);
          if ("detail_url" in stop && stop.detail_url != null && String(stop.detail_url).trim() === "") {
            reasons.push(`${stopPrefix}.detail_url must be a non-empty string when provided`);
          }

          const day = Number(stop.day);
          if (!Number.isInteger(day) || day <= 0) {
            reasons.push(`${stopPrefix}.day must be a positive integer`);
          } else {
            if (day > durationDays) reasons.push(`${stopPrefix}.day exceeds duration_days`);
            if (day < previousDay) reasons.push(`${stopPrefix}.day must be non-decreasing`);
            previousDay = day;
          }
        }
      }
    }
  }
  return { ok: reasons.length === 0, reasons };
}

export function validateRouteValidation(obj) {
  const reasons = [];
  if (!isPlainObject(obj)) reasons.push("route-validation must be an object");
  else {
    if (!String(obj.trip_id || "").trim()) reasons.push("trip_id required");
    if (!String(obj.chosen_route_id || "").trim()) reasons.push("chosen_route_id required");
    const verdict = String(obj.verdict || "").trim();
    if (!["go", "caution", "block"].includes(verdict))
      reasons.push("verdict must be one of go|caution|block");

    const transport = obj.transport_result;
    if (!isPlainObject(transport)) {
      reasons.push("transport_result must be an object");
    } else {
      const status = String(transport.status || "").trim();
      if (!["ok", "unavailable", "not_required"].includes(status)) {
        reasons.push("transport_result.status must be one of ok|unavailable|not_required");
      }
      const mode = String(transport.mode || "").trim();
      if (!["flight", "train", "drive", "mixed", "unknown"].includes(mode)) {
        reasons.push("transport_result.mode must be one of flight|train|drive|mixed|unknown");
      }
      if ("summary" in transport && transport.summary != null && String(transport.summary).trim() === "") {
        reasons.push("transport_result.summary must be a non-empty string when provided");
      }
      const links = transport.booking_links;
      if (!Array.isArray(links)) {
        reasons.push("transport_result.booking_links must be an array");
      } else {
        for (let i = 0; i < links.length; i += 1) {
          const v = links[i];
          const prefix = `transport_result.booking_links[${i}]`;
          if (!isPlainObject(v)) {
            reasons.push(`${prefix} must be an object`);
            continue;
          }
          if (!String(v.label || "").trim()) reasons.push(`${prefix}.label required`);
          const url = String(v.url || "").trim();
          if (!url) reasons.push(`${prefix}.url required`);
          else if (!/^https?:\/\//i.test(url)) reasons.push(`${prefix}.url must be http(s)`);
          if ("price" in v && v.price != null && String(v.price).trim() === "") {
            reasons.push(`${prefix}.price must be a non-empty string when provided`);
          }
        }
      }
      if (status === "ok" && Array.isArray(links) && links.length === 0) {
        reasons.push("transport_result.booking_links must be non-empty when status=ok");
      }
    }

    const weather = obj.weather_result;
    if (!isPlainObject(weather)) {
      reasons.push("weather_result must be an object");
    } else {
      const status = String(weather.status || "").trim();
      if (!["go", "caution", "block", "unavailable"].includes(status)) {
        reasons.push("weather_result.status must be one of go|caution|block|unavailable");
      }
      if ("summary" in weather && weather.summary != null && String(weather.summary).trim() === "") {
        reasons.push("weather_result.summary must be a non-empty string when provided");
      }
    }
  }
  return { ok: reasons.length === 0, reasons };
}

export function validatePoiCache(obj) {
  const reasons = [];
  if (!isPlainObject(obj)) {
    reasons.push("poi-cache must be an object");
    return { ok: false, reasons };
  }
  const source = String(obj.source || "").trim();
  if (source !== "amap-lbs-skill") reasons.push('poi-cache.source must be "amap-lbs-skill"');
  const entries = obj.entries;
  if (!Array.isArray(entries)) reasons.push("poi-cache.entries must be an array");
  else {
    const seenPoiIds = new Set();
    for (let i = 0; i < entries.length; i += 1) {
      const v = entries[i];
      const prefix = `entries[${i}]`;
      if (!isPlainObject(v)) {
        reasons.push(`${prefix} must be an object`);
        continue;
      }
      const poiId = String(v.poi_id || "").trim();
      if (!poiId) reasons.push(`${prefix}.poi_id required`);
      else if (seenPoiIds.has(poiId)) reasons.push(`${prefix}.poi_id must be unique`);
      else seenPoiIds.add(poiId);
      const lat = Number(v.lat);
      const lng = Number(v.lng);
      if (!Number.isFinite(lat) || lat < -90 || lat > 90) reasons.push(`${prefix}.lat invalid`);
      if (!Number.isFinite(lng) || lng < -180 || lng > 180) reasons.push(`${prefix}.lng invalid`);
      if (!String(v.name || "").trim()) reasons.push(`${prefix}.name required`);
      if (!String(v.resolved_at || "").trim()) reasons.push(`${prefix}.resolved_at required`);
      const image = String(v.image || "").trim();
      if (!image) reasons.push(`${prefix}.image required (must be a non-empty string)`);
      if ("detail_url" in v && v.detail_url != null && String(v.detail_url).trim() === "") {
        reasons.push(`${prefix}.detail_url must be a non-empty string when provided`);
      }
    }
  }
  return { ok: reasons.length === 0, reasons };
}

