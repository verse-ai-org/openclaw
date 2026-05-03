import { parseArgs, requireFlag, okJson, failJson } from "./lib/cli.mjs";
import { readMaybeJsonFromCliValue } from "./lib/json.mjs";
import { ARTIFACTS, STAGES } from "./lib/contracts.mjs";
import { writeArtifact } from "./lib/artifacts.mjs";
import { requireStageAtLeast } from "./lib/guards.mjs";
import { appendTripEvent } from "./lib/events.mjs";

import fs from "node:fs";
import { tripDir } from "./lib/paths.mjs";
import { readJsonFile, writeJsonAtomic } from "./lib/json.mjs";

function tripFile(tripId) {
  return `${tripDir(tripId)}/trip.json`;
}

function loadTrip(tripId) {
  const p = tripFile(tripId);
  if (!fs.existsSync(p)) return null;
  return readJsonFile(p);
}

function patchTrip(tripId, patch) {
  const trip = loadTrip(tripId);
  if (!trip) return { ok: false, reasons: ["trip not found"] };
  const next = { ...trip, ...(patch && typeof patch === "object" ? patch : {}) };
  next.updated_at = new Date().toISOString();
  writeJsonAtomic(tripFile(tripId), next);
  return { ok: true, trip: next };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const cmd = String(args.cmd || "").trim();
  try {
    if (!cmd || cmd === "help") {
      okJson({ commands: ["save_live_results", "save_booking_ready", "confirm_booking"] });
      return;
    }

    if (cmd === "save_live_results") {
      const tripId = requireFlag(args, "trip-id");
      const payloadRaw = requireFlag(args, "payload");
      const parsed = readMaybeJsonFromCliValue(payloadRaw);
      if (!parsed.ok) return failJson(`invalid payload: ${parsed.error}`);

      const trip = loadTrip(tripId);
      if (!trip) return failJson("trip not found");
      const gate = requireStageAtLeast(trip, STAGES.PLAN_READY);
      if (!gate.ok) return failJson("guard failed", { reasons: gate.reasons });

      writeArtifact(tripId, ARTIFACTS.LIVE_RESULTS, parsed.data);
      appendTripEvent(tripId, "live_results_saved", {});
      okJson();
      return;
    }

    if (cmd === "save_booking_ready") {
      const tripId = requireFlag(args, "trip-id");
      const payloadRaw = requireFlag(args, "payload");
      const parsed = readMaybeJsonFromCliValue(payloadRaw);
      if (!parsed.ok) return failJson(`invalid payload: ${parsed.error}`);

      const trip = loadTrip(tripId);
      if (!trip) return failJson("trip not found");
      const gate = requireStageAtLeast(trip, STAGES.PLAN_READY);
      if (!gate.ok) return failJson("guard failed", { reasons: gate.reasons });

      writeArtifact(tripId, ARTIFACTS.BOOKING_READY, parsed.data);
      appendTripEvent(tripId, "booking_ready_saved", {});
      okJson();
      return;
    }

    if (cmd === "confirm_booking") {
      const tripId = requireFlag(args, "trip-id");
      const category = requireFlag(args, "category");
      const payloadRaw = requireFlag(args, "payload");
      const parsed = readMaybeJsonFromCliValue(payloadRaw);
      if (!parsed.ok) return failJson(`invalid payload: ${parsed.error}`);

      const trip = loadTrip(tripId);
      if (!trip) return failJson("trip not found");
      const gate = requireStageAtLeast(trip, STAGES.PLAN_READY);
      if (!gate.ok) return failJson("guard failed", { reasons: gate.reasons });

      const confirmed = trip.confirmed_bookings && typeof trip.confirmed_bookings === "object"
        ? { ...trip.confirmed_bookings }
        : {};
      confirmed[category] = parsed.data;
      const out = patchTrip(tripId, { confirmed_bookings: confirmed, bookings_confirmed: true });
      if (!out.ok) return failJson("trip update failed", { reasons: out.reasons });
      appendTripEvent(tripId, "booking_confirmed", { category });
      okJson();
      return;
    }

    failJson(`unknown cmd: ${cmd}`);
  } catch (e) {
    failJson(e instanceof Error ? e.message : String(e));
  }
}

main();

