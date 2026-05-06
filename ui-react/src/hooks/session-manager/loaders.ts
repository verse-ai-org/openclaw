import type { MutableRefObject } from "react";
import { useChatStore } from "@/store/chat.store";
import type { IGatewayClient } from "@/store/gateway.store";
import type { RawMessage } from "@/components/chat/gateway";
import { normalizeHistoryMessages } from "./history-normalize";
import type { SessionEntry } from "./types";

export async function syncSessionRunStatusFromGateway(params: {
  client: IGatewayClient | null;
  sessionKey: string;
}) {
  const { client, sessionKey } = params;
  if (!client?.connected) {
    return;
  }
  try {
    const result = await client.request<{
      activeRunId: string | null;
      startedAtMs: number | null;
    }>("chat.status", { sessionKey });
    if (result?.activeRunId) {
      useChatStore
        .getState()
        .markSessionGenerating(sessionKey, result.activeRunId);

      try {
        await client.request("chat.tools.subscribe", {
          sessionKey,
          runId: result.activeRunId,
        });
      } catch {
        console.warn("[session-manager] tool subscribe failed", {
          activeRunId: result.activeRunId,
          sessionKey,
        });
      }

      console.log("[session-manager] sync run status: active run restored", {
        activeRunId: result.activeRunId,
        sessionKey
      });

      return;
    }
    useChatStore.getState().clearSessionGenerating(sessionKey);
    console.log("[session-manager] sync run status: no active run", {
      sessionKey
    });
  } catch {
    console.warn("[session-manager] sync run status failed", {
      sessionKey
    });
  }
}

export async function loadSessionsFromGateway(params: {
  client: IGatewayClient | null;
  sessionKey: string;
  setLoading: (loading: boolean) => void;
  setSessions: (updater: SessionEntry[] | ((prev: SessionEntry[]) => SessionEntry[])) => void;
}) {
  const { client, sessionKey, setLoading, setSessions } = params;
  if (!client?.connected) {
    return;
  }
  setLoading(true);
  try {
    const result = await client.request<{ sessions?: SessionEntry[] }>(
      "sessions.list",
      {
        includeDerivedTitles: true,
        includeLastMessage: true,
      },
    );
    setSessions(result?.sessions ?? []);
    console.log("[session-manager] load sessions success", {
      count: result?.sessions?.length ?? 0,
      sessionKey,
    });
  } catch {
    setSessions([{ key: sessionKey }]);
    console.warn("[session-manager] load sessions failed; using fallback session", {
      sessionKey,
    });
  } finally {
    setLoading(false);
  }
}

export async function loadHistoryFromGateway(params: {
  client: IGatewayClient | null;
  key: string;
  silent?: boolean;
  historyRequestSeqRef: MutableRefObject<number>;
}) {
  const { client, key, silent = false, historyRequestSeqRef } = params;
  if (!client?.connected) {
    return;
  }

  const requestSeq = ++historyRequestSeqRef.current;
  const chatState = useChatStore.getState();
  console.log("[session-manager] load history start", {
    requestSeq,
    silent,
    sessionKey: key,
  });

  if (!silent) {
    chatState.clearMessages();
    // Reset sending state when switching sessions to avoid stale running UI.
    chatState.setSending(false);
    chatState.setLastError(null);
  }
  chatState.setMessagesLoading(true);

  try {
    const result = await client.request<{ messages?: unknown[] }>("chat.history", {
      sessionKey: key,
    });
    const rawMessages = (Array.isArray(result?.messages)
      ? result.messages
      : []) as RawMessage[];
    const consolidated = normalizeHistoryMessages(rawMessages, key);

    const isLatest = requestSeq === historyRequestSeqRef.current;
    const activeSessionKey = useChatStore.getState().sessionKey;
    const isCurrentSession = !activeSessionKey || activeSessionKey === key;
    if (!isLatest || !isCurrentSession) {
      console.log("[session-manager] skip stale history response",
        {
          requestSeq,
          sessionKey: key,
          activeSessionKey
        }
      );
      return;
    }

    useChatStore.getState().setMessages(consolidated);
    console.log("[session-manager] load history applied", {
      requestSeq,
      count: consolidated.length,
      sessionKey: key,
    });
    const latestMsg = consolidated.at(-1);
    if (latestMsg?.role === "assistant") {
      const pending = useChatStore.getState().pendingGenerationBySession[key];
      const hasActiveRun = pending?.runId != null;
      if (!hasActiveRun) {
        useChatStore.getState().clearSessionGenerating(key);
      }
    }
  } catch (err) {
    if (requestSeq === historyRequestSeqRef.current) {
      console.error("[session-manager] load history failed",
        {
          requestSeq,
          sessionKey: key,
          err
        }
      );
    }
  } finally {
    if (requestSeq === historyRequestSeqRef.current) {
      useChatStore.getState().setMessagesLoading(false);
    }
  }
}
