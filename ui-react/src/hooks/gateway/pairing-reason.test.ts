import { describe, expect, it } from "vitest";
import { parsePairingRequestId } from "./pairing-reason";

describe("parsePairingRequestId", () => {
  it("extracts requestId from pairing close reason", () => {
    expect(
      parsePairingRequestId(
        "pairing required: device is not approved yet (requestId: ccc20cf2-2ae6-4497-9368-d97b95f6c1f4)",
      ),
    ).toBe("ccc20cf2-2ae6-4497-9368-d97b95f6c1f4");
  });

  it("returns null when requestId is absent", () => {
    expect(parsePairingRequestId("pairing required")).toBeNull();
  });
});
