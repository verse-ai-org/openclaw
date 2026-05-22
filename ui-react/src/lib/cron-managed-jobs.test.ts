import { describe, expect, it } from "vitest";
import {
  filterUserVisibleCronJobs,
  isManagedMemoryDreamingCronJob,
  MANAGED_MEMORY_DREAMING_CRON_NAME,
  MANAGED_MEMORY_DREAMING_CRON_TAG,
  MEMORY_DREAMING_SYSTEM_EVENT_TEXT,
} from "./cron-managed-jobs";
import type { CronJob } from "@/types/agents";

function baseJob(overrides: Partial<CronJob> = {}): CronJob {
  return {
    id: "job-1",
    name: "Daily standup",
    enabled: true,
    schedule: { kind: "cron", expr: "0 9 * * *" },
    sessionTarget: "main",
    wakeMode: "now",
    payload: { kind: "agentTurn", message: "Run standup" },
    ...overrides,
  };
}

describe("isManagedMemoryDreamingCronJob", () => {
  it("matches managed dreaming jobs by description tag", () => {
    const job = baseJob({
      name: "Anything",
      description: `${MANAGED_MEMORY_DREAMING_CRON_TAG} nightly sweep`,
      payload: { kind: "agentTurn", message: "other" },
    });
    expect(isManagedMemoryDreamingCronJob(job)).toBe(true);
  });

  it("matches managed dreaming jobs by name and agentTurn token", () => {
    const job = baseJob({
      name: MANAGED_MEMORY_DREAMING_CRON_NAME,
      payload: { kind: "agentTurn", message: MEMORY_DREAMING_SYSTEM_EVENT_TEXT, lightContext: true },
      delivery: { mode: "none" },
    });
    expect(isManagedMemoryDreamingCronJob(job)).toBe(true);
  });

  it("matches managed dreaming jobs by name and systemEvent token", () => {
    const job = baseJob({
      name: MANAGED_MEMORY_DREAMING_CRON_NAME,
      payload: { kind: "systemEvent", text: MEMORY_DREAMING_SYSTEM_EVENT_TEXT },
    });
    expect(isManagedMemoryDreamingCronJob(job)).toBe(true);
  });

  it("does not match user tasks with similar names", () => {
    const job = baseJob({
      name: MANAGED_MEMORY_DREAMING_CRON_NAME,
      payload: { kind: "agentTurn", message: "Summarize inbox" },
    });
    expect(isManagedMemoryDreamingCronJob(job)).toBe(false);
  });
});

describe("filterUserVisibleCronJobs", () => {
  it("removes managed dreaming jobs from the list", () => {
    const managed = baseJob({
      id: "managed",
      name: MANAGED_MEMORY_DREAMING_CRON_NAME,
      description: MANAGED_MEMORY_DREAMING_CRON_TAG,
      payload: { kind: "agentTurn", message: MEMORY_DREAMING_SYSTEM_EVENT_TEXT },
    });
    const user = baseJob({ id: "user", name: "Weekly report" });
    expect(filterUserVisibleCronJobs([managed, user])).toEqual([user]);
  });
});
