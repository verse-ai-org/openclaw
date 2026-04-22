import { beforeEach, describe, expect, it } from "vitest";
import { useChatStore } from "@/store/chat.store";

function resetInteractions() {
  useChatStore.setState({ interactions: {} });
}

describe("chat.store — interactions slice", () => {
  beforeEach(() => {
    resetInteractions();
  });

  it("upsertInteraction creates a pending entry", () => {
    useChatStore.getState().upsertInteraction({
      interactionId: "i1",
      component: "question_flow",
      payload: { id: "i1" },
      schemaVersion: 1,
    });
    const entry = useChatStore.getState().interactions.i1;
    expect(entry).toBeDefined();
    expect(entry?.status).toBe("pending");
    expect(entry?.component).toBe("question_flow");
    expect(typeof entry?.createdAt).toBe("number");
  });

  it("upsertInteraction preserves createdAt + response across re-upserts", () => {
    useChatStore.getState().upsertInteraction({
      interactionId: "i1",
      component: "question_flow",
      payload: { id: "i1" },
      schemaVersion: 1,
    });
    const originalCreated = useChatStore.getState().interactions.i1?.createdAt;
    useChatStore.getState().setInteractionResponse("i1", {
      status: "submitted",
      response: { answers: { q: "a" } },
    });

    // Re-upsert (e.g. event replayed) should not reset response/createdAt.
    useChatStore.getState().upsertInteraction({
      interactionId: "i1",
      component: "question_flow",
      payload: { id: "i1" },
      schemaVersion: 1,
    });
    const after = useChatStore.getState().interactions.i1;
    expect(after?.createdAt).toBe(originalCreated);
    expect(after?.response).toEqual({ answers: { q: "a" } });
    expect(after?.status).toBe("submitted");
  });

  it("setInteractionResponse is a no-op for unknown ids", () => {
    useChatStore.getState().setInteractionResponse("ghost", {
      status: "submitted",
      response: {},
    });
    expect(useChatStore.getState().interactions.ghost).toBeUndefined();
  });

  it("cancelInteraction only transitions pending entries", () => {
    useChatStore.getState().upsertInteraction({
      interactionId: "i1",
      component: "option_list",
      payload: { id: "i1" },
      schemaVersion: 1,
    });
    useChatStore.getState().cancelInteraction("i1");
    expect(useChatStore.getState().interactions.i1?.status).toBe("cancelled");

    // second cancel on already-cancelled should no-op (status unchanged).
    useChatStore.getState().cancelInteraction("i1", "timed_out");
    expect(useChatStore.getState().interactions.i1?.status).toBe("cancelled");
  });

  it("resetInteractions clears the slice", () => {
    useChatStore.getState().upsertInteraction({
      interactionId: "i1",
      component: "question_flow",
      payload: {},
      schemaVersion: 1,
    });
    expect(Object.keys(useChatStore.getState().interactions)).toHaveLength(1);
    useChatStore.getState().resetInteractions();
    expect(useChatStore.getState().interactions).toEqual({});
  });
});
