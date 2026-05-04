import { beforeEach, describe, expect, it, vi } from "vitest";
import { useRunProjectionStore } from "@/run-projection/store";
import { useRunStatusStore } from "@/run-status/store";
import { useChatStore } from "@/store/chat.store";
import { useSettingsStore } from "@/store/settings.store";
import {
  deleteSessionAction,
  newSessionAction,
  switchSessionAction,
} from "./actions";
import type { SessionEntry } from "./types";

function resetChatState() {
  useRunProjectionStore.getState().reset();
  useRunStatusStore.getState().reset();
  useChatStore.setState({
    messages: [],
    messagesLoading: false,
    runId: null,
    sending: false,
    sessionKey: "agent:travel:abc12345",
    pendingHistoryReloadKey: null,
    pendingSessionsReloadSeq: 0,
    lastError: null,
    pendingDraftMessage: null,
  });
}

describe("session-manager/actions", () => {
  beforeEach(() => {
    resetChatState();
  });

  it("switchSessionAction updates active session and delegates history load", async () => {
    const loadHistory = vi.fn(async () => {});
    const syncRunStatus = vi.fn(async () => {});
    const persistSessionKey = vi.fn();
    const updateSpy = vi.spyOn(useSettingsStore.getState(), "updateSettings");

    await switchSessionAction({
      key: "agent:travel:main",
      loadHistory,
      syncRunStatus,
      persistSessionKey,
    });

    expect(useChatStore.getState().sessionKey).toBe("agent:travel:main");
    expect(loadHistory).toHaveBeenCalledWith("agent:travel:main");
    expect(syncRunStatus).toHaveBeenCalledWith("agent:travel:main");
    expect(persistSessionKey).toHaveBeenCalledWith("agent:travel:main");
    expect(updateSpy).toHaveBeenCalledWith({
      sessionKey: "agent:travel:main",
      lastActiveSessionKey: "agent:travel:main",
    });
  });

  it("deleteSessionAction switches to agent main when deleting active session", async () => {
    const request = vi.fn(async () => ({}));
    const switchSession = vi.fn<(key: string) => Promise<void>>(async () => {});
    const setSessions = vi.fn(
      (updater: SessionEntry[] | ((prev: SessionEntry[]) => SessionEntry[])) =>
        typeof updater === "function"
          ? updater([
              { key: "agent:travel:abc12345" },
              { key: "agent:travel:other" },
            ])
          : updater,
    );

    const result = await deleteSessionAction({
      key: "agent:travel:abc12345",
      client: { connected: true, request } as never,
      setSessions,
      switchSession,
    });

    expect(result).toEqual({ ok: true });
    expect(request).toHaveBeenCalledWith("sessions.delete", {
      key: "agent:travel:abc12345",
      deleteTranscript: true,
    });
    expect(switchSession).toHaveBeenCalledWith("agent:travel:main");
  });

  it("newSessionAction inserts session and switches to it", async () => {
    const switchSession = vi.fn<(key: string) => Promise<void>>(async () => {});
    const setSessions = vi.fn();

    await newSessionAction({
      agentId: "travel",
      client: { connected: true } as never,
      setSessions,
      switchSession,
    });

    expect(setSessions).toHaveBeenCalledTimes(1);
    expect(switchSession).toHaveBeenCalledTimes(1);
    const createdKey = switchSession.mock.calls[0][0] as string;
    expect(createdKey.startsWith("agent:travel:")).toBe(true);
  });
});
