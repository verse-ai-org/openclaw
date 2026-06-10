import { describe, expect, it } from "vitest";
import {
  attachmentHintForArtifactRef,
  mergeInboundArtifactMediaIntoAttachments,
  resolveArtifactChipTitleTooltip,
} from "./artifact-helpers";
import type { ArtifactSummary } from "@/components/chat/types";

describe("mergeInboundArtifactMediaIntoAttachments", () => {
  it("binds mediaRef and drops blob preview when ack artifact matches upload fileName", () => {
    const artifacts: ArtifactSummary[] = [
      {
        id: "artifact_abc",
        type: "image",
        title: "ScreenShot_2026-06-03_203549_149---uuid.png",
        mimeType: "image/png",
        mediaRef:
          "media://inbound/ScreenShot_2026-06-03_203549_149---3adb8169-2b63-45f1-8459-9fe71673d5e2.png",
        download: { mode: "bytes" },
      },
    ];
    const merged = mergeInboundArtifactMediaIntoAttachments(
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
    });
    expect(merged?.[0]?.previewUrl).toBe("blob:local");
  });
});

describe("attachmentHintForArtifactRef", () => {
  it("falls back to summary title when positional hints are missing", () => {
    const hint = attachmentHintForArtifactRef(
      { artifactId: "artifact_b" },
      [{ artifactId: "artifact_a" }, { artifactId: "artifact_b" }],
      [{ fileName: "report.pdf", mimeType: "application/pdf", size: 0 }],
      [{ id: "artifact_b", type: "file", title: "report.pdf", download: { mode: "unsupported" } }],
    );
    expect(hint?.fileName).toBe("report.pdf");
  });

  it("matches attachment hints by summary title", () => {
    const hint = attachmentHintForArtifactRef(
      { artifactId: "artifact_b" },
      [{ artifactId: "artifact_b" }],
      [{ fileName: "report.pdf", mimeType: "application/pdf", size: 0 }],
      [{ id: "artifact_b", type: "file", title: "report.pdf", download: { mode: "unsupported" } }],
    );
    expect(hint?.fileName).toBe("report.pdf");
  });
});

describe("resolveArtifactChipTitleTooltip", () => {
  it("warns when path-ref lacks localRevealPath", () => {
    expect(
      resolveArtifactChipTitleTooltip({
        title: "report.pdf",
        summary: { ingestChannel: "path-ref" },
      }),
    ).toContain("cannot locate original file");
  });

  it("mentions staging menu when stagingRevealPath is present", () => {
    expect(
      resolveArtifactChipTitleTooltip({
        title: "report.pdf",
        summary: {
          ingestChannel: "path-ref",
          localRevealPath: "/tmp/report.pdf",
          stagingRevealPath: "/workspace/staging/report.pdf",
        },
      }),
    ).toContain("workspace copy");
  });

  it("warns that agent may modify original path-ref files", () => {
    expect(
      resolveArtifactChipTitleTooltip({
        title: "report.pdf",
        summary: {
          ingestChannel: "path-ref",
          localRevealPath: "/tmp/report.pdf",
        },
      }),
    ).toContain("may modify this file in place");
  });
});
