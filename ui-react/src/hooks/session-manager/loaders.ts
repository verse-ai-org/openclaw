import type { MutableRefObject } from "react";
import { useChatStore } from "@/store/chat.store";
import { useConversationStore } from "@/store/conversation.store";
import type { IGatewayClient } from "@/store/gateway.store";
import type { RawMessage } from "@/components/chat/gateway";
import {
  mergeHistoryRuns,
  serializeGatewayHistoryToCanonicalSnapshot,
} from "@/components/chat/serialization";
import { useSessionsStore } from "@/store/sessions.store";
import { enrichSessionsFromLocalConversation } from "./enrich-sessions-from-conversation";
import type { SessionEntry, SessionsListDefaults } from "./types";

type ChatHistoryResponse = {
  messages?: unknown[];
  hasMore?: boolean;
  nextBeforeTs?: number | null;
};

const DEFAULT_CHAT_HISTORY_LIMIT = 500;

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
      useConversationStore.getState().setActiveRunSnapshot(
        sessionKey,
        result.activeRunId,
        result.startedAtMs,
      );

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

      // console.log("[session-manager] sync run status: active run restored", {
      //   activeRunId: result.activeRunId,
      //   sessionKey
      // });

      return;
    }
    useConversationStore.getState().setActiveRunSnapshot(sessionKey, result.activeRunId, null);
    // console.log("[session-manager] sync run status: no active run", {
    //   sessionKey,
    //   activeRunId: result.activeRunId,
    // });
  } catch (err) {
    console.warn("[session-manager] sync run status failed", {
      sessionKey,
      activeRunId: null,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

type SessionsListResponse = {
  sessions?: SessionEntry[];
  defaults?: SessionsListDefaults;
};

export async function loadSessionsFromGateway(params: {
  client: IGatewayClient | null;
  sessionKey: string;
  setLoading?: (loading: boolean) => void;
  setSessions?: (updater: SessionEntry[] | ((prev: SessionEntry[]) => SessionEntry[])) => void;
}) {
  const { client, sessionKey } = params;
  const setLoading = params.setLoading ?? useSessionsStore.getState().setLoading;
  const setSessions = params.setSessions ?? useSessionsStore.getState().setSessions;
  const setDefaults = useSessionsStore.getState().setDefaults;
  if (!client?.connected) {
    return;
  }
  setLoading(true);
  try {
    const result = await client.request<SessionsListResponse>("sessions.list", {
      includeDerivedTitles: true,
      includeLastMessage: true,
    });
    setSessions(enrichSessionsFromLocalConversation(result?.sessions ?? []));
    setDefaults(result?.defaults ?? null);
  } catch {
    setSessions([{ key: sessionKey }]);
    setDefaults(null);
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
  // console.log("[session-manager] load history start", {
  //   requestSeq,
  //   silent,
  //   sessionKey: key,
  // });

  if (!silent) {
    // Reset conversation thread before loading new history.
    useConversationStore.getState().resetThread(key);
    // Reset sending state when switching sessions to avoid stale running UI.
    chatState.setSending(false);
    chatState.setLastError(null);
  }
  chatState.setMessagesLoading(true);

  try {
    const result = await client.request<ChatHistoryResponse>("chat.history", {
      sessionKey: key,
      limit: DEFAULT_CHAT_HISTORY_LIMIT,
    });
    // console.log("result", result);
    const rawMessages = (Array.isArray(result?.messages)
      ? result.messages
      : []) as RawMessage[];
    const activeSession = useSessionsStore
      .getState()
      .sessions.find((s) => s.key === key);
    const defaultCtx = useSessionsStore.getState().defaults?.contextTokens;
    const contextWindow =
      (typeof activeSession?.contextTokens === "number" && activeSession.contextTokens > 0
        ? activeSession.contextTokens
        : null) ??
      (typeof defaultCtx === "number" && defaultCtx > 0 ? defaultCtx : null);
    const { messages: canonicalMessages, runs: historyRuns } = serializeGatewayHistoryToCanonicalSnapshot({
      threadId: key,
      messages: rawMessages,
      contextWindow,
    });
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

    // Feed canonical conversation snapshot (thread-level reducer).
    useConversationStore.getState().setHistoryCanonicalSnapshot(key, canonicalMessages, Date.now(), historyRuns);
    useConversationStore.getState().setHistoryPagingState(key, {
      oldestBeforeTs: typeof result?.nextBeforeTs === "number" ? result.nextBeforeTs : null,
      hasMore: Boolean(result?.hasMore),
      loadingOlder: false,
    });
    // console.log("[session-manager] load history applied", {
    //   requestSeq,
    //   count: canonicalMessages.length,
    //   sessionKey: key,
    // });
    const latestMsg = canonicalMessages.at(-1);
    if (latestMsg?.role === "assistant") {
      // No-op: run status is now derived from conversation state.
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

export async function loadOlderHistoryFromGateway(params: {
  client: IGatewayClient | null;
  key: string;
}) {
  const { client, key } = params;
  if (!client?.connected) return;

  const store = useConversationStore.getState();
  const paging = store.historyPagingByThread[key];
  const beforeTs = paging?.oldestBeforeTs;
  if (!beforeTs || paging?.loadingOlder) return;
  if (paging && paging.hasMore === false) return;

  store.setHistoryPagingState(key, { loadingOlder: true });
  try {
    const result = await client.request<ChatHistoryResponse>("chat.history", {
      sessionKey: key,
      limit: DEFAULT_CHAT_HISTORY_LIMIT,
      beforeTs,
    });
    const rawMessages = (Array.isArray(result?.messages) ? result.messages : []) as RawMessage[];
    const activeSession = useSessionsStore
      .getState()
      .sessions.find((s) => s.key === key);
    const defaultCtx = useSessionsStore.getState().defaults?.contextTokens;
    const contextWindow =
      (typeof activeSession?.contextTokens === "number" && activeSession.contextTokens > 0
        ? activeSession.contextTokens
        : null) ??
      (typeof defaultCtx === "number" && defaultCtx > 0 ? defaultCtx : null);
    const { messages: olderCanonical, runs: olderRuns } = serializeGatewayHistoryToCanonicalSnapshot({
      threadId: key,
      messages: rawMessages,
      contextWindow,
    });

    // Merge by id, sort by createdAt; then rebuild snapshot (simpler + robust).
    const current = store.byThread[key];
    const currentMessages: import("@/components/chat/conversation").CanonicalMessage[] = [];
    const currentRuns = current ? [...current.runsById.values()] : [];
    if (current) {
      for (const id of current.messageOrder) {
        const msg = current.messagesById.get(id);
        if (msg) currentMessages.push(msg);
      }
    }

    const byId = new Map<string, import("@/components/chat/conversation").CanonicalMessage>();
    for (const m of olderCanonical) byId.set(m.id, m);
    for (const m of currentMessages) byId.set(m.id, m);
    const merged = Array.from(byId.values()).toSorted((a, b) => {
      return a.createdAt - b.createdAt || a.id.localeCompare(b.id);
    });
    const mergedRuns = mergeHistoryRuns(olderRuns, currentRuns);
    store.setHistoryCanonicalSnapshot(key, merged, Date.now(), mergedRuns);

    store.setHistoryPagingState(key, {
      oldestBeforeTs: typeof result?.nextBeforeTs === "number" ? result.nextBeforeTs : null,
      hasMore: Boolean(result?.hasMore),
      loadingOlder: false,
    });
  } catch (err) {
    console.warn("[session-manager] load older history failed", {
      sessionKey: key,
      err: err instanceof Error ? err.message : String(err),
    });
    store.setHistoryPagingState(key, { loadingOlder: false });
  }
}
