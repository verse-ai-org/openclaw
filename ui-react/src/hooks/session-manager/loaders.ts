import type { MutableRefObject } from "react";
import { useChatStore } from "@/store/chat.store";
import type { IGatewayClient } from "@/store/gateway.store";
import type { RawMessage } from "@/hooks/chat-event-bridge";
import { logChatDebug } from "@/lib/chat-debug";
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
      logChatDebug("debug", "sync run status: active run restored", {
        activeRunId: result.activeRunId,
      }, {
        channel: "session.history",
        sessionKey,
      });
      return;
    }
    useChatStore.getState().clearSessionGenerating(sessionKey);
    logChatDebug("debug", "sync run status: no active run", undefined, {
      channel: "session.history",
      sessionKey,
    });
  } catch {
    // Non-critical: older gateway versions may not support chat.status.
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
  logChatDebug("debug", "load sessions start", undefined, {
    channel: "session.list",
    sessionKey,
  });
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
    logChatDebug("debug", "load sessions success", {
      count: result?.sessions?.length ?? 0,
    }, {
      channel: "session.list",
      sessionKey,
    });
  } catch {
    setSessions([{ key: sessionKey }]);
    logChatDebug("warn", "load sessions failed; using fallback session", undefined, {
      channel: "session.list",
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
  logChatDebug("debug", "load history start", {
    requestSeq,
    silent,
  }, {
    channel: "session.history",
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
      logChatDebug(
        "debug",
        "skip stale history response",
        { requestSeq, key, activeSessionKey },
        { channel: "session.history", sessionKey: key },
      );
      return;
    }

    useChatStore.getState().setMessages(consolidated);
    logChatDebug("debug", "load history applied", {
      requestSeq,
      count: consolidated.length,
    }, {
      channel: "session.history",
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
      logChatDebug("error", "load history failed", { requestSeq, err }, {
        channel: "session.history",
        sessionKey: key,
      });
      console.error("[session] load history failed:", err);
    }
  } finally {
    if (requestSeq === historyRequestSeqRef.current) {
      useChatStore.getState().setMessagesLoading(false);
    }
  }
}
