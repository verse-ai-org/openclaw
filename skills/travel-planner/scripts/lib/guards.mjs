import { ARTIFACTS, STAGES } from "./contracts.mjs";
import { existsArtifact } from "./artifacts.mjs";

const ORDER = [
  STAGES.INTAKE,
  STAGES.ROUTE_SELECTED,
  STAGES.ROUTE_PLANNED,
  STAGES.ROUTE_CONFIRMED,
  STAGES.VALIDATED,
  STAGES.PLAN_READY,
  STAGES.IN_TRIP,
  STAGES.COMPLETED,
  STAGES.CANCELLED,
];

function stageRank(stage) {
  const idx = ORDER.indexOf(String(stage));
  return idx === -1 ? 0 : idx;
}

export function requireStageAtLeast(trip, minStage) {
  const reasons = [];
  if (!trip || typeof trip !== "object") {
    reasons.push("trip missing");
    return { ok: false, reasons };
  }
  if (stageRank(trip.stage) < stageRank(minStage)) {
    reasons.push(`requires stage >= ${minStage} (current=${trip.stage || ""})`);
  }
  return { ok: reasons.length === 0, reasons };
}

export function requireChosenRoute(trip) {
  const reasons = [];
  if (!trip?.chosen_route_id) reasons.push("missing chosen_route_id");
  return { ok: reasons.length === 0, reasons };
}

export function requireBookingsConfirmed(trip) {
  const reasons = [];
  if (!trip?.bookings_confirmed) reasons.push("requires bookings_confirmed=true");
  return { ok: reasons.length === 0, reasons };
}

export function requirePlanDepthChoice(trip, expected) {
  const reasons = [];
  const v = String(trip?.plan_depth_choice || "").trim();
  if (!v) {
    reasons.push("missing plan_depth_choice (expected plan_overview|full_plan)");
  } else if (expected && v !== expected) {
    reasons.push(`requires plan_depth_choice=${expected} (current=${v})`);
  } else if (!["plan_overview", "full_plan"].includes(v)) {
    reasons.push(`invalid plan_depth_choice=${v} (expected plan_overview|full_plan)`);
  }
  return { ok: reasons.length === 0, reasons };
}

/** Step 5 single `save_details` (convention A): allow plan_overview or full_plan; overview path requires plan-overview.json. */
export function requirePlanDepthForFinalPlanSave(trip, tripId) {
  const reasons = [];
  const v = String(trip?.plan_depth_choice || "").trim();
  if (!v) {
    reasons.push("missing plan_depth_choice (expected plan_overview|full_plan)");
    return { ok: false, reasons };
  }
  if (!["plan_overview", "full_plan"].includes(v)) {
    reasons.push(`invalid plan_depth_choice=${v} (expected plan_overview|full_plan)`);
    return { ok: false, reasons };
  }
  if (v === "plan_overview") {
    const art = requireArtifact(tripId, ARTIFACTS.PLAN_OVERVIEW);
    if (!art.ok) return art;
    if (trip?.plan_overview_confirmed !== true) {
      reasons.push(
        "requires plan_overview_confirmed=true (after approval_card, run workflow.mjs --cmd=confirm_plan_overview)",
      );
      return { ok: false, reasons };
    }
    return { ok: true, reasons: [] };
  }
  return { ok: true, reasons };
}

export function requireArtifact(tripId, artifactName) {
  const reasons = [];
  if (!existsArtifact(tripId, artifactName)) reasons.push(`missing artifact: ${artifactName}.json`);
  return { ok: reasons.length === 0, reasons };
}
