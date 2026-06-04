import { describe, expect, it } from "vitest";
import { EventType } from "./types";
import { replayConversation } from "./reducer";
import { runEventsToCanonical } from "./gateway-adapter";

describe("conversation/gateway-adapter", () => {
  it("does not map text.delta (chat.delta) to message.setLiveText — only final reconciles", () => {
    const threadId = "main";
    const runId = "r1";
    const canonical = runEventsToCanonical(
      [{ type: "text.delta", text: "hello from chat" }],
      threadId,
      runId,
      1,
    );
    expect(canonical.some((e) => e.type === EventType.MessageSetLiveText)).toBe(false);
  });

  it("preserves assistant text carried by run.finished (chat.final) frames", () => {
    const threadId = "main";
    const runId = "r1";
    const full = "hello final snapshot";

    const canonical = runEventsToCanonical(
      [{ type: "run.started", sessionKey: threadId, runId }, { type: "run.finished", text: full }],
      threadId,
      runId,
      100,
    );

    const state = replayConversation(canonical, threadId);
    const msg = state.messagesById.get(`run:${runId}`);
    expect(msg?.role).toBe("assistant");
    expect(msg?.status).toBe("complete");
    expect(msg?.parts.map((p) => p.type)).toEqual(["text"]);
    expect(msg?.parts[0]).toMatchObject({ type: "text", text: full });
  });

  it("binds assistant artifacts from run.finished (chat.final)", () => {
    const threadId = "main";
    const runId = "r1";
    const canonical = runEventsToCanonical(
      [
        { type: "run.started", sessionKey: threadId, runId },
        {
          type: "run.finished",
          text: "here is the chart",
          artifactRefs: [{ artifactId: "artifact_img", role: "output" }],
          artifacts: [
            {
              id: "artifact_img",
              type: "image",
              title: "chart.png",
              mimeType: "image/png",
              download: { mode: "bytes" },
            },
          ],
        },
      ],
      threadId,
      runId,
      200,
    );

    const state = replayConversation(canonical, threadId);
    const msg = state.messagesById.get(`run:${runId}`);
    expect(msg?.artifactRefs).toEqual([{ artifactId: "artifact_img", role: "output" }]);
    expect(msg?.artifacts?.[0]?.title).toBe("chart.png");
  });
});

