import { parseArgs, requireFlag, okJson, failJson } from "./lib/cli.mjs";
import { readMaybeJsonFromCliValue } from "./lib/json.mjs";
import { ARTIFACTS, STAGES } from "./lib/contracts.mjs";
import { readArtifact, writeArtifact } from "./lib/artifacts.mjs";
import { requirePlanDepthChoice, requirePlanDepthForFinalPlanSave, requireStageAtLeast } from "./lib/guards.mjs";
import { validatePlanDetails } from "./lib/schema.mjs";

import fs from "node:fs";
import { tripDir } from "./lib/paths.mjs";
import { readJsonFile, writeJsonAtomic } from "./lib/json.mjs";
import { appendTripEvent } from "./lib/events.mjs";

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
      okJson({
        commands: ["save_overview", "save_details", "get_inputs"],
        note: "save_details validates plan-details schema (see references/plan-details.md). Step 4 must not call save_details.",
      });
      return;
    }

    if (cmd === "get_inputs") {
      const tripId = requireFlag(args, "trip-id");
      okJson({
        trip: loadTrip(tripId) || {},
        route_plan: readArtifact(tripId, ARTIFACTS.ROUTE_PLAN),
        route_validation: readArtifact(tripId, ARTIFACTS.ROUTE_VALIDATION),
      });
      return;
    }

    if (cmd === "save_overview") {
      const tripId = requireFlag(args, "trip-id");
      const payloadRaw = requireFlag(args, "payload");
      const parsed = readMaybeJsonFromCliValue(payloadRaw);
      if (!parsed.ok) return failJson(`invalid payload: ${parsed.error}`);

      const trip = loadTrip(tripId);
      if (!trip) return failJson("trip not found");
      const gate = requireStageAtLeast(trip, STAGES.VALIDATED);
      if (!gate.ok) return failJson("guard failed", { reasons: gate.reasons });
      const depthGate = requirePlanDepthChoice(trip, "plan_overview");
      if (!depthGate.ok) return failJson("guard failed", { reasons: depthGate.reasons });

      writeArtifact(tripId, ARTIFACTS.PLAN_OVERVIEW, parsed.data);
      patchTrip(tripId, { plan_overview_confirmed: false });
      appendTripEvent(tripId, "plan_overview_saved", {});
      okJson();
      return;
    }

    if (cmd === "save_details") {
      const tripId = requireFlag(args, "trip-id");
      const payloadRaw = requireFlag(args, "payload");
      const parsed = readMaybeJsonFromCliValue(payloadRaw);
      if (!parsed.ok) return failJson(`invalid payload: ${parsed.error}`);

      const trip = loadTrip(tripId);
      if (!trip) return failJson("trip not found");
      const gate = requireStageAtLeast(trip, STAGES.VALIDATED);
      if (!gate.ok) return failJson("guard failed", { reasons: gate.reasons });
      const depthGate = requirePlanDepthForFinalPlanSave(trip, tripId);
      if (!depthGate.ok) return failJson("guard failed", { reasons: depthGate.reasons });

      const schemaCheck = validatePlanDetails(parsed.data);
      if (!schemaCheck.ok) return failJson("plan-details rejected", { reasons: schemaCheck.reasons });

      writeArtifact(tripId, ARTIFACTS.PLAN_DETAILS, parsed.data);
      const out = patchTrip(tripId, { stage: STAGES.PLAN_READY });
      if (!out.ok) return failJson("trip update failed", { reasons: out.reasons });
      appendTripEvent(tripId, "plan_details_saved", {});
      okJson();
      return;
    }

    failJson(`unknown cmd: ${cmd}`);
  } catch (e) {
    failJson(e instanceof Error ? e.message : String(e));
  }
}

main();
