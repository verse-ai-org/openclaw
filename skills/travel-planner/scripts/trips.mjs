import fs from "node:fs";
import crypto from "node:crypto";

import { parseArgs, requireFlag, optionalFlag, okJson, failJson } from "./lib/cli.mjs";
import { dbDir, tripsIndexFile, tripsDataDir, tripDir } from "./lib/paths.mjs";
import { ensureDir, readJsonFile, writeJsonAtomic, readMaybeJsonFromCliValue } from "./lib/json.mjs";
import { STAGES } from "./lib/contracts.mjs";
import { validateTrip } from "./lib/schema.mjs";
import { appendTripEvent } from "./lib/events.mjs";

function nowIso() {
  return new Date().toISOString();
}

function newId() {
  return crypto.randomUUID();
}

function ensureIndex() {
  ensureDir(dbDir());
  ensureDir(tripsDataDir());
  if (!fs.existsSync(tripsIndexFile())) {
    writeJsonAtomic(tripsIndexFile(), {
      schema_version: 1,
      current_trips: [],
      past_trips: [],
    });
  }
}

function loadIndex() {
  ensureIndex();
  return readJsonFile(tripsIndexFile());
}

function saveIndex(index) {
  writeJsonAtomic(tripsIndexFile(), index);
}

function tripFile(tripId) {
  return `${tripDir(tripId)}/trip.json`;
}

function loadTrip(tripId) {
  const p = tripFile(tripId);
  if (!fs.existsSync(p)) return null;
  return readJsonFile(p);
}

function writeTrip(trip) {
  const check = validateTrip(trip);
  if (!check.ok) return { ok: false, reasons: check.reasons };
  writeJsonAtomic(tripFile(trip.id), trip);
  return { ok: true };
}

function listCurrentTrips() {
  const idx = loadIndex();
  return Array.isArray(idx.current_trips) ? idx.current_trips : [];
}

function listPastTrips() {
  const idx = loadIndex();
  return Array.isArray(idx.past_trips) ? idx.past_trips : [];
}

function getActiveTrips() {
  return listCurrentTrips()
    .map((t) => loadTrip(t.id))
    .filter(Boolean)
    .filter((t) => ![STAGES.COMPLETED, STAGES.CANCELLED].includes(t.stage));
}

function createTrip(payload) {
  const id = newId();
  ensureDir(tripDir(id));
  const base = {
    id,
    stage: STAGES.INTAKE,
    created_at: nowIso(),
    updated_at: nowIso(),
    bookings_confirmed: false,
    chosen_route_id: "",
    meta: {},
  };
  const trip = { ...base, ...(payload && typeof payload === "object" ? payload : {}) };
  trip.id = id;
  trip.stage = STAGES.INTAKE;
  trip.updated_at = nowIso();

  const result = writeTrip(trip);
  if (!result.ok) return { ok: false, reasons: result.reasons };

  const idx = loadIndex();
  idx.current_trips = [{ id, created_at: trip.created_at }, ...(idx.current_trips || [])];
  saveIndex(idx);
  appendTripEvent(id, "trip_created", { stage: trip.stage });
  return { ok: true, trip_id: id };
}

function patchTrip(tripId, payload) {
  const trip = loadTrip(tripId);
  if (!trip) return { ok: false, reasons: ["trip not found"] };
  const next = {
    ...trip,
    ...(payload && typeof payload === "object" ? payload : {}),
    id: trip.id,
    updated_at: nowIso(),
  };
  const res = writeTrip(next);
  if (!res.ok) return res;
  appendTripEvent(tripId, "trip_patched", { keys: Object.keys(payload || {}) });
  return { ok: true };
}

function moveToPast(tripId) {
  const trip = loadTrip(tripId);
  if (!trip) return { ok: false, reasons: ["trip not found"] };
  const next = { ...trip, stage: STAGES.COMPLETED, updated_at: nowIso() };
  const res = writeTrip(next);
  if (!res.ok) return res;

  const idx = loadIndex();
  idx.current_trips = (idx.current_trips || []).filter((t) => t.id !== tripId);
  idx.past_trips = [{ id: tripId, completed_at: nowIso() }, ...(idx.past_trips || [])];
  saveIndex(idx);
  appendTripEvent(tripId, "trip_completed", {});
  return { ok: true };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const cmd = String(args.cmd || "").trim();
  try {
    if (!cmd || cmd === "help") {
      okJson({
        commands: ["get", "get_active", "create", "patch", "move_to_past", "index_path"],
        env: { TRAVEL_PLANNER_DB_DIR: dbDir() },
      });
      return;
    }

    if (cmd === "index_path") {
      okJson({ path: tripsIndexFile() });
      return;
    }

    if (cmd === "get_active") {
      okJson({ active_trips: getActiveTrips() });
      return;
    }

    if (cmd === "get") {
      const tripId = requireFlag(args, "trip-id");
      okJson({ trip: loadTrip(tripId) || {} });
      return;
    }

    if (cmd === "create") {
      const payloadRaw = optionalFlag(args, "payload", "{}");
      const parsed = readMaybeJsonFromCliValue(payloadRaw);
      if (!parsed.ok) return failJson(`invalid payload: ${parsed.error}`);
      const out = createTrip(parsed.data);
      if (!out.ok) return failJson("create rejected", { reasons: out.reasons });
      okJson(out);
      return;
    }

    if (cmd === "patch") {
      const tripId = requireFlag(args, "trip-id");
      const payloadRaw = requireFlag(args, "payload");
      const parsed = readMaybeJsonFromCliValue(payloadRaw);
      if (!parsed.ok) return failJson(`invalid payload: ${parsed.error}`);
      const out = patchTrip(tripId, parsed.data);
      if (!out.ok) return failJson("patch rejected", { reasons: out.reasons });
      okJson();
      return;
    }

    if (cmd === "move_to_past") {
      const tripId = requireFlag(args, "trip-id");
      const out = moveToPast(tripId);
      if (!out.ok) return failJson("move_to_past rejected", { reasons: out.reasons });
      okJson();
      return;
    }

    failJson(`unknown cmd: ${cmd}`);
  } catch (e) {
    failJson(e instanceof Error ? e.message : String(e));
  }
}

main();

