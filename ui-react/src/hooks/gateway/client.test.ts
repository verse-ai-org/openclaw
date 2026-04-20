import { describe, expect, it } from "vitest";
import { isNonRecoverableGatewayErrorCode } from "./client";

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
});
