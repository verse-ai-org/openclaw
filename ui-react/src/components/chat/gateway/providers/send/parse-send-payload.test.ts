import { describe, expect, it } from "vitest";
import type { AppendMessage } from "@assistant-ui/react";
import { parseGatewaySendPayload } from "./parse-send-payload";

describe("parseGatewaySendPayload", () => {
  it("extracts image blocks into gatewayAttachments", () => {
    const message = {
      content: [
        { type: "text", text: "hello" },
        {
          type: "image",
          image: "AAA111",
        },
      ],
    } as unknown as AppendMessage;

    const parsed = parseGatewaySendPayload(message);

    expect(parsed.text).toBe("hello");
    expect(parsed.gatewayAttachments).toHaveLength(1);
    expect(parsed.gatewayAttachments[0]).toMatchObject({
      content: "AAA111",
      mimeType: "image/png",
    });
    expect(parsed.displayAttachments).toHaveLength(1);
    expect(parsed.displayAttachments[0].mimeType).toBe("image/png");
  });

  it("extracts image attachments from thread attachments", () => {
    const message = {
      content: [{ type: "text", text: "check this" }],
      attachments: [
        {
          status: { type: "complete" },
          name: "photo.jpg",
          contentType: "image/jpeg",
          file: { size: 1024 },
          content: [
            {
              type: "image",
              image: "BASE64DATA",
            },
          ],
        },
      ],
    } as unknown as AppendMessage;

    const parsed = parseGatewaySendPayload(message);

    expect(parsed.text).toBe("check this");
    expect(parsed.gatewayAttachments).toHaveLength(1);
    expect(parsed.gatewayAttachments[0]).toMatchObject({
      content: "BASE64DATA",
      mimeType: "image/jpeg",
      fileName: "photo.jpg",
    });
    expect(parsed.displayAttachments).toHaveLength(1);
  });

  it("keeps display attachment metadata for file type but does not inline content", () => {
    const message = {
      content: [{ type: "text", text: "with file" }],
      attachments: [
        {
          status: { type: "complete" },
          name: "doc.txt",
          contentType: "text/plain",
          file: { size: 42 },
          content: [
            {
              type: "file",
              data: "QkFTRTY0",
              mimeType: "text/plain",
              filename: "doc.txt",
            },
          ],
        },
      ],
    } as unknown as AppendMessage;

    const parsed = parseGatewaySendPayload(message);

    expect(parsed.text).toBe("with file");
    expect(parsed.gatewayAttachments).toEqual([]);
    expect(parsed.displayAttachments).toEqual([{ fileName: "doc.txt", mimeType: "text/plain", size: 42 }]);
  });
});

