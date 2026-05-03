import fs from "node:fs";

import { parseArgs, requireFlag, okJson, failJson } from "./lib/cli.mjs";
import { readMaybeJsonFromCliValue } from "./lib/json.mjs";
import { ARTIFACTS } from "./lib/contracts.mjs";
import { readArtifact, writeArtifact } from "./lib/artifacts.mjs";
import { validatePoiCache } from "./lib/schema.mjs";
import { appendTripEvent } from "./lib/events.mjs";
import { tripDir } from "./lib/paths.mjs";
import { readJsonFile } from "./lib/json.mjs";

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
        commands: ["save_cache", "get_cache", "doctor"],
        contract: {
          source: 'POI data must come from amap-lbs-skill (poi-cache.source="amap-lbs-skill").',
          traceability: "Store required amap-lbs-skill fields directly in poi-cache.entries[*].raw.",
        },
      });
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

      writeArtifact(tripId, ARTIFACTS.POI_CACHE, parsed.data);
      appendTripEvent(tripId, "poi_cache_saved", { count: entries.length });
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
      });
      return;
    }

    failJson(`unknown cmd: ${cmd}`);
  } catch (e) {
    failJson(e instanceof Error ? e.message : String(e));
  }
}

main();
