import { describe, expect, it, vi } from "vitest";
import {
  buildMessageWithAttachments,
  type ChatAttachment,
  extractMediaAttachedLineHints,
  extractPathRefHintsFromMessageText,
  parseMessageWithAttachments,
  splitUserMessageForChatHistoryDisplay,
  stripExtractedFileContentAppendix,
  stripMediaAttachedLines,
} from "./chat-attachments.js";

const PNG_1x1 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/woAAn8B9FD5fHAAAAAASUVORK5CYII=";

async function parseWithWarnings(message: string, attachments: ChatAttachment[]) {
  const logs: string[] = [];
  const parsed = await parseMessageWithAttachments(message, attachments, {
    log: { warn: (warning) => logs.push(warning) },
  });
  return { parsed, logs };
}

describe("buildMessageWithAttachments", () => {
  it("embeds a single image as data URL", () => {
    const msg = buildMessageWithAttachments("see this", [
      {
        type: "image",
        mimeType: "image/png",
        fileName: "dot.png",
        content: PNG_1x1,
      },
    ]);
    expect(msg).toContain("see this");
    expect(msg).toContain(`data:image/png;base64,${PNG_1x1}`);
    expect(msg).toContain("![dot.png]");
  });

  it("rejects non-image mime types", () => {
    const bad: ChatAttachment = {
      type: "file",
      mimeType: "application/pdf",
      fileName: "a.pdf",
      content: "AAA",
    };
    expect(() => buildMessageWithAttachments("x", [bad])).toThrow(/image/);
  });
});

describe("parseMessageWithAttachments", () => {
  it("strips data URL prefix", async () => {
    const parsed = await parseMessageWithAttachments(
      "see this",
      [
        {
          type: "image",
          mimeType: "image/png",
          fileName: "dot.png",
          content: `data:image/png;base64,${PNG_1x1}`,
        },
      ],
      { log: { warn: () => {} } },
    );
    expect(parsed.images).toHaveLength(1);
    expect(parsed.images[0]?.mimeType).toBe("image/png");
    expect(parsed.images[0]?.data).toBe(PNG_1x1);
  });

  it("drops attachments when mime type is missing", async () => {
    const { parsed, logs } = await parseWithWarnings("see this", [
      {
        type: "image",
        fileName: "dot.png",
        content: PNG_1x1,
      },
    ]);
    expect(parsed.message).toBe("see this");
    expect(parsed.images).toHaveLength(0);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatch(/missing mime type/i);
  });

  it("drops non-image payloads and logs", async () => {
    const pdf = Buffer.from("%PDF-1.4\n").toString("base64");
    const { parsed, logs } = await parseWithWarnings("x", [
      {
        type: "file",
        mimeType: "image/png",
        fileName: "not-image.pdf",
        content: pdf,
      },
    ]);
    expect(parsed.images).toHaveLength(0);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatch(/non-image/i);
  });

  it("prefers sniffed mime type and logs mismatch", async () => {
    const { parsed, logs } = await parseWithWarnings("x", [
      {
        type: "image",
        mimeType: "image/jpeg",
        fileName: "dot.png",
        content: PNG_1x1,
      },
    ]);
    expect(parsed.images).toHaveLength(1);
    expect(parsed.images[0]?.mimeType).toBe("image/png");
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatch(/mime mismatch/i);
  });

  it("drops missing mime attachments before sniff and logs", async () => {
    const unknown = Buffer.from("not an image").toString("base64");
    const { parsed, logs } = await parseWithWarnings("x", [
      { type: "file", fileName: "unknown.bin", content: unknown },
    ]);
    expect(parsed.images).toHaveLength(0);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatch(/missing mime type/i);
  });

  it("keeps valid images and drops invalid ones", async () => {
    const pdf = Buffer.from("%PDF-1.4\n").toString("base64");
    const { parsed, logs } = await parseWithWarnings("x", [
      {
        type: "image",
        mimeType: "image/png",
        fileName: "dot.png",
        content: PNG_1x1,
      },
      {
        type: "file",
        mimeType: "image/png",
        fileName: "not-image.pdf",
        content: pdf,
      },
    ]);
    expect(parsed.images).toHaveLength(1);
    expect(parsed.images[0]?.mimeType).toBe("image/png");
    expect(parsed.images[0]?.data).toBe(PNG_1x1);
    expect(logs.some((l) => /non-image/i.test(l))).toBe(true);
  });
});

describe("shared attachment validation", () => {
  it("rejects invalid base64 content for both builder and parser", async () => {
    const bad: ChatAttachment = {
      type: "image",
      mimeType: "image/png",
      fileName: "dot.png",
      content: "%not-base64%",
    };

    expect(() => buildMessageWithAttachments("x", [bad])).toThrow(/base64/i);
    await expect(
      parseMessageWithAttachments("x", [bad], { log: { warn: () => {} } }),
    ).rejects.toThrow(/base64/i);
  });

  it("rejects images over limit for both builder and parser without decoding base64", async () => {
    const big = "A".repeat(10_000);
    const att: ChatAttachment = {
      type: "image",
      mimeType: "image/png",
      fileName: "big.png",
      content: big,
    };

    const fromSpy = vi.spyOn(Buffer, "from");
    try {
      expect(() => buildMessageWithAttachments("x", [att], { maxBytes: 16 })).toThrow(
        /exceeds size limit/i,
      );
      await expect(
        parseMessageWithAttachments("x", [att], { maxBytes: 16, log: { warn: () => {} } }),
      ).rejects.toThrow(/exceeds size limit/i);
      const base64Calls = fromSpy.mock.calls.filter((args) => (args as unknown[])[1] === "base64");
      expect(base64Calls).toHaveLength(0);
    } finally {
      fromSpy.mockRestore();
    }
  });
});

