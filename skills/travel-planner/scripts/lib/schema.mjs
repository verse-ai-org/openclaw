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
    if (!Array.isArray(opts) || opts.length !== 1) reasons.push("route_options must have exactly 1 item");
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

    const transport = obj.transport;
    if (!isPlainObject(transport)) {
      reasons.push("transport must be an object");
    } else {
      const status = String(transport.status || "").trim();
      if (!["ok", "unavailable", "not_required"].includes(status)) {
        reasons.push("transport.status must be one of ok|unavailable|not_required");
      }
      const mode = String(transport.mode || "").trim();
      if (!["flight", "train", "drive", "mixed", "unknown"].includes(mode)) {
        reasons.push("transport.mode must be one of flight|train|drive|mixed|unknown");
      }
      if ("summary" in transport && transport.summary != null && String(transport.summary).trim() === "") {
        reasons.push("transport.summary must be a non-empty string when provided");
      }
      const links = transport.booking_links;
      if (!Array.isArray(links)) {
        reasons.push("transport.booking_links must be an array");
      } else {
        for (let i = 0; i < links.length; i += 1) {
          const v = links[i];
          const prefix = `transport.booking_links[${i}]`;
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
        reasons.push("transport.booking_links must be non-empty when status=ok");
      }
    }

    const weather = obj.weather;
    if (!isPlainObject(weather)) {
      reasons.push("weather must be an object");
    } else {
      const status = String(weather.status || "").trim();
      if (!["go", "caution", "block", "unavailable"].includes(status)) {
        reasons.push("weather.status must be one of go|caution|block|unavailable");
      }
      if ("summary" in weather && weather.summary != null && String(weather.summary).trim() === "") {
        reasons.push("weather.summary must be a non-empty string when provided");
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
  const ctx = String(obj.context_key || "").trim();
  if (!ctx) reasons.push("poi-cache.context_key required (destination or adcode scope for global POI index)");
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
      if (!String(v.query_name || "").trim()) reasons.push(`${prefix}.query_name required`);
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

/** Step 2 preview: same POI entry shape as poi-cache (including non-empty image); not used by save_route_plan gate. */
export function validatePoiPreview(obj) {
  const reasons = [];
  if (!isPlainObject(obj)) {
    reasons.push("poi-preview must be an object");
    return { ok: false, reasons };
  }
  const ctx = String(obj.context_key || "").trim();
  if (!ctx) reasons.push("poi-preview.context_key required (same semantics as poi-cache)");
  const source = String(obj.source || "").trim();
  if (source !== "amap-lbs-skill") reasons.push('poi-preview.source must be "amap-lbs-skill"');
  const entries = obj.entries;
  if (!Array.isArray(entries)) reasons.push("poi-preview.entries must be an array");
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
      if (!String(v.query_name || "").trim()) reasons.push(`${prefix}.query_name required`);
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

/**
 * Step 5 deliverable: user-facing full itinerary (`plan-details.json`).
 * See `references/plan-details.md` and `examples/plan-details.template.json`.
 */
export function validatePlanDetails(obj) {
  const reasons = [];
  if (!isPlainObject(obj)) {
    reasons.push("plan-details must be an object");
    return { ok: false, reasons };
  }

  const ver = Number(obj.schema_version);
  if (ver !== 1) reasons.push("schema_version must be 1");

  if (!String(obj.generated_at || "").trim()) reasons.push("generated_at required (ISO-8601)");

  const dest = obj.destination;
  if (!isPlainObject(dest)) {
    reasons.push("destination must be an object");
  } else {
    if (!String(dest.summary || "").trim()) reasons.push("destination.summary required");
    if (!String(dest.geography || "").trim()) reasons.push("destination.geography required");
    if (!String(dest.culture_and_customs || "").trim()) reasons.push("destination.culture_and_customs required");
  }

  const transport = obj.transport;
  if (!isPlainObject(transport)) {
    reasons.push("transport must be an object");
  } else {
    if (!String(transport.outbound || "").trim()) reasons.push("transport.outbound required");
    if (!String(transport.return || "").trim()) reasons.push("transport.return required");
    if ("notes" in transport && transport.notes != null && String(transport.notes).trim() === "") {
      reasons.push("transport.notes must be non-empty when provided");
    }
  }

  const weather = obj.weather;
  if (!isPlainObject(weather)) {
    reasons.push("weather must be an object");
  } else {
    if (!String(weather.summary || "").trim()) reasons.push("weather.summary required");
    if ("by_stop" in weather && weather.by_stop != null) {
      if (!Array.isArray(weather.by_stop)) reasons.push("weather.by_stop must be an array when provided");
      else {
        for (let i = 0; i < weather.by_stop.length; i += 1) {
          const row = weather.by_stop[i];
          const p = `weather.by_stop[${i}]`;
          if (!isPlainObject(row)) {
            reasons.push(`${p} must be an object`);
            continue;
          }
          if (!String(row.label || "").trim()) reasons.push(`${p}.label required`);
          if (!String(row.summary || "").trim()) reasons.push(`${p}.summary required`);
        }
      }
    }
  }

  const days = obj.days;
  if (!Array.isArray(days) || days.length === 0) {
    reasons.push("days[] required (>=1 item)");
  } else {
    for (let i = 0; i < days.length; i += 1) {
      const d = days[i];
      const p = `days[${i}]`;
      if (!isPlainObject(d)) {
        reasons.push(`${p} must be an object`);
        continue;
      }
      const di = Number(d.day_index);
      if (!Number.isInteger(di) || di < 1) reasons.push(`${p}.day_index must be a positive integer`);
      if (!String(d.title || "").trim()) reasons.push(`${p}.title required`);
      if (!String(d.summary || "").trim()) reasons.push(`${p}.summary required`);
      for (const slot of ["morning", "afternoon", "evening", "risks_or_notes"]) {
        if (slot in d && d[slot] != null && String(d[slot]).trim() === "") {
          reasons.push(`${p}.${slot} must be non-empty when provided`);
        }
      }
    }
  }

  const checklist = obj.pre_departure_checklist;
  if (!isPlainObject(checklist)) {
    reasons.push("pre_departure_checklist must be an object");
  } else {
    const items = checklist.items;
    if (!Array.isArray(items) || items.length === 0) {
      reasons.push("pre_departure_checklist.items[] required (>=1 item)");
    } else {
      for (let i = 0; i < items.length; i += 1) {
        const it = items[i];
        const p = `pre_departure_checklist.items[${i}]`;
        if (!isPlainObject(it)) {
          reasons.push(`${p} must be an object`);
          continue;
        }
        if (!String(it.label || "").trim()) reasons.push(`${p}.label required`);
        if ("done" in it && it.done != null && typeof it.done !== "boolean") {
          reasons.push(`${p}.done must be boolean when provided`);
        }
      }
    }
  }

  const etiquette = obj.etiquette_and_culture;
  if (!isPlainObject(etiquette)) {
    reasons.push("etiquette_and_culture must be an object");
  } else {
    if (!String(etiquette.summary || "").trim()) reasons.push("etiquette_and_culture.summary required");
    if ("bullets" in etiquette && etiquette.bullets != null) {
      if (!Array.isArray(etiquette.bullets)) reasons.push("etiquette_and_culture.bullets must be an array when provided");
      else {
        for (let i = 0; i < etiquette.bullets.length; i += 1) {
          if (String(etiquette.bullets[i] || "").trim() === "") {
            reasons.push(`etiquette_and_culture.bullets[${i}] must be non-empty`);
          }
        }
      }
    }
  }

  const safety = obj.safety_and_emergency;
  if (!isPlainObject(safety)) {
    reasons.push("safety_and_emergency must be an object");
  } else {
    if (!String(safety.summary || "").trim()) reasons.push("safety_and_emergency.summary required");
    if ("emergency_numbers_note" in safety && safety.emergency_numbers_note != null && String(safety.emergency_numbers_note).trim() === "") {
      reasons.push("safety_and_emergency.emergency_numbers_note must be non-empty when provided");
    }
    if ("bullets" in safety && safety.bullets != null) {
      if (!Array.isArray(safety.bullets)) reasons.push("safety_and_emergency.bullets must be an array when provided");
      else {
        for (let i = 0; i < safety.bullets.length; i += 1) {
          if (String(safety.bullets[i] || "").trim() === "") {
            reasons.push(`safety_and_emergency.bullets[${i}] must be non-empty`);
          }
        }
      }
    }
  }

  const geo = obj.geo;
  if (!isPlainObject(geo)) {
    reasons.push("geo must be an object");
  } else {
    if (!String(geo.text_fallback_route || "").trim()) reasons.push("geo.text_fallback_route required");
    if ("points" in geo && geo.points != null && !Array.isArray(geo.points)) {
      reasons.push("geo.points must be an array when provided");
    }
    if ("legs" in geo && geo.legs != null && !Array.isArray(geo.legs)) {
      reasons.push("geo.legs must be an array when provided");
    }
  }

  if ("trip_id" in obj && obj.trip_id != null && String(obj.trip_id).trim() === "") {
    reasons.push("trip_id must be non-empty when provided");
  }
  if ("chosen_route_id" in obj && obj.chosen_route_id != null && String(obj.chosen_route_id).trim() === "") {
    reasons.push("chosen_route_id must be non-empty when provided");
  }

  return { ok: reasons.length === 0, reasons };
}
