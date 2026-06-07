import { describe, expect, it } from "vitest";
import { resolveArtifactChipIcon } from "./artifact-chip-icon";

describe("resolveArtifactChipIcon", () => {
  it("maps PDF mime to pdf.svg", () => {
    expect(resolveArtifactChipIcon({ mimeType: "application/pdf" })).toEqual({
      kind: "pdf",
      type: "asset",
      src: "/pdf.svg",
    });
  });

  it("maps Word mime to word.svg", () => {
    expect(
      resolveArtifactChipIcon({
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      }),
    ).toEqual({
      kind: "word",
      type: "asset",
      src: "/word.svg",
    });
  });

  it("maps Excel mime to excel.svg", () => {
    expect(
      resolveArtifactChipIcon({
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
    ).toEqual({
      kind: "excel",
      type: "asset",
      src: "/excel.svg",
    });
  });

  it("maps plain text mime to txt.svg", () => {
    expect(resolveArtifactChipIcon({ mimeType: "text/plain" })).toEqual({
      kind: "text",
      type: "asset",
      src: "/txt.svg",
    });
  });

  it("maps structured text mime types to dedicated icons", () => {
    expect(resolveArtifactChipIcon({ mimeType: "application/json" })).toEqual({
      kind: "text",
      type: "asset",
      src: "/json.svg",
    });
    expect(resolveArtifactChipIcon({ mimeType: "application/xml" })).toEqual({
      kind: "text",
      type: "asset",
      src: "/xml.svg",
    });
    expect(resolveArtifactChipIcon({ mimeType: "text/markdown" })).toEqual({
      kind: "text",
      type: "asset",
      src: "/markdown.svg",
    });
    expect(resolveArtifactChipIcon({ mimeType: "text/csv" })).toEqual({
      kind: "text",
      type: "asset",
      src: "/csv.svg",
    });
  });

  it("maps image and audio mime to lucide icons", () => {
    expect(resolveArtifactChipIcon({ mimeType: "image/png" })).toEqual({
      kind: "image",
      type: "lucide",
      lucide: "image",
    });
    expect(resolveArtifactChipIcon({ mimeType: "audio/mpeg" })).toEqual({
      kind: "audio",
      type: "lucide",
      lucide: "audio",
    });
  });

  it("falls back to file extension when mime is generic", () => {
    expect(
      resolveArtifactChipIcon({
        mimeType: "application/octet-stream",
        fileName: "report.pdf",
      }),
    ).toEqual({
      kind: "pdf",
      type: "asset",
      src: "/pdf.svg",
    });
    expect(
      resolveArtifactChipIcon({
        mimeType: "application/octet-stream",
        fileName: "notes.md",
      }),
    ).toEqual({
      kind: "text",
      type: "asset",
      src: "/markdown.svg",
    });
    expect(
      resolveArtifactChipIcon({
        mimeType: "application/octet-stream",
        fileName: "data.json",
      }),
    ).toEqual({
      kind: "text",
      type: "asset",
      src: "/json.svg",
    });
    expect(
      resolveArtifactChipIcon({
        mimeType: "application/octet-stream",
        fileName: "sheet.csv",
      }),
    ).toEqual({
      kind: "text",
      type: "asset",
      src: "/csv.svg",
    });
    expect(
      resolveArtifactChipIcon({
        mimeType: "application/octet-stream",
        fileName: "config.xml",
      }),
    ).toEqual({
      kind: "text",
      type: "asset",
      src: "/xml.svg",
    });
    expect(
      resolveArtifactChipIcon({
        mimeType: "application/octet-stream",
        fileName: "readme.txt",
      }),
    ).toEqual({
      kind: "text",
      type: "asset",
      src: "/txt.svg",
    });
  });

  it("falls back to generic file lucide icon", () => {
    expect(
      resolveArtifactChipIcon({
        mimeType: "application/octet-stream",
        fileName: "archive.bin",
      }),
    ).toEqual({
      kind: "file",
      type: "lucide",
      lucide: "file",
    });
  });
});
