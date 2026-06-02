import { describe, expect, it } from "vitest";
import { emptyConversationState } from "@/components/chat/conversation";
import { isInteractionLocked } from "./ui-interaction-lock";

describe("isInteractionLocked", () => {
  it("returns true when sending", () => {
    expect(isInteractionLocked({ sending: true, conversation: undefined })).toBe(true);
  });

  it("returns true when active run is running", () => {
    const threadId = "main";
    let state = emptyConversationState(threadId);
    state = {
      ...state,
      activeRunId: "run-1" as never,
      runsById: new Map([
        [
          "run-1" as never,
          {
            id: "run-1" as never,
            threadId,
            status: "running",
            startedAt: 1,
          },
        ],
      ]),
    };
    expect(isInteractionLocked({ sending: false, conversation: state })).toBe(true);
  });

  it("returns false when idle", () => {
    const threadId = "main";
    const state = emptyConversationState(threadId);
    expect(isInteractionLocked({ sending: false, conversation: state })).toBe(false);
  });

  it("returns false when active run finished", () => {
    const threadId = "main";
    let state = emptyConversationState(threadId);
    state = {
      ...state,
      activeRunId: "run-1" as never,
      runsById: new Map([
        [
          "run-1" as never,
          {
            id: "run-1" as never,
            threadId,
            status: "finished",
            startedAt: 1,
            finishedAt: 2,
          },
        ],
      ]),
    };
    expect(isInteractionLocked({ sending: false, conversation: state })).toBe(false);
  });
});
