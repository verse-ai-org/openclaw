import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const travelDbScript = path.join(repoRoot, "skills/travel-planner/scripts/travel_db.mjs");

import { buildBookingReadyPackage } from "../skills/travel-planner/scripts/booking_ready.mjs";
import { buildLiveValidation } from "../skills/travel-planner/scripts/live_validation.mjs";
import { generateTripPlan } from "../skills/travel-planner/scripts/plan_generator.mjs";
import { selectRouteCandidates } from "../skills/travel-planner/scripts/route_selector.mjs";
import {
  addTrip,
  getTripById,
  saveLiveResults,
  setTravelPlannerDbDirForTests,
} from "../skills/travel-planner/scripts/travel_db.mjs";

describe("travel-planner JS modules", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), "travel-planner-test-"));
    setTravelPlannerDbDirForTests(tmpDir);
  });

  afterEach(() => {
    setTravelPlannerDbDirForTests(null);
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  it("selectRouteCandidates marks Xinjiang and returns a recommended route", () => {
    const result = selectRouteCandidates({
      destination: { region: "Xinjiang", country: "China" },
      duration_days: 7,
      travelers: 2,
      budget: { total: 14000, currency: "CNY" },
      transport_preferences: [],
      activities: ["nature"],
    });
    expect(result.destination_key).toBe("xinjiang");
    expect(result.recommended_route?.route_id).toBeTruthy();
    expect(result.alternatives.length).toBeGreaterThan(0);
  });

  it("buildLiveValidation includes flight and hotel tool plans for a route with hubs", () => {
    const trip = {
      destination: { country: "China" },
      departure_date: "2026-07-10",
      return_date: "2026-07-17",
      duration_days: 7,
      travelers: 2,
      budget: { total: 20000 },
      departure_city: "Shanghai",
    };
    const route = {
      arrival_hubs: ["Urumqi", "Yining"],
      departure_hubs: ["Yining", "Urumqi"],
      hotel_bases: ["Urumqi", "Yining"],
      poi_cities: ["Urumqi", "Yining"],
      style: "nature-relaxed",
      validation_focus: ["Test focus"],
      regions: ["Urumqi", "Yining"],
    };
    const v = buildLiveValidation(trip, route, {});
    expect(v.stage).toBe("validation");
    expect(v.tool_plan.flights.length).toBeGreaterThan(0);
    expect(v.tool_plan.hotels.length).toBe(2);
    expect(v.tool_plan.pois.length).toBe(2);
    expect(v.decision_gates.length).toBe(3);
  });

  it("buildBookingReadyPackage is partial without live results", () => {
    const trip = { destination: { country: "China" } };
    const route = { title: "Test route", summary: "S" };
    const liveValidation = { priority_checks: [], decision_gates: [] };
    const pkg = buildBookingReadyPackage(trip, route, liveValidation, {});
    expect(pkg.status).toBe("partial");
    expect(pkg.booking_watchouts.some((w: string) => w.includes("transport"))).toBe(true);
  });

  it("buildBookingReadyPackage becomes ready with flights and hotels", () => {
    const trip = { destination: { country: "China" } };
    const route = { title: "R", summary: "S" };
    const liveValidation = { priority_checks: [], decision_gates: [] };
    const liveResults = {
      flights: { data: { itemList: [{ adultPrice: "500", journeys: [{ segments: [{}] }] }] } },
      hotels: { data: { itemList: [{ name: "H", price: "400" }] } },
      pois: { data: { itemList: [{ name: "P" }] } },
      transport: { trains: [] },
    };
    const pkg = buildBookingReadyPackage(trip, route, liveValidation, liveResults);
    expect(pkg.status).toBe("ready");
    expect(pkg.transport_options.length).toBeGreaterThan(0);
    expect(pkg.hotel_options.length).toBeGreaterThan(0);
  });

  it("travel_db CLI add_trip returns trip_id (TRAVEL_PLANNER_DB_DIR)", () => {
    const payload = JSON.stringify({
      destination_text: "CLI Test",
      destination: { country: "China" },
      duration_days: 2,
    });
    const r = spawnSync(process.execPath, [travelDbScript, "add_trip", payload, "current"], {
      env: { ...process.env, TRAVEL_PLANNER_DB_DIR: tmpDir },
      encoding: "utf8",
    });
    expect(r.status).toBe(0);
    const out = JSON.parse(r.stdout || "{}");
    expect(out.ok).toBe(true);
    expect(out.trip_id).toBeTruthy();
  });

  it("travel_db CLI update_trip merges into trip (TRAVEL_PLANNER_DB_DIR)", () => {
    const payload = JSON.stringify({
      destination_text: "Patch Test",
      destination: { country: "China" },
      duration_days: 1,
    });
    const add = spawnSync(process.execPath, [travelDbScript, "add_trip", payload, "current"], {
      env: { ...process.env, TRAVEL_PLANNER_DB_DIR: tmpDir },
      encoding: "utf8",
    });
    expect(add.status).toBe(0);
    const id = JSON.parse(add.stdout || "{}").trip_id as string;
    const patch = JSON.stringify({ stage: "plan_ready", selected_route: { route_id: "r1" } });
    const r = spawnSync(process.execPath, [travelDbScript, "update_trip", id, patch], {
      env: { ...process.env, TRAVEL_PLANNER_DB_DIR: tmpDir },
      encoding: "utf8",
    });
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout || "{}").ok).toBe(true);
    const t = getTripById(id);
    expect(t?.stage).toBe("plan_ready");
    expect(t?.selected_route?.route_id).toBe("r1");
  });

  it("travel_db persists live results on a trip", () => {
    const id = addTrip(
      {
        destination_text: "Test",
        destination: { country: "China" },
        duration_days: 3,
      },
      "current",
    );
    const ok = saveLiveResults(id, { flights: {}, hotels: {} });
    expect(ok).toBe(true);
    const t = getTripById(id);
    expect(t?.live_results?.updated_at).toBeTruthy();
  });

  it("generateTripPlan returns core sections", () => {
    const plan = generateTripPlan({
      id: "t1",
      destination: { region: "Xinjiang", country: "China" },
      duration_days: 5,
      departure_date: "2026-08-01",
      budget: { total: 10000 },
      travelers: 2,
    });
    expect(plan.route_framing).toBeTruthy();
    expect(plan.live_validation?.tool_plan).toBeTruthy();
    expect(plan.itinerary?.length).toBe(5);
    expect(plan.budget?.breakdown).toBeTruthy();
    expect(plan.pre_trip_brief?.type).toBe("pre_trip");
  });
});
