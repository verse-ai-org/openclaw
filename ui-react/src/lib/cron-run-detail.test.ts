import { describe, expect, it } from "vitest";
import {
  deliveryStatusLabel,
  formatRunHistoryDuration,
  formatRunNextLabel,
  formatRunUsageSummary,
  getCronRunBodySource,
  isCronRunJobDeleted,
  mapGatewayCronRunEntry,
  runStatusLabel,
  shouldShowRunErrorInMeta,
} from "./cron-run-detail";

describe("mapGatewayCronRunEntry", () => {
  it("maps gateway fields into CronRunRecord", () => {
    const record = mapGatewayCronRunEntry({
      ts: 1_700_000_000_000,
      jobId: "job-abc12345",
      jobName: "Morning digest",
      status: "ok",
      durationMs: 2500,
      summary: "All clear.",
      deliveryStatus: "delivered",
      model: "gpt-5.5",
      provider: "openai",
      usage: { total_tokens: 42 },
      runAtMs: 1_699_999_000_000,
      nextRunAtMs: 1_700_086_400_000,
      sessionKey: "agent:main:cron:job-abc12345:run:xyz",
    });

    expect(record).toMatchObject({
      id: "job-abc12345-1700000000000",
      jobName: "Morning digest",
      status: "success",
      runStatus: "ok",
      executionTime: 1_700_000_000_000,
      durationMs: 2500,
      summary: "All clear.",
      deliveryStatus: "delivered",
      model: "gpt-5.5",
      provider: "openai",
      usage: { total_tokens: 42 },
      sessionKey: "agent:main:cron:job-abc12345:run:xyz",
    });
  });

  it("falls back to truncated job id when job name is missing", () => {
    const record = mapGatewayCronRunEntry({
      ts: 1,
      jobId: "abcdefghijklmnop",
    });

    expect(record.jobName).toBe("\u2026klmnop");
    expect(isCronRunJobDeleted(record)).toBe(true);
  });
});

describe("cron run detail labels", () => {
  it("formats labels and usage", () => {
    expect(runStatusLabel("skipped")).toBe("Skipped");
    expect(deliveryStatusLabel("not-delivered")).toBe("Not delivered");
    expect(formatRunUsageSummary({ input_tokens: 10, output_tokens: 5 })).toBe("10 in / 5 out");
    expect(formatRunHistoryDuration(undefined)).toBe("\u2014");
  });

  it("chooses body source and meta error visibility", () => {
    expect(getCronRunBodySource({ summary: "Done", error: "Oops" })).toBe("Done");
    expect(getCronRunBodySource({ error: "Oops" })).toBe("Oops");
    expect(getCronRunBodySource({})).toBe("No summary.");
    expect(shouldShowRunErrorInMeta({ summary: "Done", error: "Oops" })).toBe(true);
    expect(shouldShowRunErrorInMeta({ error: "Oops" })).toBe(false);
  });

  it("formats next run label for future and past times", () => {
    const now = 1_700_000_000_000;
    expect(formatRunNextLabel(now + 3_600_000, now)).toMatch(/^Next in /);
    expect(formatRunNextLabel(now - 3_600_000, now)).toMatch(/^Due .* ago$/);
  });
});
