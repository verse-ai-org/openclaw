import { beforeEach, describe, expect, it } from "vitest";
import { useConversationStore } from "@/store/conversation.store";
import { enrichSessionsFromLocalConversation } from "./enrich-sessions-from-conversation";
import type { SessionEntry } from "./types";

describe("enrichSessionsFromLocalConversation", () => {
  const threadKey = "agent:demo:80e91251";

  beforeEach(() => {
    useConversationStore.getState().resetThread(threadKey);
  });

  it("replaces gateway id+date derivedTitle with first local user line", () => {
    useConversationStore.getState().setHistorySnapshot(threadKey, [
      {
        id: "u1",
        role: "user",
        content: "计划一个川西5日游",
        ts: 1,
      },
    ]);

    const sessions: SessionEntry[] = [
      {
        key: threadKey,
        derivedTitle: "80e91251 (2026-05-13)",
        updatedAt: Date.now(),
      },
    ];

    const out = enrichSessionsFromLocalConversation(sessions);
    expect(out[0]?.derivedTitle).toBe("计划一个川西5日游");
  });

  it("fills derivedTitle when missing and label is New Session", () => {
    useConversationStore.getState().setHistorySnapshot(threadKey, [
      { id: "u1", role: "user", content: "Hello there", ts: 1 },
    ]);

    const sessions: SessionEntry[] = [{ key: threadKey, label: "New Session" }];
    const out = enrichSessionsFromLocalConversation(sessions);
    expect(out[0]?.derivedTitle).toBe("Hello there");
  });

  it("does not override a real derivedTitle", () => {
    useConversationStore.getState().setHistorySnapshot(threadKey, [
      { id: "u1", role: "user", content: "ignored", ts: 1 },
    ]);

    const sessions: SessionEntry[] = [
      { key: threadKey, derivedTitle: "Already from server" },
    ];
    const out = enrichSessionsFromLocalConversation(sessions);
    expect(out[0]?.derivedTitle).toBe("Already from server");
  });

  it("does not override when user label is set", () => {
    useConversationStore.getState().setHistorySnapshot(threadKey, [
      { id: "u1", role: "user", content: "local", ts: 1 },
    ]);

    const sessions: SessionEntry[] = [
      { key: threadKey, label: "My label", derivedTitle: undefined },
    ];
    const out = enrichSessionsFromLocalConversation(sessions);
    expect(out[0]?.derivedTitle).toBeUndefined();
  });

  it("does not override when displayName is set", () => {
    useConversationStore.getState().setHistorySnapshot(threadKey, [
      { id: "u1", role: "user", content: "local", ts: 1 },
    ]);

    const sessions: SessionEntry[] = [
      { key: threadKey, displayName: "Channel name", derivedTitle: "Already from server" },
    ];
    const out = enrichSessionsFromLocalConversation(sessions);
    expect(out[0]?.derivedTitle).toBe("Already from server");
  });

  it("replaces routing channel derivedTitle with first local user line", () => {
    useConversationStore.getState().setHistorySnapshot(threadKey, [
      { id: "u1", role: "user", content: "通过微信发一条消息", ts: 1 },
    ]);

    const sessions: SessionEntry[] = [
      {
        key: threadKey,
        displayName: "openclaw-weixin:g-o9cabc",
        derivedTitle: "openclaw-weixin:g-o9cabc",
      },
    ];
    const out = enrichSessionsFromLocalConversation(sessions);
    expect(out[0]?.derivedTitle).toBe("通过微信发一条消息");
  });
});
