import { describe, expect, it, vi } from "vitest";
import {
  buildHashWithSessionKey,
  getSessionKeyFromHash,
  setSessionKeyInHash,
} from "./url-session";

describe("session-manager/url-session", () => {
  it("parses sessionKey from hash query", () => {
    expect(getSessionKeyFromHash("#/chat?sessionKey=agent%3Atravel%3Amain")).toBe(
      "agent:travel:main",
    );
    expect(getSessionKeyFromHash("#/chat")).toBeUndefined();
  });

  it("builds hash with preserved query params", () => {
    const nextHash = buildHashWithSessionKey("#/chat?foo=1", "agent:travel:main");
    expect(nextHash).toContain("sessionKey=agent%3Atravel%3Amain");
    expect(nextHash).toContain("foo=1");
  });

  it("setSessionKeyInHash is no-op without window", () => {
    const originalWindow = globalThis.window;
    vi.stubGlobal("window", undefined);
    expect(() => setSessionKeyInHash("agent:travel:main")).not.toThrow();
    vi.stubGlobal("window", originalWindow);
  });
});
