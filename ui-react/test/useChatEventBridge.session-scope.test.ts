import { describe, expect, it, beforeEach } from "vitest";
import {
  getActiveChatSessionKey,
  isChatEventForActiveSession,
} from "@/hooks/chat-event-bridge";
import { useRunProjectionStore } from "@/run-projection/store";
import { useRunStatusStore } from "@/run-status/store";
import { useChatStore } from "@/store/chat.store";
import { useSettingsStore } from "@/store/settings.store";

describe("chat event session scoping", () => {
  beforeEach(() => {
    useRunProjectionStore.getState().reset();
    useRunStatusStore.getState().reset();
    useChatStore.setState({
      sessionKey: null,
      messages: [],
      runId: null,
      sending: false,
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

  it("clearing messages resets projection and run status", () => {
    useRunStatusStore.getState().dispatch({
      type: "RUN_PROGRESS_SEEN",
      sessionKey: "agent:u:side",
      runId: "run-1",
    });
    useChatStore.getState().clearMessages();
    expect(useRunStatusStore.getState().activeRunsBySession["agent:u:side"]).toBeUndefined();
  });
});
