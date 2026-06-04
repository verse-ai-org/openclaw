import { describe, expect, it } from "vitest";
import { enrichChatFinalBroadcastPayload } from "./chat-final-artifacts.js";

describe("enrichChatFinalBroadcastPayload", () => {
  it("adds artifactRefs and wire-safe artifacts for assistant image blocks", () => {
    const { message, artifacts } = enrichChatFinalBroadcastPayload({
      sessionKey: "agent:main:main",
      runId: "run-1",
      message: {
        role: "assistant",
        content: [{ type: "image", data: "aGVsbG8=", mimeType: "image/png", alt: "out.png" }],
        __openclaw: { seq: 2 },
      },
    });
    const refs = message?.artifactRefs as Array<{ artifactId: string; role?: string }> | undefined;
    expect(refs).toHaveLength(1);
    expect(refs?.[0]?.role).toBe("output");
    expect(artifacts).toHaveLength(1);
    expect(artifacts?.[0]?.title).toBe("out.png");
    expect(artifacts?.[0]).not.toHaveProperty("data");
    expect(artifacts?.[0]?.download).toEqual({ mode: "bytes" });
  });

  it("returns empty extras when message is missing", () => {
    expect(
      enrichChatFinalBroadcastPayload({
        sessionKey: "agent:main:main",
        runId: "run-1",
      }),
    ).toEqual({});
  });
});
