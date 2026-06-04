import { describe, expect, it } from "vitest";
import { buildInboundImageSources } from "./inbound-image-sources";

describe("buildInboundImageSources", () => {
  it("shows blob preview immediately for optimistic attachments", () => {
    const sources = buildInboundImageSources({
      attachments: [
        {
          fileName: "photo.png",
          mimeType: "image/png",
          size: 0,
          previewUrl: "blob:local",
        },
      ],
    });
    expect(sources).toEqual([
      {
        key: "blob:local",
        fileName: "photo.png",
        mimeType: "image/png",
        src: "blob:local",
      },
    ]);
  });

  it("dedupes blob preview and ack artifact, keeping instant blob src", () => {
    const sources = buildInboundImageSources({
      attachments: [
        {
          fileName: "ScreenShot_2026-06-03_203549_149.png",
          mimeType: "image/png",
          size: 0,
          previewUrl: "blob:local",
          mediaRef:
            "media://inbound/ScreenShot_2026-06-03_203549_149---3adb8169-2b63-45f1-8459-9fe71673d5e2.png",
        },
      ],
      artifacts: [
        {
          id: "artifact_abc",
          type: "image",
          title: "ScreenShot_2026-06-03_203549_149---uuid.png",
          mimeType: "image/png",
          mediaRef:
            "media://inbound/ScreenShot_2026-06-03_203549_149---3adb8169-2b63-45f1-8459-9fe71673d5e2.png",
          download: { mode: "bytes" },
        },
      ],
    });
    expect(sources).toHaveLength(1);
    expect(sources[0]?.src).toBe("blob:local");
    expect(sources[0]?.key).toMatch(/^media:\/\/inbound\//);
  });
});
