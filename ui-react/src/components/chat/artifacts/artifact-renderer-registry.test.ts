import { describe, expect, it } from "vitest";
import {
  hasInlineImageForRef,
  resolveArtifactChipInteraction,
  resolveArtifactRenderType,
} from "./artifact-renderer-registry";

describe("artifact-renderer-registry", () => {
  it("classifies image artifacts for inline rendering", () => {
    expect(
      hasInlineImageForRef({
        artifactRef: { artifactId: "artifact_img" },
        summaries: [
          {
            id: "artifact_img",
            type: "image",
            title: "chart.png",
            mediaRef: "media://inbound/chart.png",
            download: { mode: "bytes" },
          },
        ],
        attachments: [],
      }),
    ).toBe(true);
  });

  it("gates chip preview by render type and download mode", () => {
    expect(
      resolveArtifactChipInteraction({
        renderType: resolveArtifactRenderType(
          {
            id: "artifact_img",
            type: "image",
            title: "chart.png",
            download: { mode: "bytes" },
          },
          "image/png",
        ),
        mimeType: "image/png",
        downloadMode: "bytes",
      }),
    ).toBe("preview-image");
    expect(
      resolveArtifactChipInteraction({
        renderType: "file",
        mimeType: "application/pdf",
        downloadMode: "unsupported",
      }),
    ).toBe("none");
    expect(
      resolveArtifactChipInteraction({
        renderType: "file",
        mimeType: "application/pdf",
        downloadMode: "bytes",
      }),
    ).toBe("download-file");
  });
});
