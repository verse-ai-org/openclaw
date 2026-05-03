import { describe, expect, it } from "vitest";

import { validatePlanDetails } from "../skills/travel-planner/scripts/lib/schema.mjs";

function minimalValid() {
  return {
    schema_version: 1,
    generated_at: "2026-05-03T12:00:00.000Z",
    destination: {
      summary: "概述",
      geography: "地理",
      culture_and_customs: "文化",
    },
    transport: {
      outbound: "去程",
      return: "返程",
    },
    weather: { summary: "天气总述" },
    days: [{ day_index: 1, title: "D1", summary: "当天" }],
    pre_departure_checklist: { items: [{ label: "证件" }] },
    etiquette_and_culture: { summary: "礼仪" },
    safety_and_emergency: { summary: "安全" },
    geo: { text_fallback_route: "文字路线" },
  };
}

describe("validatePlanDetails", () => {
  it("accepts minimal valid payload", () => {
    const r = validatePlanDetails(minimalValid());
    expect(r.ok).toBe(true);
  });

  it("rejects wrong schema_version", () => {
    const r = validatePlanDetails({ ...minimalValid(), schema_version: 2 });
    expect(r.ok).toBe(false);
    expect(r.reasons.some((x) => x.includes("schema_version"))).toBe(true);
  });

  it("rejects empty days", () => {
    const p = minimalValid();
    p.days = [];
    const r = validatePlanDetails(p);
    expect(r.ok).toBe(false);
  });

  it("rejects missing geo.text_fallback_route", () => {
    const p = { ...minimalValid(), geo: { text_fallback_route: "" } };
    const r = validatePlanDetails(p);
    expect(r.ok).toBe(false);
  });
});
