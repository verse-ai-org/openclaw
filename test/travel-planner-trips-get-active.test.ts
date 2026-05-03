import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tripsScript = path.join(repoRoot, "skills/travel-planner/scripts/trips.mjs");

function runTrips(tmpDir: string, ...args: string[]) {
  const out = execFileSync(process.execPath, [tripsScript, ...args], {
    encoding: "utf8",
    env: { ...process.env, TRAVEL_PLANNER_DB_DIR: tmpDir },
  });
  return JSON.parse(out.trim()) as { ok?: boolean; active_trips?: unknown[]; trip_id?: string };
}

describe("travel-planner trips get_active", () => {
  let tmpDir: string;
  let prev: string | undefined;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), "tp-trips-active-"));
    prev = process.env.TRAVEL_PLANNER_DB_DIR;
    process.env.TRAVEL_PLANNER_DB_DIR = tmpDir;
  });

  afterEach(() => {
    process.env.TRAVEL_PLANNER_DB_DIR = prev;
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("lists intake trip as active", () => {
    const created = runTrips(tmpDir, "--cmd=create", "--payload={}");
    expect(created.ok).toBe(true);
    const tripId = created.trip_id;
    expect(tripId).toBeTruthy();

    const active = runTrips(tmpDir, "--cmd=get_active");
    expect(active.active_trips).toHaveLength(1);
    expect((active.active_trips as { id: string }[])[0].id).toBe(tripId);
  });

  it("excludes plan_ready from active_trips", () => {
    const created = runTrips(tmpDir, "--cmd=create", "--payload={}");
    const tripId = created.trip_id;
    expect(tripId).toBeTruthy();

    runTrips(tmpDir, "--cmd=patch", `--trip-id=${tripId}`, `--payload={"stage":"plan_ready"}`);

    const active = runTrips(tmpDir, "--cmd=get_active");
    expect(active.active_trips).toEqual([]);
  });
});
