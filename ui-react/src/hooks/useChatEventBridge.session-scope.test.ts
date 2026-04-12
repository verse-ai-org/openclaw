import { describe, expect, it, beforeEach } from "vitest";
import {
  getActiveChatSessionKey,
  isChatEventForActiveSession,
} from "@/hooks/useChatEventBridge";
import { useChatStore } from "@/store/chat.store";
import { useSettingsStore } from "@/store/settings.store";

describe("chat event session scoping", () => {
  beforeEach(() => {
    useChatStore.setState({
      sessionKey: null,
      messages: [],
      stream: null,
      runId: null,
      committedBlocks: [],
      toolStreamById: new Map(),
      toolStreamOrder: [],
      sending: false,
      pendingGenerationBySession: {},
    });
    useSettingsStore.getState().updateSettings({ sessionKey: "main" });
  });

  it("uses settings sessionKey when chat store has none", () => {
    expect(getActiveChatSessionKey()).toBe("main");
    expect(isChatEventForActiveSession("main")).toBe(true);
    expect(isChatEventForActiveSession("agent:a:other")).toBe(false);
  });

  it("prefers chat store sessionKey over settings", () => {
    useChatStore.getState().setSessionKey("agent:u1:main");
    useSettingsStore.getState().updateSettings({ sessionKey: "main" });
    expect(getActiveChatSessionKey()).toBe("agent:u1:main");
    expect(isChatEventForActiveSession("agent:u1:main")).toBe(true);
    expect(isChatEventForActiveSession("main")).toBe(false);
  });

  it("rejects blank or missing event session keys", () => {
    useChatStore.getState().setSessionKey("main");
    expect(isChatEventForActiveSession(undefined)).toBe(false);
    expect(isChatEventForActiveSession("")).toBe(false);
    expect(isChatEventForActiveSession("   ")).toBe(false);
  });

  it("keeps pendingGeneration when clearing thread messages (session switch)", () => {
    useChatStore.getState().markSessionGenerating("agent:u:side", "run-1");
    useChatStore.getState().clearMessages();
    expect(useChatStore.getState().pendingGenerationBySession["agent:u:side"]).toEqual({
      runId: "run-1",
    });
  });

  it("clearSessionGenerating removes pending state", () => {
    useChatStore.getState().markSessionGenerating("main", "r2");
    useChatStore.getState().clearSessionGenerating("main");
    expect(useChatStore.getState().pendingGenerationBySession.main).toBeUndefined();
  });
});
