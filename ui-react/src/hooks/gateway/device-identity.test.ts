import { describe, expect, it } from "vitest";
import { buildDevicePayload } from "./device-identity";

describe("gateway/device-identity", () => {
  it("builds v2 pipe payload with scopes and token", () => {
    const payload = buildDevicePayload({
      deviceId: "device-1",
      clientId: "openclaw-control-ui",
      clientMode: "webchat",
      signedAtMs: 123456,
      nonce: "nonce-1",
      token: "token-abc",
      role: "operator",
      scopes: ["operator.admin", "operator.approvals"],
    });

    expect(payload).toBe(
      "v2|device-1|openclaw-control-ui|webchat|operator|operator.admin,operator.approvals|123456|token-abc|nonce-1",
    );
  });

  it("uses empty token segment when token is null", () => {
    const payload = buildDevicePayload({
      deviceId: "device-2",
      clientId: "openclaw-control-ui",
      clientMode: "webchat",
      signedAtMs: 42,
      nonce: "nonce-2",
      token: null,
      role: "operator",
      scopes: ["operator.admin"],
    });

    expect(payload).toBe(
      "v2|device-2|openclaw-control-ui|webchat|operator|operator.admin|42||nonce-2",
    );
  });
});
