import { describe, expect, it } from "vitest";
import {
  isAlreadyResolvedPairingError,
  isRetryableGatewayPairingError,
  listHasControlUiPending,
  pickControlUiPendingRequest,
  shouldTreatClearedPendingAsApproved,
} from "../../apps/electron/src/main/device-pairing.helpers.js";

describe("device-pairing helpers", () => {
  it("prefers the latest openclaw-control-ui pending request", () => {
    const pending = [
      { requestId: "a", clientId: "other" },
      { requestId: "b", clientId: "openclaw-control-ui" },
      { requestId: "c", clientId: "openclaw-control-ui" },
    ];
    expect(pickControlUiPendingRequest(pending)?.requestId).toBe("c");
  });

  it("falls back to the latest pending request when no control-ui client exists", () => {
    const pending = [
      { requestId: "a", clientId: "cli" },
      { requestId: "b", clientId: "cli" },
    ];
    expect(pickControlUiPendingRequest(pending)?.requestId).toBe("b");
  });

  it("detects control-ui pending entries", () => {
    expect(listHasControlUiPending([{ requestId: "a", clientId: "cli" }])).toBe(false);
    expect(
      listHasControlUiPending([{ requestId: "a", clientId: "openclaw-control-ui" }]),
    ).toBe(true);
  });

  it("classifies retryable gateway startup errors", () => {
    expect(isRetryableGatewayPairingError(new Error("gateway starting; retry shortly"))).toBe(
      true,
    );
    expect(isRetryableGatewayPairingError(new Error("missing scope: operator.pairing"))).toBe(
      false,
    );
  });

  it("treats unknown requestId as already resolved", () => {
    expect(isAlreadyResolvedPairingError(new Error("unknown requestId"))).toBe(true);
  });

  it("stops polling after control-ui pending clears", () => {
    expect(
      shouldTreatClearedPendingAsApproved({
        sawControlUiPending: true,
        currentHasControlUiPending: false,
      }),
    ).toBe(true);
    expect(
      shouldTreatClearedPendingAsApproved({
        explicitRequestId: "ccc20cf2-2ae6-4497-9368-d97b95f6c1f4",
        sawControlUiPending: true,
        currentHasControlUiPending: false,
      }),
    ).toBe(false);
  });
});
