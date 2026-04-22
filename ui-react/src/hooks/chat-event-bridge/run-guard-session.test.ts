import { describe, expect, it } from "vitest";
import {
  clearBridgeTrackedRunForSession,
  setBridgeRunGuardClearHandler,
} from "./run-guard-session";

describe("run-guard-session", () => {
  it("invokes registered handler with trimmed session key", () => {
    const seen: string[] = [];
    setBridgeRunGuardClearHandler((k) => {
      seen.push(k);
    });
    clearBridgeTrackedRunForSession("  main  ");
    expect(seen).toEqual(["main"]);
    setBridgeRunGuardClearHandler(null);
  });

  it("no-ops when session key is blank", () => {
    let calls = 0;
    setBridgeRunGuardClearHandler(() => {
      calls += 1;
    });
    clearBridgeTrackedRunForSession("   ");
    expect(calls).toBe(0);
    setBridgeRunGuardClearHandler(null);
  });
});
