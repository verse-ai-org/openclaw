import { describe, expect, it } from "vitest";
import { inboundImagesMatch } from "./inbound-image-dedupe";

describe("inboundImagesMatch", () => {
  it("matches upload fileName to offloaded mediaRef basename", () => {
    expect(
      inboundImagesMatch(
        "ScreenShot_2026-06-03_203549_149.png",
        "ScreenShot_2026-06-03_203549_149---3adb8169-2b63-45f1-8459-9fe71673d5e2.png",
      ),
    ).toBe(true);
  });

  it("matches media:// paths with different casing", () => {
    expect(
      inboundImagesMatch(
        "media://inbound/Photo.PNG",
        "media://inbound/photo---abc.png",
      ),
    ).toBe(true);
  });
});
