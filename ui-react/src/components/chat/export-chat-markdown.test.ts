import { describe, expect, it } from "vitest";
import { buildChatMarkdown, exportChatMarkdown } from "./export-chat-markdown";
import type { ChatMessage } from "./types";

describe("buildChatMarkdown", () => {
  it("returns null for empty history", () => {
    expect(buildChatMarkdown([], "Assistant")).toBeNull();
  });

  it("formats user and assistant messages with timestamps", () => {
    const messages: ChatMessage[] = [
      {
        id: "u1",
        role: "user",
        content: "Hello",
        ts: Date.UTC(2026, 0, 1, 12, 0),
      },
      {
        id: "a1",
        role: "assistant",
        content: "Hi there",
        ts: Date.UTC(2026, 0, 1, 12, 1),
        contentBlocks: [{ type: "text", text: "Hi there" }],
      },
    ];
    const md = buildChatMarkdown(messages, "Travel Agent");
    expect(md).toContain("# Chat with Travel Agent");
    expect(md).toContain("## You (2026-01-01T12:00:00.000Z)");
    expect(md).toContain("Hello");
    expect(md).toContain("## Travel Agent (2026-01-01T12:01:00.000Z)");
    expect(md).toContain("Hi there");
  });

  it("includes attachment hints for user messages", () => {
    const md = buildChatMarkdown(
      [
        {
          id: "u1",
          role: "user",
          content: "",
          ts: 1,
          attachments: [{ fileName: "notes.pdf", mimeType: "application/pdf", size: 100 }],
        },
      ],
      "Assistant",
    );
    expect(md).toContain("[Attachments: notes.pdf]");
  });
});

describe("exportChatMarkdown", () => {
  it("returns false when there is nothing to export", () => {
    expect(exportChatMarkdown([], "Assistant")).toBe(false);
  });
});
