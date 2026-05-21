import { describe, expect, it } from "vitest";
import {
  formatTurnUsageHeaderLine,
  mergeTurnUsageMeta,
} from "./turn-usage-meta";

describe("mergeTurnUsageMeta", () => {
  it("aggregates usage across assistant rows in a run", () => {
    const first = mergeTurnUsageMeta(
      undefined,
      {
        usage: { input: 105_944, output: 100 },
        model: "anthropic/claude-opus-4-7",
      },
      258_400,
    );
    const merged = mergeTurnUsageMeta(
      first ?? undefined,
      { usage: { input: 108_577, output: 100 } },
      258_400,
    );
    expect(merged?.input).toBe(214_521);
    expect(merged?.output).toBe(200);
    expect(merged?.contextPercent).toBe(42);
  });

  it("returns null when no usage or model", () => {
    expect(mergeTurnUsageMeta(undefined, { role: "assistant" }, null)).toBeNull();
  });
});

describe("formatTurnUsageHeaderLine", () => {
  it("formats compact header tokens", () => {
    const line = formatTurnUsageHeaderLine({
      input: 214_500,
      output: 1200,
      cacheRead: 0,
      cacheWrite: 0,
      cost: 0,
      model: "anthropic/claude-opus-4-7",
      contextPercent: 44,
    });
    expect(line.primary).toContain("↑214.5k");
    expect(line.primary).toContain("↓1.2k");
    expect(line.primary).toContain("44% ctx");
    expect(line.title).toContain("claude-opus-4-7");
  });
});
