import { describe, expect, it } from "vitest";
import { mergeArtifactMediaIntoAttachments } from "./merge-attachment-media";
import type { ArtifactSummary } from "@/components/chat/types";

describe("mergeArtifactMediaIntoAttachments", () => {
  it("binds mediaRef using inbound filename stem matching", () => {
    const artifacts: ArtifactSummary[] = [
      {
        id: "artifact_abc",
        type: "image",
        title: "ScreenShot_2026-06-03_203549_149---uuid.png",
        mimeType: "image/png",
        mediaRef: "media://inbound/ScreenShot_2026-06-03_203549_149---uuid.png",
        download: { mode: "bytes" },
      },
    ];
    const merged = mergeArtifactMediaIntoAttachments(
      [
        {
          fileName: "ScreenShot_2026-06-03_203549_149.png",
          mimeType: "image/png",
          size: 0,
          previewUrl: "blob:local",
        },
      ],
      artifacts,
    );
    expect(merged?.[0]).toMatchObject({
      fileName: "ScreenShot_2026-06-03_203549_149.png",
      mediaRef: artifacts[0]?.mediaRef,
      previewUrl: "blob:local",
    });
  });

  it("binds mediaRef for non-image attachments by exact title", () => {
    const merged = mergeArtifactMediaIntoAttachments(
      [{ fileName: "report.pdf", mimeType: "application/pdf", size: 0 }],
      [
        {
          id: "artifact_pdf",
          type: "file",
          title: "report.pdf",
          mimeType: "application/pdf",
          mediaRef: "media://inbound/report.pdf",
          download: { mode: "unsupported" },
        },
      ],
    );
    expect(merged?.[0]?.mediaRef).toBe("media://inbound/report.pdf");
  });
});