describe("stripExtractedFileContentAppendix", () => {
  it("removes content after the \\n\\n marker when user text exists", () => {
    const prompt = "summarize this";
    const appendix = "\n\nUploaded file contents:\n\n[File: a.pdf]\nlong text";
    expect(stripExtractedFileContentAppendix(prompt + appendix)).toBe(prompt);
  });

  it("clears to empty when only extracted heading and blocks", () => {
    expect(stripExtractedFileContentAppendix("Uploaded file contents:\n\n[File: x.pdf]\nx")).toBe("");
  });
});

describe("stripMediaAttachedLines", () => {
  it("removes standalone media attached lines", () => {
    const raw = [
      "hello",
      "[media attached: media://inbound/a.png (image/png) | media://inbound/a.png]",
      "world",
    ].join("\n");
    expect(stripMediaAttachedLines(raw)).toBe("hello\nworld");
  });
});

describe("extractMediaAttachedLineHints", () => {
  it("parses inbound media refs from transcript user text", () => {
    const raw = [
      "[media attached: media://inbound/川西5天小环线完美结束_1_十一_来自小红书网页版---e0967595-2063-4b90-9f1e-77e72daf10c5.jpg (image/jpeg) | media://inbound/川西5天小环线完美结束_1_十一_来自小红书网页版---e0967595-2063-4b90-9f1e-77e72daf10c5.jpg]",
      "[Thu 2026-06-04 21:16 GMT+8] 查看一下这张图片的尺寸和格式信息",
    ].join("\n");
    expect(extractMediaAttachedLineHints(raw)).toEqual([
      {
        fileName: "川西5天小环线完美结束_1_十一_来自小红书网页版---e0967595-2063-4b90-9f1e-77e72daf10c5.jpg",
        mimeType: "image/jpeg",
        size: 0,
        mediaRef:
          "media://inbound/川西5天小环线完美结束_1_十一_来自小红书网页版---e0967595-2063-4b90-9f1e-77e72daf10c5.jpg",
      },
    ]);
  });
});

describe("extractPathRefHintsFromMessageText", () => {
  it("parses uploaded file reference lines from legacy agent-facing transcript text", () => {
    const text = [
      "[Fri 2026-06-05 16:19 GMT+8] edit pdf",
      "",
      "Uploaded file contents:",
      "",
      "[File: Skill白皮书.pdf]",
      "",
      "Routing hint: attachments are in reference mode.",
      "",
      "Uploaded File References:",
      "Use these exact local file paths when invoking file tools (read/write/edit/convert).",
      "- fileId=abc; path=/Users/me/Documents/Skill白皮书.pdf; name=Skill白皮书.pdf; mime=application/pdf; size=807961; sha256=deadbeef",
    ].join("\n");
    expect(extractPathRefHintsFromMessageText(text)).toEqual([
      {
        fileId: "abc",
        fileName: "Skill白皮书.pdf",
        mimeType: "application/pdf",
        size: 807961,
        localRevealPath: "/Users/me/Documents/Skill白皮书.pdf",
      },
    ]);
  });

  it("parses staged path-ref lines with sourcePath suffix", () => {
    const text = [
      "[Fri 2026-06-05 17:30 GMT+8] summarize",
      "",
      "Uploaded file contents:",
      "",
      "[File: Skill白皮书(去首尾页).pdf]",
      "",
      "Routing hint: this request looks like editing/conversion.",
      "",
      "Uploaded File References (staged copies where noted):",
      "Use staged copy paths when invoking file tools (read/write/edit/convert).",
      "- fileId=440d02b6; path=/Users/me/.openclaw/agents/my-office-helper/attachments/staging/run/440d02b6_Skill_________.pdf; name=Skill白皮书(去首尾页).pdf; mime=application/pdf; size=492717; sha256=440d02b6b1e79dd54c4d5fad90e0ba83fff0c3a312a859aa52cbac96fb2f95e3; sourcePath=/Users/me/Documents/文档/Skill白皮书(去首尾页).pdf",
    ].join("\n");
    expect(extractPathRefHintsFromMessageText(text)).toEqual([
      {
        fileId: "440d02b6",
        fileName: "Skill白皮书(去首尾页).pdf",
        mimeType: "application/pdf",
        size: 492717,
        localRevealPath: "/Users/me/Documents/文档/Skill白皮书(去首尾页).pdf",
        stagingRevealPath:
          "/Users/me/.openclaw/agents/my-office-helper/attachments/staging/run/440d02b6_Skill_________.pdf",
      },
    ]);
  });
});

describe("splitUserMessageForChatHistoryDisplay", () => {
  it("returns attachment hints from the appendix region", () => {
    const raw = ["hello", "", "Uploaded file contents:", "", "[File: doc.pdf]", "body"].join("\n");
    const { displayText, attachmentHints } = splitUserMessageForChatHistoryDisplay(raw);
    expect(displayText).toBe("hello");
    expect(attachmentHints).toEqual([
      { fileName: "doc.pdf", mimeType: "application/pdf", size: 0 },
    ]);
  });
});
