import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { writeArtifact } from "../skills/travel-planner/scripts/lib/artifacts.mjs";
import { requirePlanDepthForFinalPlanSave } from "../skills/travel-planner/scripts/lib/guards.mjs";

describe("travel-planner plan save guards (convention A)", () => {
  let tmpDir: string;
  let prev: string | undefined;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), "tp-plan-save-"));
    prev = process.env.TRAVEL_PLANNER_DB_DIR;
    process.env.TRAVEL_PLANNER_DB_DIR = tmpDir;
  });

  afterEach(() => {
    process.env.TRAVEL_PLANNER_DB_DIR = prev;
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("requirePlanDepthForFinalPlanSave allows full_plan without plan-overview", () => {
    const r = requirePlanDepthForFinalPlanSave({ plan_depth_choice: "full_plan" }, "trip-a");
    expect(r.ok).toBe(true);
  });

  it("requirePlanDepthForFinalPlanSave rejects plan_overview without artifact", () => {
    const r = requirePlanDepthForFinalPlanSave({ plan_depth_choice: "plan_overview" }, "trip-b");
    expect(r.ok).toBe(false);
    expect(r.reasons.join(" ")).toMatch(/plan-overview/);
  });

  it("requirePlanDepthForFinalPlanSave rejects plan_overview when overview exists but not approved", () => {
    writeArtifact("trip-c", "plan-overview", { days: [] });
    const r = requirePlanDepthForFinalPlanSave({ plan_depth_choice: "plan_overview" }, "trip-c");
    expect(r.ok).toBe(false);
    expect(r.reasons.join(" ")).toMatch(/plan_overview_confirmed/);
  });

  it("requirePlanDepthForFinalPlanSave allows plan_overview when overview exists and approved", () => {
    writeArtifact("trip-c2", "plan-overview", { days: [] });
    const r = requirePlanDepthForFinalPlanSave(
      { plan_depth_choice: "plan_overview", plan_overview_confirmed: true },
      "trip-c2",
    );
    expect(r.ok).toBe(true);
  });

  it("requirePlanDepthForFinalPlanSave rejects missing plan_depth_choice", () => {
    const r = requirePlanDepthForFinalPlanSave({}, "trip-d");
    expect(r.ok).toBe(false);
    expect(r.reasons.join(" ")).toMatch(/missing plan_depth_choice/);
  });
});
