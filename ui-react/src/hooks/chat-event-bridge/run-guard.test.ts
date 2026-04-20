import { describe, expect, it } from "vitest";
import {
  normalizeRunId,
  normalizeSessionKey,
  shouldAcceptRunEvent,
} from "./run-guard";

describe("run-guard", () => {
  it("normalizes session keys and run ids", () => {
    expect(normalizeSessionKey("  agent:travel:main  ")).toBe("agent:travel:main");
    expect(normalizeSessionKey("")).toBe("");
    expect(normalizeSessionKey(undefined)).toBe("");

    expect(normalizeRunId("  run-1 ")).toBe("run-1");
    expect(normalizeRunId("")).toBeUndefined();
    expect(normalizeRunId(undefined)).toBeUndefined();
  });

  it("accepts first progress event and tracks active run", () => {
    const active = new Map<string, string>();
    const accepted = shouldAcceptRunEvent({
      activeRunBySession: active,
      sessionKey: "agent:travel:main",
      runId: "run-1",
      eventKind: "progress",
    });
    expect(accepted).toBe(true);
    expect(active.get("agent:travel:main")).toBe("run-1");
  });

  it("drops stale progress from different run in same session", () => {
    const active = new Map<string, string>([["agent:travel:main", "run-1"]]);
    const accepted = shouldAcceptRunEvent({
      activeRunBySession: active,
      sessionKey: "agent:travel:main",
      runId: "run-2",
      eventKind: "progress",
    });
    expect(accepted).toBe(false);
    expect(active.get("agent:travel:main")).toBe("run-1");
  });

  it("promotes a new run on start event", () => {
    const active = new Map<string, string>([["agent:travel:main", "run-1"]]);
    const accepted = shouldAcceptRunEvent({
      activeRunBySession: active,
      sessionKey: "agent:travel:main",
      runId: "run-2",
      eventKind: "start",
    });
    expect(accepted).toBe(true);
    expect(active.get("agent:travel:main")).toBe("run-2");
  });

  it("clears active run on terminal event for active run", () => {
    const active = new Map<string, string>([["agent:travel:main", "run-2"]]);
    const accepted = shouldAcceptRunEvent({
      activeRunBySession: active,
      sessionKey: "agent:travel:main",
      runId: "run-2",
      eventKind: "terminal",
    });
    expect(accepted).toBe(true);
    expect(active.has("agent:travel:main")).toBe(false);
  });
});
