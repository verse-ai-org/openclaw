import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const travelDbScript = path.join(repoRoot, "skills/travel-planner/scripts/db.mjs");
const planGeneratorScript = path.join(
  repoRoot,
  "skills/travel-planner/scripts/plan-generator.mjs",
);

import { buildBookingReadyPackage } from "../skills/travel-planner/scripts/booking-ready.mjs";
import { buildFeasibilityVerdict } from "../skills/travel-planner/scripts/route-validation.mjs";
import {
  generateTripPlan,
  persistStep6PlanOverview,
} from "../skills/travel-planner/scripts/plan-generator.mjs";
import { selectRouteCandidates } from "../skills/travel-planner/scripts/route-plan.mjs";
import {
  buildXhsEvidence,
  buildXhsSearchQueries,
} from "../skills/travel-planner/scripts/xhs-evidence-builder.mjs";
import {
  addTrip,
  getTripById,
  saveRouteFramingWithSource,
  getRouteEvidence,
  saveRouteEvidence,
  saveLiveResults,
  setTravelPlannerDbDirForTests,
  updateTrip,
} from "../skills/travel-planner/scripts/db.mjs";

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

  it("selectRouteCandidates requests XHS evidence when xhs preference and evidence missing", () => {
    const result = selectRouteCandidates({
      destination: { region: "Xinjiang", country: "China" },
      duration_days: 7,
      travelers: 2,
      budget: { total: 14000, currency: "CNY" },
      transport_preferences: [],
      activities: ["nature"],
      route_source_preference: "xhs",
    });
    expect(result.route_options).toEqual([]);
    expect(result.route_tool_ui_ready).toBe(false);
    expect(result.next_action).toMatch(/Xiaohongshu/i);
    expect(result.planning_note).toMatch(/Xiaohongshu-first|fallback/i);
  });

  it("buildXhsEvidence keeps top graphic notes by likes", () => {
    const evidence = buildXhsEvidence({
      destination_text: "川西",
      duration_days: 5,
      search_results: [
        {
          title: "川西 5天路线 A",
          url: "https://xhs/a",
          note_type: "图文",
          like_count: 3300,
          desc: "成都-康定-新都桥-四姑娘山-成都",
        },
        {
          title: "川西 vlog",
          url: "https://xhs/v",
          note_type: "视频",
          like_count: 5000,
          desc: "视频内容",
        },
        {
          title: "川西 5天路线 B",
          url: "https://xhs/b",
          type: "图文",
          like_count: 4200,
          desc: "成都→丹巴→新都桥→康定→成都",
        },
        {
          title: "川西 5天路线 C",
          url: "https://xhs/c",
          note_type: "图文",
          like_count: 1200,
          desc: "成都-雅安-泸定-康定-成都",
        },
      ],
    });
    expect(evidence.query.search_filters.note_type).toBe("图文");
    expect(evidence.query.search_filters.sort_by).toBe("最多点赞");
    expect(evidence.sources.length).toBe(3);
    expect(evidence.sources[0].title).toContain("B");
    expect(
      evidence.sources.some((s: { note_type: string }) =>
        s.note_type.includes("视频"),
      ),
    ).toBe(false);
    expect(evidence.route_hints.popular_loops.length).toBeGreaterThan(0);
  });

  it("buildXhsSearchQueries includes duration-based phrase", () => {
    const queries = buildXhsSearchQueries("川西", 5);
    expect(queries[0]).toBe("J人川西5天行程安排");
  });

  it("buildXhsEvidence supports real-world xhs fields and day-based desc", () => {
    const evidence = buildXhsEvidence({
      destination_text: "川西环线",
      duration_days: 5,
      search_results: [
        {
          note_id: "68e1224d0000000004028459",
          displayTitle: "川西环线 5 天 4 晚自驾旅游攻略",
          likedCount: 758,
          noteType: "图文",
          desc: "Day1 成都-折多山-鱼子西-新都桥(360km)；Day2 新都桥-理塘-香格里拉镇(430km)",
        },
        {
          noteId: "654263d7000000001f036183",
          display_title: "川西小环线5日自驾游攻略详细版",
          liked_count: 746,
          type: "图文",
          description: "第1天 成都-四姑娘山-丹巴；第2天 丹巴-塔公草原-新都桥",
        },
      ],
    });
    expect(evidence.sources.length).toBe(2);
    expect(evidence.sources[0].url).toContain("/explore/");
    expect(evidence.route_hints.popular_loops.length).toBeGreaterThan(0);
    expect(Array.isArray(evidence.route_hints.popular_loops[0])).toBe(true);
    expect(evidence.route_hints.popular_stops.length).toBeGreaterThan(0);
  });

  it("selectRouteCandidates returns XHS-driven route when evidence is present", () => {
    const result = selectRouteCandidates({
      destination: { region: "川西", country: "China" },
      route_source_preference: "xhs",
      route_evidence: {
        platform: "xhs",
        evidence_quality: "high",
        generated_at: "2026-04-07T00:00:00Z",
        summary: "川西小环线高频",
        sources: [{ url: "https://example.com/xhs/1" }],
        route_hints: {
          popular_loops: [
            ["成都", "康定", "新都桥", "丹巴", "四姑娘山", "成都"],
          ],
          popular_stops: ["新都桥", "四姑娘山"],
        },
        stay_hints: { recommended_bases: ["新都桥", "丹巴"] },
      },
    });
    expect(result.route_options.length).toBeGreaterThanOrEqual(2);
    expect(result.route_options[0]?.stops?.length).toBeGreaterThan(0);
    expect(result.route_options[0]?.route_id).toBeTruthy();
    expect(result.route_options[0]?.source_platform).toBe("xhs");
  });

  it("buildFeasibilityVerdict respects Step 5 transport_result / weather_result status", () => {
    const rv = {
      transport_result: {
        required: true,
        mode: "flight",
        checked: true,
        raw: {},
        status: "ok",
      },
      weather_result: {
        locations_checked: ["成都"],
        raw: {},
        status: "caution",
      },
    };
    const out = buildFeasibilityVerdict(rv, {});
    expect(out.verdict).toBe("caution");
    expect(out.verdict_reasons.length).toBeGreaterThan(0);
  });

  it("buildBookingReadyPackage is partial without live results", () => {
    const trip = { destination: { country: "China" } };
    const route = { title: "Test route", summary: "S" };
    const liveValidation = { priority_checks: [], decision_gates: [] };
    const pkg = buildBookingReadyPackage(trip, route, liveValidation, {});
    expect(pkg.status).toBe("partial");
    expect(
      pkg.booking_watchouts.some((w: string) => w.includes("transport")),
    ).toBe(true);
  });

  it("buildBookingReadyPackage becomes ready with flights and hotels", () => {
    const trip = { destination: { country: "China" } };
    const route = { title: "R", summary: "S" };
    const liveValidation = { priority_checks: [], decision_gates: [] };
    const liveResults = {
      flights: {
        data: {
          itemList: [{ adultPrice: "500", journeys: [{ segments: [{}] }] }],
        },
      },
      hotels: { data: { itemList: [{ name: "H", price: "400" }] } },
      pois: { data: { itemList: [{ name: "P" }] } },
      transport: { trains: [] },
    };
    const pkg = buildBookingReadyPackage(
      trip,
      route,
      liveValidation,
      liveResults,
    );
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
    const r = spawnSync(
      process.execPath,
      [
        travelDbScript,
        `--cmd=add_trip`,
        `--payload=${payload}`,
        `--list=current`,
      ],
      {
        env: { ...process.env, TRAVEL_PLANNER_DB_DIR: tmpDir },
        encoding: "utf8",
      },
    );
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
    const add = spawnSync(
      process.execPath,
      [
        travelDbScript,
        `--cmd=add_trip`,
        `--payload=${payload}`,
        `--list=current`,
      ],
      {
        env: { ...process.env, TRAVEL_PLANNER_DB_DIR: tmpDir },
        encoding: "utf8",
      },
    );
    expect(add.status).toBe(0);
    const id = JSON.parse(add.stdout || "{}").trip_id as string;
    const patch = JSON.stringify({
      stage: "plan_ready",
      chosen_route_id: "r1",
      route_choice_confirmed: true,
      route_options: [
        { route_id: "r1", title: "A", stops: ["a", "b"] },
        { route_id: "r2", title: "B", stops: ["b", "a"] },
      ],
      selected_route: { route_id: "r1" },
    });
    const r = spawnSync(
      process.execPath,
      [
        travelDbScript,
        `--cmd=update_trip`,
        `--trip-id=${id}`,
        `--payload=${patch}`,
      ],
      {
        env: { ...process.env, TRAVEL_PLANNER_DB_DIR: tmpDir },
        encoding: "utf8",
      },
    );
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

  it("travel_db persists route evidence meta and payload under agents data", () => {
    const id = addTrip(
      {
        destination_text: "川西",
        destination: { country: "China" },
        duration_days: 5,
      },
      "current",
    );
    const ok = saveRouteEvidence(id, "xhs", {
      evidence_quality: "medium",
      generated_at: "2026-04-08T10:00:00.000Z",
      query: { destination_text: "川西" },
      sources: [
        {
          id: "note_1",
          title: "川西5天",
          url: "https://www.xiaohongshu.com/discovery/item/note_1",
          like_count: 1234,
          note_type: "图文",
        },
      ],
      route_hints: { popular_loops: [["成都", "康定", "成都"]] },
    });
    expect(ok).toBe(true);
    const trip = getTripById(id);
    expect(trip?.route_evidence_meta?.platform).toBe("xhs");
    expect(trip?.route_evidence_meta?.source_count).toBe(1);
    expect(trip?.route_evidence_meta?.evidence_file).toContain(
      `data/trips/${id}/evidence.xhs.json`,
    );
    const evidence = getRouteEvidence(id);
    expect(evidence?.meta?.quality).toBe("medium");
    expect(evidence?.evidence?.sources?.[0]?.id).toBe("note_1");
  });

  it("saveRouteFramingWithSource rejects xhs route without persisted evidence", () => {
    const id = addTrip(
      {
        destination_text: "川西",
        destination: { country: "China" },
        duration_days: 5,
      },
      "current",
    );
    const ok = saveRouteFramingWithSource(
      id,
      { route_id: "route_1", name: "A" },
      [{ route_id: "route_2", name: "B" }],
      [],
      {},
      "xhs",
      0,
      "",
      [],
      "xhs route",
      "xhs",
    );
    expect(ok).toBe(false);
  });

  it("saveRouteFramingWithSource accepts xhs route after evidence is saved", () => {
    const id = addTrip(
      {
        destination_text: "川西",
        destination: { country: "China" },
        duration_days: 5,
      },
      "current",
    );
    const evidenceOk = saveRouteEvidence(id, "xhs", {
      evidence_quality: "medium",
      sources: [{ id: "n1", title: "T", url: "https://xhs/1", like_count: 1 }],
    });
    expect(evidenceOk).toBe(true);
    const ok = saveRouteFramingWithSource(
      id,
      { route_id: "route_1", name: "A" },
      [{ route_id: "route_2", name: "B" }],
      [],
      {},
      "xhs",
      0,
      "",
      [],
      "xhs route",
      "xhs",
    );
    expect(ok).toBe(true);
  });

  it("saveRouteFramingWithSource rejects amap route without persisted evidence", () => {
    const id = addTrip(
      {
        destination_text: "川西",
        destination: { country: "China" },
        duration_days: 5,
      },
      "current",
    );
    const ok = saveRouteFramingWithSource(
      id,
      { route_id: "route_1", name: "A" },
      [{ route_id: "route_2", name: "B" }],
      [],
      {},
      "amap",
      0,
      "",
      [],
      "amap route",
      "amap",
    );
    expect(ok).toBe(false);
  });

  it("saveRouteFramingWithSource accepts web route without persisted evidence", () => {
    const id = addTrip(
      {
        destination_text: "川西",
        destination: { country: "China" },
        duration_days: 5,
      },
      "current",
    );
    const ok = saveRouteFramingWithSource(
      id,
      { route_id: "route_1", name: "A" },
      [{ route_id: "route_2", name: "B" }],
      [],
      {},
      "web",
      0,
      "",
      [],
      "web route",
      "web",
    );
    expect(ok).toBe(true);
  });

  it("persistStep6PlanOverview writes step6.plan-overview.json under trip dir", () => {
    const written = persistStep6PlanOverview("trip-step6-artifact", {
      generated_at: "2026-04-17T12:00:00.000Z",
      chosen_route_id: "r1",
      route_validation_status: "ready",
      step6_summary: {
        route_overview_text: "A B",
        daily_overview: [{ day: 1, route_line: "x" }],
        transport_snapshot: { flights: "n/a" },
        weather_table_rows: [],
        template_hint: {},
      },
    });
    expect(written).toBe(
      path.join(tmpDir, "data", "trips", "trip-step6-artifact", "step6.plan-overview.json"),
    );
    const raw = JSON.parse(readFileSync(written, "utf8")) as {
      schema_version: number;
      trip_id: string;
      route_overview_text: string;
      daily_overview: Array<{ day: number }>;
    };
    expect(raw.schema_version).toBe(1);
    expect(raw.trip_id).toBe("trip-step6-artifact");
    expect(raw.route_overview_text).toBe("A B");
    expect(raw.daily_overview[0]?.day).toBe(1);
  });

  it("plan-generator CLI rejects --cmd=plan_overview with --trip-json (unexpected flag)", () => {
    const r = spawnSync(
      process.execPath,
      [
        planGeneratorScript,
        `--trip-json=${JSON.stringify({
          id: "cli-step6",
          destination: { country: "China" },
          duration_days: 2,
        })}`,
        "--cmd=plan_overview",
      ],
      { encoding: "utf8" },
    );
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/trip-json|unexpected flag/i);
  });

  it("plan-generator CLI requires --cmd", () => {
    const id = addTrip(
      {
        destination_text: "No cmd",
        destination: { country: "China" },
        duration_days: 1,
      },
      "current",
    );
    const r = spawnSync(process.execPath, [planGeneratorScript, `--trip-id=${id}`], {
      env: { ...process.env, TRAVEL_PLANNER_DB_DIR: tmpDir },
      encoding: "utf8",
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/--cmd/);
  });

  it("plan-generator CLI --cmd=plan_overview writes step6.plan-overview.json", () => {
    const id = addTrip(
      {
        destination_text: "Step6 persist",
        destination: { country: "China" },
        duration_days: 2,
      },
      "current",
    );
    const r = spawnSync(
      process.execPath,
      [planGeneratorScript, `--trip-id=${id}`, "--cmd=plan_overview"],
      {
        env: { ...process.env, TRAVEL_PLANNER_DB_DIR: tmpDir },
        encoding: "utf8",
      },
    );
    expect(r.status).toBe(0);
    const artifact = path.join(
      tmpDir,
      "data",
      "trips",
      String(id),
      "step6.plan-overview.json",
    );
    expect(readFileSync(artifact, "utf8")).toMatch(/"schema_version"\s*:\s*1/);
    expect(r.stderr).toMatch(/plan_overview 已落盘/);
  });

  it("plan-generator CLI rejects unknown --cmd", () => {
    const id = addTrip(
      {
        destination_text: "Bad cmd",
        destination: { country: "China" },
        duration_days: 1,
      },
      "current",
    );
    const r = spawnSync(
      process.execPath,
      [planGeneratorScript, `--trip-id=${id}`, "--cmd=step_8_legacy"],
      {
        env: { ...process.env, TRAVEL_PLANNER_DB_DIR: tmpDir },
        encoding: "utf8",
      },
    );
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/未知 --cmd 值/);
  });

  it("generateTripPlan returns core sections but withholds itinerary before route confirmation", () => {
    const plan = generateTripPlan({
      id: "t1",
      destination: { region: "Xinjiang", country: "China" },
      duration_days: 5,
      departure_date: "2026-08-01",
      budget: { total: 10000 },
      travelers: 2,
    });
    expect(plan.route_plan).toBeTruthy();
    expect(plan.route_plan).toMatchObject({ source: "none", plan_output: null });
    expect(plan.route_validation_status).toBe("missing");
    expect(plan.itinerary?.length).toBe(0);
    expect(plan.budget?.breakdown).toBeTruthy();
    expect(plan).not.toHaveProperty("pre_trip_brief");
    expect(plan).not.toHaveProperty("booking_ready");
  });

  it("generateTripPlan step6_summary weather_table_rows prefers step5.route-validation.json", () => {
    const id = "trip-step5-weather";
    const tripDir = path.join(tmpDir, "data", "trips", id);
    mkdirSync(tripDir, { recursive: true });
    const step5 = {
      verdict: "go",
      checked_at: "2026-04-17T00:00:00.000Z",
      transport_result: {
        required: false,
        mode: "",
        checked: true,
        raw: {},
        status: "not_required",
      },
      weather_result: {
        locations_checked: ["康定"],
        status: "go",
        raw: {
          locations: [
            {
              location: "康定",
              date: "2026-08-01",
              condition: "多云",
              temperature: "18-24°C",
              risk: "低",
            },
          ],
        },
      },
    };
    writeFileSync(
      path.join(tripDir, "step5.route-validation.json"),
      JSON.stringify(step5, null, 2),
      "utf8",
    );
    const plan = generateTripPlan({
      id,
      destination: { region: "川西", country: "China" },
      duration_days: 2,
      departure_date: "2026-08-01",
      route_choice_confirmed: true,
      chosen_route_id: "r1",
      route_options: [{ route_id: "r1", title: "Loop", stops: ["康定", "新都桥"] }],
      route_validation: {
        stage: "",
        transport_result: {
          required: false,
          mode: "",
          checked: false,
          raw: {},
          status: "",
        },
        weather_result: { locations_checked: [], raw: {}, status: "" },
        verdict: "",
        verdict_reasons: [],
        checked_at: "",
      },
    });
    expect(plan.step6_summary?.weather_table_rows?.[0]).toMatchObject({
      location: "康定",
      condition: "多云",
      temperature: "18-24°C",
      risk: "低",
    });
    expect(plan.step6_summary?.transport_snapshot?.flight).toMatch(/无需机票验证/);
    expect(plan.step6_summary?.transport_snapshot?.train).toMatch(/无需高铁验证/);
  });

  it("generateTripPlan transport_snapshot uses step5.route-validation.json flight raw", () => {
    const id = "trip-step5-transport";
    const tripDir = path.join(tmpDir, "data", "trips", id);
    mkdirSync(tripDir, { recursive: true });
    const step5 = {
      verdict: "go",
      checked_at: "2026-04-17T12:00:00.000Z",
      transport_result: {
        required: true,
        mode: "flight",
        checked: true,
        status: "ok",
        raw: { flights: [{ from: "SHA", to: "KGT" }] },
      },
      weather_result: { locations_checked: [], raw: {}, status: "go" },
    };
    writeFileSync(
      path.join(tripDir, "step5.route-validation.json"),
      JSON.stringify(step5, null, 2),
      "utf8",
    );
    const plan = generateTripPlan({
      id,
      destination: { region: "川西", country: "China" },
      duration_days: 2,
      departure_date: "2026-08-01",
      route_choice_confirmed: true,
      chosen_route_id: "r1",
      route_options: [{ route_id: "r1", title: "Loop", stops: ["康定"] }],
      route_validation: {
        stage: "",
        transport_result: {
          required: true,
          mode: "flight",
          checked: false,
          raw: {},
          status: "",
        },
        weather_result: { locations_checked: ["康定"], raw: {}, status: "go" },
        verdict: "",
        verdict_reasons: [],
        checked_at: "",
      },
    });
    expect(plan.step6_summary?.transport_snapshot?.flight).toBe("已验证（存在机票候选）");
  });

  it("generateTripPlan route_plan.plan_output reads step4.plan-output.json via ref", () => {
    const id = addTrip(
      {
        destination_text: "川西",
        destination: { country: "China" },
        duration_days: 3,
      },
      "current",
    );
    const planFull = {
      route_tool_ui_ready: true,
      route_options: [{ route_id: "r1", title: "Loop", stops: ["A", "B"] }],
    };
    updateTrip(id, {
      step4_plan_output_full: planFull,
      chosen_route_id: "r1",
      route_choice_confirmed: true,
      route_plan: {
        recommended_route_id: "r1",
        alternative_ids: [],
        rejected_route_ids: [],
        used_platform: "xhs",
        fallback_count: 0,
        fallback_reason: "",
        decision_summary: { headline: "ok" },
      },
    });
    const trip = getTripById(id);
    expect(trip).toBeTruthy();
    const plan = generateTripPlan(trip!);
    expect(plan.route_plan).toMatchObject({ source: "step4.plan-output.json" });
    expect(plan.route_plan.plan_output).toMatchObject({
      route_tool_ui_ready: true,
      route_options: [{ route_id: "r1" }],
    });
    expect(plan.route_plan.decision).toMatchObject({ recommended_route_id: "r1" });
  });
});
