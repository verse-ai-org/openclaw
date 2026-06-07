import { describe, expect, it } from "vitest";
import { resolveOutboundAttachments } from "./resolve-outbound-attachments";

describe("resolveOutboundAttachments", () => {
  it("includes non-image base64 attachments on Web (no path refs)", () => {
    const result = resolveOutboundAttachments({
      gatewayAttachments: [
        { content: "BASE64PDF", mimeType: "application/pdf", fileName: "report.pdf" },
      ],
      attachmentRefs: [],
      missingPathFiles: ["report.pdf"],
    });

    expect(result).toEqual({
      ok: true,
      base64Attachments: [
        { content: "BASE64PDF", mimeType: "application/pdf", fileName: "report.pdf" },
      ],
      attachmentRefs: [],
    });
  });

  it("sends images as base64 and documents as path refs on Electron", () => {
    const refs = [
      {
        fileId: "abc",
        path: "/tmp/report.pdf",
        fileName: "report.pdf",
        mimeType: "application/pdf",
        size: 100,
        sha256: "deadbeef",
      },
    ];
    const result = resolveOutboundAttachments({
      gatewayAttachments: [
        { content: "IMGB64", mimeType: "image/png", fileName: "chart.png" },
      ],
      attachmentRefs: refs,
      missingPathFiles: [],
    });

    expect(result).toEqual({
      ok: true,
      base64Attachments: [{ content: "IMGB64", mimeType: "image/png", fileName: "chart.png" }],
      attachmentRefs: refs,
    });
  });

  it("fails when non-image files lack both path and base64", () => {
    const result = resolveOutboundAttachments({
      gatewayAttachments: [],
      attachmentRefs: [],
      missingPathFiles: ["report.pdf"],
    });

    expect(result).toEqual({ ok: false, missingPathFiles: ["report.pdf"] });
  });
});
