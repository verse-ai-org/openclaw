import { beforeEach, describe, expect, it } from "vitest";
import {
  cancelPendingInteractionsForSession,
  forgetPendingInteraction,
  getPendingInteraction,
  registerPendingInteraction,
  resetPendingInteractionsForTest,
  resolvePendingInteraction,
} from "./runner-suspend.js";

describe("runner-suspend", () => {
  beforeEach(() => {
    resetPendingInteractionsForTest();
  });

  it("register + resolve updates status and stores result", () => {
    const entry = registerPendingInteraction({
      sessionKey: "s1",
      runId: "r1",
      interactionId: "i1",
      component: "question_flow",
    });
    const outcome = resolvePendingInteraction({
      interactionId: "i1",
      sessionKey: "s1",
      status: "submitted",
      data: { answers: {} },
    });
    expect(outcome.ok).toBe(true);
    expect(outcome.alreadyResolved).toBe(false);
    expect(entry.status).toBe("submitted");
    expect(entry.lastResult?.status).toBe("submitted");
    expect(entry.lastResult?.data).toEqual({ answers: {} });
  });

  it("resolving twice is idempotent (returns previous result)", () => {
    registerPendingInteraction({
      sessionKey: "s1",
      runId: "r1",
      interactionId: "i2",
      component: "question_flow",
    });
    const first = resolvePendingInteraction({
      interactionId: "i2",
      sessionKey: "s1",
      status: "submitted",
      data: { v: 1 },
    });
    const second = resolvePendingInteraction({
      interactionId: "i2",
      sessionKey: "s1",
      status: "submitted",
      data: { v: 2 }, // should be ignored
    });
    expect(first.alreadyResolved).toBe(false);
    expect(second.alreadyResolved).toBe(true);
    expect(second.data).toEqual({ v: 1 });
  });

  it("rejects sessionKey mismatch", () => {
    registerPendingInteraction({
      sessionKey: "s1",
      runId: "r1",
      interactionId: "i3",
      component: "question_flow",
    });
    const outcome = resolvePendingInteraction({
      interactionId: "i3",
      sessionKey: "s-evil",
      status: "submitted",
      data: {},
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.error).toMatch(/sessionKey mismatch/);
  });

  it("cancelPendingInteractionsForSession cancels pending entries and stores result", () => {
    const a = registerPendingInteraction({
      sessionKey: "s1",
      runId: "r1",
      interactionId: "iA",
      component: "option_list",
    });
    const b = registerPendingInteraction({
      sessionKey: "s1",
      runId: "r1",
      interactionId: "iB",
      component: "option_list",
    });
    const c = registerPendingInteraction({
      sessionKey: "s2",
      runId: "r2",
      interactionId: "iC",
      component: "option_list",
    });
    const cancelled = cancelPendingInteractionsForSession("s1", "aborted");
    expect(cancelled).toBe(2);
    expect(a.status).toBe("cancelled");
    expect(a.lastResult?.status).toBe("cancelled");
    expect(b.status).toBe("cancelled");
    expect(b.lastResult?.status).toBe("cancelled");
    expect(getPendingInteraction("iC")?.status).toBe("pending");
    // cleanup
    resolvePendingInteraction({
      interactionId: "iC",
      sessionKey: "s2",
      status: "submitted",
      data: {},
    });
    expect(c.status).toBe("submitted");
  });

  it("forgetPendingInteraction removes the entry", () => {
    registerPendingInteraction({
      sessionKey: "s1",
      runId: "r1",
      interactionId: "iF",
      component: "question_flow",
    });
    expect(getPendingInteraction("iF")).toBeTruthy();
    forgetPendingInteraction("iF");
    expect(getPendingInteraction("iF")).toBeUndefined();
  });
});
