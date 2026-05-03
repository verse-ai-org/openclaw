import fs from "node:fs";

import { parseArgs, requireFlag, optionalFlag, okJson, failJson } from "./lib/cli.mjs";
import { readMaybeJsonFromCliValue } from "./lib/json.mjs";
import { ARTIFACTS } from "./lib/contracts.mjs";
import { readArtifact, writeArtifact } from "./lib/artifacts.mjs";
import { validatePoiCache, validatePoiPreview } from "./lib/schema.mjs";
import { appendTripEvent } from "./lib/events.mjs";
import { tripDir } from "./lib/paths.mjs";
import { readJsonFile } from "./lib/json.mjs";
import {
  upsertPoiStoreFromPayloadEntries,
  readPoiStoreEntry,
  resolveQueryToPoiEntry,
  poiStoreStats,
} from "./lib/poi-store.mjs";

function tripFile(tripId) {
  return `${tripDir(tripId)}/trip.json`;
}

function tripExists(tripId) {
  return fs.existsSync(tripFile(tripId));
}

function loadTrip(tripId) {
  if (!tripExists(tripId)) return null;
  return readJsonFile(tripFile(tripId));
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const cmd = String(args.cmd || "").trim();
  try {
    if (!cmd || cmd === "help") {
      okJson({
        commands: [
          "save_cache",
          "save_preview",
          "get_cache",
          "doctor",
          "ingest",
          "get_entry",
          "resolve",
          "doctor_store",
        ],
        contract: {
          source: 'POI data must come from amap-lbs-skill (poi-cache.source="amap-lbs-skill").',
          traceability: "Store required amap-lbs-skill fields directly in poi-cache.entries[*].raw.",
          preview:
            "poi-preview is Step 2 UI + global store upsert; entries require non-empty image URL (same as poi-cache entries); save_route_plan uses poi-cache only.",
          context_key:
            "Required on poi-cache/poi-preview root (and optional per-entry): geographic scope for global POI index (e.g. route-evidence.destination). save_cache/save_preview upsert data/poi/ before writing trip files.",
          global_store: "data/poi/entries/*.json + data/poi/query-index.json under TRAVEL_PLANNER_DB_DIR.",
        },
      });
      return;
    }

    if (cmd === "ingest") {
      const payloadRaw = requireFlag(args, "payload");
      const parsed = readMaybeJsonFromCliValue(payloadRaw);
      if (!parsed.ok) return failJson(`invalid payload: ${parsed.error}`);
      const data = parsed.data;
      let entries;
      let defaultContextKey = optionalFlag(args, "context-key", "");
      if (Array.isArray(data)) {
        entries = data;
      } else if (data && typeof data === "object" && Array.isArray(data.entries)) {
        entries = data.entries;
        if (!defaultContextKey) defaultContextKey = String(data.context_key || "").trim();
      } else if (data && typeof data === "object" && String(data.poi_id || "").trim()) {
        entries = [data];
        if (!defaultContextKey) defaultContextKey = String(data.context_key || "").trim();
      } else {
        return failJson(
          "ingest: payload must be entry[], { entries, context_key? }, or one entry object with poi_id",
        );
      }
      try {
        upsertPoiStoreFromPayloadEntries(entries, defaultContextKey);
      } catch (e) {
        return failJson(e instanceof Error ? e.message : String(e));
      }
      okJson({ count: Array.isArray(entries) ? entries.length : 0 });
      return;
    }

    if (cmd === "get_entry") {
      const poiId = requireFlag(args, "poi-id");
      const entry = readPoiStoreEntry(poiId);
      if (!entry) return failJson("not found", { poi_id: poiId });
      okJson({ entry });
      return;
    }

    if (cmd === "resolve") {
      const queryName = requireFlag(args, "query-name");
      const contextKey = requireFlag(args, "context-key");
      const r = resolveQueryToPoiEntry(queryName, contextKey);
      okJson(r);
      return;
    }

    if (cmd === "doctor_store") {
      okJson({ poi_store: poiStoreStats() });
      return;
    }

    if (cmd === "save_cache") {
      const tripId = requireFlag(args, "trip-id");
      if (!tripExists(tripId)) return failJson("trip not found");
      const payloadRaw = requireFlag(args, "payload");
      const parsed = readMaybeJsonFromCliValue(payloadRaw);
      if (!parsed.ok) return failJson(`invalid payload: ${parsed.error}`);

      const check = validatePoiCache(parsed.data);
      if (!check.ok) return failJson("poi-cache rejected", { reasons: check.reasons });
      const entries = Array.isArray(parsed.data.entries) ? parsed.data.entries : [];

      try {
        upsertPoiStoreFromPayloadEntries(entries, String(parsed.data.context_key || "").trim());
      } catch (e) {
        return failJson(e instanceof Error ? e.message : String(e));
      }

      writeArtifact(tripId, ARTIFACTS.POI_CACHE, parsed.data);
      appendTripEvent(tripId, "poi_cache_saved", { count: entries.length });
      okJson();
      return;
    }

    if (cmd === "save_preview") {
      const tripId = requireFlag(args, "trip-id");
      if (!tripExists(tripId)) return failJson("trip not found");
      const payloadRaw = requireFlag(args, "payload");
      const parsed = readMaybeJsonFromCliValue(payloadRaw);
      if (!parsed.ok) return failJson(`invalid payload: ${parsed.error}`);

      const check = validatePoiPreview(parsed.data);
      if (!check.ok) return failJson("poi-preview rejected", { reasons: check.reasons });
      const entries = Array.isArray(parsed.data.entries) ? parsed.data.entries : [];

      try {
        upsertPoiStoreFromPayloadEntries(entries, String(parsed.data.context_key || "").trim());
      } catch (e) {
        return failJson(e instanceof Error ? e.message : String(e));
      }

      writeArtifact(tripId, ARTIFACTS.POI_PREVIEW, parsed.data);
      appendTripEvent(tripId, "poi_preview_saved", { count: entries.length });
      okJson();
      return;
    }

    if (cmd === "get_cache") {
      const tripId = requireFlag(args, "trip-id");
      okJson({ poi_cache: readArtifact(tripId, ARTIFACTS.POI_CACHE) || {} });
      return;
    }

    if (cmd === "doctor") {
      const tripId = requireFlag(args, "trip-id");
      const trip = loadTrip(tripId);
      if (!trip) return failJson("trip not found");
      const cache = readArtifact(tripId, ARTIFACTS.POI_CACHE);
      if (!cache) {
        okJson({
          trip_id: tripId,
          stage: trip.stage,
          ok: false,
          reasons: ["missing poi-cache.json (run amap-lbs-skill POI queries then save_cache)"],
          poi_store: poiStoreStats(),
        });
        return;
      }
      const check = validatePoiCache(cache);
      okJson({
        trip_id: tripId,
        stage: trip.stage,
        ok: check.ok,
        reasons: check.reasons,
        count: Array.isArray(cache.entries) ? cache.entries.length : 0,
        poi_store: poiStoreStats(),
      });
      return;
    }

    failJson(`unknown cmd: ${cmd}`);
  } catch (e) {
    failJson(e instanceof Error ? e.message : String(e));
  }
}

main();
