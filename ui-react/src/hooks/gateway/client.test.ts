import { describe, expect, it } from "vitest";
import {
  isNonRecoverableGatewayClose,
  isNonRecoverableGatewayErrorCode,
} from "./client";

describe("gateway/client", () => {
  it("returns true for non-recoverable auth and pairing errors", () => {
    expect(isNonRecoverableGatewayErrorCode("AUTH_TOKEN_MISSING")).toBe(true);
    expect(isNonRecoverableGatewayErrorCode("PAIRING_REQUIRED")).toBe(true);
    expect(
      isNonRecoverableGatewayErrorCode("CONTROL_UI_DEVICE_IDENTITY_REQUIRED"),
    ).toBe(true);
  });

  it("returns false for recoverable or unknown errors", () => {
    expect(isNonRecoverableGatewayErrorCode(undefined)).toBe(false);
    expect(isNonRecoverableGatewayErrorCode("CONNECT_FAILED")).toBe(false);
    expect(isNonRecoverableGatewayErrorCode("SOME_UNKNOWN_CODE")).toBe(false);
  });

  it("treats auth rate limit and token mismatch close reasons as non-recoverable", () => {
    expect(
      isNonRecoverableGatewayClose({
        reason: "unauthorized: too many failed authentication attempts (retry later)",
      }),
    ).toBe(true);
    expect(
      isNonRecoverableGatewayClose({
        reason: "unauthorized: gateway token mismatch (open the dashboard URL)",
      }),
    ).toBe(true);
    expect(
      isNonRecoverableGatewayClose({
        reason: "pairing required: device is not approved yet (requestId: abc)",
      }),
    ).toBe(true);
  });
});
