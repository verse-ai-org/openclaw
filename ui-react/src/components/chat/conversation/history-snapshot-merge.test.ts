import { describe, expect, it } from "vitest";
import { emptyConversationState } from "./reducer";
import { mergeSilentHistorySnapshotWithLiveAssistantTurns } from "./history-snapshot-merge";
import type { CanonicalMessage, MessageId, PartId, RunId } from "./types";

describe("mergeSilentHistorySnapshotWithLiveAssistantTurns", () => {
  it("keeps live run assistant text when history snapshot omits the turn", () => {
    const runId = "run-1" as RunId;
    const liveMsg: CanonicalMessage = {
      id: `run:${runId}` as MessageId,
      role: "assistant",
      createdAt: 100,
      runId,
      status: "running",
      parts: [{ type: "text", id: "t1" as PartId, text: "streamed answer" }],
    };
    let prev = emptyConversationState("agent:test");
    prev = {
      ...prev,
      messagesById: new Map([[liveMsg.id, liveMsg]]),
      messageOrder: [liveMsg.id],
    };

    const incoming: CanonicalMessage[] = [
      {
        id: "u1" as MessageId,
        role: "user",
        createdAt: 50,
        status: "complete",
        parts: [{ type: "text", id: "u1t" as PartId, text: "hi" }],
      },
    ];

    const merged = mergeSilentHistorySnapshotWithLiveAssistantTurns(prev, incoming);
    const assistant = merged.find((m) => m.role === "assistant" && m.runId === runId);
    expect(assistant?.parts[0]?.type === "text" ? assistant.parts[0].text : "").toBe(
      "streamed answer",
    );
  });

  it("prefers prior text when history returns an empty assistant row for the same id", () => {
    const id = "run:run-2" as MessageId;
    const runId = "run-2" as RunId;
    const prior: CanonicalMessage = {
      id,
      role: "assistant",
      createdAt: 10,
      runId,
      status: "complete",
      parts: [{ type: "text", id: "t" as PartId, text: "kept" }],
    };
    let prev = emptyConversationState("agent:test");
    prev = {
      ...prev,
      messagesById: new Map([[id, prior]]),
      messageOrder: [id],
    };

    const incoming: CanonicalMessage[] = [
      {
        id,
        role: "assistant",
        createdAt: 10,
        runId,
        status: "complete",
        parts: [],
      },
    ];

    const merged = mergeSilentHistorySnapshotWithLiveAssistantTurns(prev, incoming);
    expect(merged[0]?.parts[0]?.type === "text" ? merged[0].parts[0].text : "").toBe("kept");
  });
});
