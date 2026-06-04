import { describe, expect, it } from "vitest";
import { resolveManagedSessionKey } from "./session-key";

describe("resolveManagedSessionKey", () => {
  it("prefers hash, then store, then settings, then lastActive", () => {
    expect(
      resolveManagedSessionKey({
        hashSessionKey: "agent:a:main",
        storeSessionKey: "agent:b:main",
        settingsSessionKey: "main",
        lastActiveSessionKey: "agent:c:main",
      }),
    ).toBe("agent:a:main");

    expect(
      resolveManagedSessionKey({
        storeSessionKey: "agent:b:main",
        settingsSessionKey: "main",
        lastActiveSessionKey: "agent:c:main",
      }),
    ).toBe("agent:b:main");

    expect(
      resolveManagedSessionKey({
        settingsSessionKey: "main",
        lastActiveSessionKey: "agent:c:main",
      }),
    ).toBe("main");

    expect(
      resolveManagedSessionKey({
        lastActiveSessionKey: "agent:c:main",
      }),
    ).toBe("agent:c:main");
  });
});
