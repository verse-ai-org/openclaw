import { describe, expect, it } from "vitest";
import type { AppendMessage } from "@assistant-ui/react";
import { parseGatewaySendPayload } from "./send-payload";

describe("send-payload", () => {
  it("ignores image blocks from message content", () => {
    const message = {
      content: [
        { type: "text", text: "hello" },
        {
          type: "image",
          image: "data:image/png;base64,AAA111",
          filename: "img.png",
        },
      ],
    } as unknown as AppendMessage;

    const parsed = parseGatewaySendPayload(message);

    expect(parsed.text).toBe("hello");
    expect(parsed.gatewayAttachments).toEqual([]);
    expect(parsed.displayAttachments).toEqual([]);
  });

  it("keeps display attachment metadata but does not inline file content", () => {
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
    expect(parsed.displayAttachments).toEqual([
      { fileName: "doc.txt", mimeType: "text/plain", size: 42 },
    ]);
  });
});
