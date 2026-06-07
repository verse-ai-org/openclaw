import { describe, expect, it, vi } from "vitest";
import {
  hasInlineImageForRef,
  resolveArtifactChipInteraction,
  resolveArtifactPrimaryInteraction,
  resolveArtifactRenderType,
  resolveArtifactSecondaryInteraction,
} from "./artifact-renderer-registry";

vi.mock("@/utils/electron-env", () => ({
  getElectronBridge: () => ({ isElectron: true }),
}));

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

  it("resolves assistant pdf preview as primary with download secondary", () => {
    const primary = resolveArtifactPrimaryInteraction({
      summary: {
        id: "artifact_pdf",
        type: "file",
        title: "report.pdf",
        source: "assistant-output",
        role: "output",
        download: { mode: "bytes" },
      },
      renderType: "file",
      mimeType: "application/pdf",
      downloadMode: "bytes",
      source: "assistant-output",
      role: "output",
      isElectron: false,
    });
    expect(primary).toBe("preview-file");
    expect(resolveArtifactSecondaryInteraction(primary)).toBe("download-file");
  });

  it("resolves path-ref reveal when localRevealPath is present", () => {
    expect(
      resolveArtifactPrimaryInteraction({
        summary: {
          id: "artifact_doc",
          type: "file",
          title: "doc.pdf",
          ingestChannel: "path-ref",
          localRevealPath: "/tmp/doc.pdf",
          download: { mode: "unsupported" },
        },
        renderType: "file",
        mimeType: "application/pdf",
        downloadMode: "unsupported",
        ingestChannel: "path-ref",
        isElectron: true,
      }),
    ).toBe("reveal-in-folder");
  });

  it("resolves staging copy reveal as secondary when stagingRevealPath exists", () => {
    const summary = {
      id: "artifact_doc",
      type: "file",
      title: "doc.pdf",
      ingestChannel: "path-ref" as const,
      localRevealPath: "/tmp/doc.pdf",
      stagingRevealPath: "/workspace/staging/doc.pdf",
      download: { mode: "unsupported" as const },
    };
    const primary = resolveArtifactPrimaryInteraction({
      summary,
      renderType: "file",
      mimeType: "application/pdf",
      downloadMode: "unsupported",
      ingestChannel: "path-ref",
      isElectron: true,
    });
    expect(primary).toBe("reveal-in-folder");
    expect(resolveArtifactSecondaryInteraction(primary, { summary, isElectron: true })).toBe(
      "reveal-staging-in-folder",
    );
  });

  it("falls back to none for path-ref without localRevealPath", () => {
    expect(
      resolveArtifactPrimaryInteraction({
        summary: {
          id: "artifact_doc",
          type: "file",
          title: "doc.pdf",
          ingestChannel: "path-ref",
          download: { mode: "unsupported" },
        },
        renderType: "file",
        mimeType: "application/pdf",
        downloadMode: "unsupported",
        ingestChannel: "path-ref",
        isElectron: true,
      }),
    ).toBe("none");
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
    ).toBe("preview-file");
  });
});
