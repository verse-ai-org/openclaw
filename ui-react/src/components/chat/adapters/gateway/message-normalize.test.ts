import { describe, expect, it } from "vitest";
import {
  extractGatewayChatMessageText,
  extractMessageText,
  normalizeArtifactSummaries,
  normalizeHistoryArtifactRefs,
} from "./message-normalize";

describe("extractGatewayChatMessageText", () => {
  it("returns empty for non-objects", () => {
    expect(extractGatewayChatMessageText(null)).toBe("");
    expect(extractGatewayChatMessageText(undefined)).toBe("");
    expect(extractGatewayChatMessageText("x")).toBe("");
  });

  it("prefers top-level text field", () => {
    expect(
      extractGatewayChatMessageText({
        text: "hello",
        content: [{ type: "text", text: "ignored" }],
      }),
    ).toBe("hello");
  });

  it("concatenates text blocks in content without separators", () => {
    expect(
      extractGatewayChatMessageText({
        role: "assistant",
        content: [
          { type: "text", text: "a" },
          { type: "text", text: "b" },
        ],
      }),
    ).toBe("ab");
  });

  it("accepts string content", () => {
    expect(extractGatewayChatMessageText({ content: "plain" })).toBe("plain");
  });

  it("ignores non-text blocks in content array", () => {
    expect(
      extractGatewayChatMessageText({
        content: [{ type: "text", text: "x" }, { type: "image", url: "u" }, { type: "text", text: "y" }],
      }),
    ).toBe("xy");
  });
});

describe("extractMessageText", () => {
  it("joins multiple text blocks with newlines (history normalization)", () => {
    expect(
      extractMessageText({
        content: [
          { type: "text", text: "a" },
          { type: "text", text: "b" },
        ],
      }),
    ).toBe("a\nb");
  });
});

describe("normalizeHistoryArtifactRefs", () => {
  it("normalizes artifactId and role", () => {
    expect(
      normalizeHistoryArtifactRefs([
        { artifactId: "artifact_x", role: "input" },
        { id: "artifact_y", role: "output" },
      ]),
    ).toEqual([
      { artifactId: "artifact_x", role: "input" },
      { artifactId: "artifact_y", role: "output" },
    ]);
  });
});

describe("normalizeArtifactSummaries", () => {
  it("preserves gateway artifact metadata fields", () => {
    expect(
      normalizeArtifactSummaries([
        {
          id: "artifact_chart",
          type: "image",
          title: "chart.png",
          mimeType: "image/png",
          sizeBytes: 4096,
          sessionKey: "agent:main:main",
          runId: "run-1",
          taskId: "task-1",
          messageSeq: 3,
          contentIndex: 1,
          source: "assistant-output",
          role: "output",
          ingestChannel: "transcript-block",
          mediaRef: "media://inbound/chart.png",
          download: { mode: "bytes" },
        },
      ]),
    ).toEqual([
      {
        id: "artifact_chart",
        type: "image",
        title: "chart.png",
        mimeType: "image/png",
        sizeBytes: 4096,
        sessionKey: "agent:main:main",
        runId: "run-1",
        taskId: "task-1",
        messageSeq: 3,
        contentIndex: 1,
        source: "assistant-output",
        role: "output",
        ingestChannel: "transcript-block",
        mediaRef: "media://inbound/chart.png",
        download: { mode: "bytes" },
      },
    ]);
  });

  it("drops unknown source and ingestChannel values", () => {
    expect(
      normalizeArtifactSummaries([
        {
          id: "artifact_x",
          type: "file",
          title: "doc.pdf",
          source: "legacy",
          ingestChannel: "unknown",
          download: { mode: "unsupported" },
        },
      ]),
    ).toEqual([
      {
        id: "artifact_x",
        type: "file",
        title: "doc.pdf",
        download: { mode: "unsupported" },
      },
    ]);
  });
});

