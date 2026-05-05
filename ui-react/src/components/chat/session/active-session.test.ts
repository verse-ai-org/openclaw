import { describe, expect, it } from "vitest";
import { resolveActiveChatSessionKey } from "./active-session";

describe("resolveActiveChatSessionKey", () => {
  it("prefers non-blank chat session over settings", () => {
    expect(resolveActiveChatSessionKey("  agent:a:main  ", "main")).toBe(
      "agent:a:main",
    );
  });

  it("falls back to settings when chat is null or blank", () => {
    expect(resolveActiveChatSessionKey(null, "  agent:b:side  ")).toBe(
      "agent:b:side",
    );
    expect(resolveActiveChatSessionKey("", "main")).toBe("main");
    expect(resolveActiveChatSessionKey("   ", "agent:x:1")).toBe("agent:x:1");
  });

  it("defaults to main when both missing or blank", () => {
    expect(resolveActiveChatSessionKey(null, null)).toBe("main");
    expect(resolveActiveChatSessionKey(undefined, undefined)).toBe("main");
    expect(resolveActiveChatSessionKey("", "")).toBe("main");
  });
});

