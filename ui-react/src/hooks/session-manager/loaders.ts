import type { MutableRefObject } from "react";
import { useChatStore } from "@/store/chat.store";
import type { IGatewayClient } from "@/store/gateway.store";
import type { RawMessage } from "@/hooks/chat-event-bridge";
import { logChatDebug } from "@/lib/chat-debug";
import {
  normalizeHistoryMessages,
  projectInteractionsFromHistory,
} from "./history-normalize";
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
    // Interactions live on a per-session slice; wipe before re-seeding.
    chatState.resetInteractions();
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
    const { interactions: interactionSeed } =
      projectInteractionsFromHistory(rawMessages);

    const interactionRows = rawMessages.filter((m) => {
      const role = typeof (m as { role?: unknown }).role === "string"
        ? (m as { role: string }).role
        : "";
      return role === "interaction_request" || role === "interaction_response";
    });
    const assistantRowsWithAsk = rawMessages.filter((m) => {
      const role = (m as { role?: string }).role;
      if (role !== "assistant") return false;
      const content = (m as { content?: unknown }).content;
      if (typeof content === "string") return content.includes("<ask");
      if (Array.isArray(content)) {
        return (content as Array<Record<string, unknown>>).some(
          (b) => b?.type === "text" && typeof b.text === "string" && b.text.includes("<ask"),
        );
      }
      return false;
    });
    const assistantMsgsWithInteractionBlock = consolidated.filter((m) =>
      m.role === "assistant" &&
      m.contentBlocks?.some((b) => b.type === "interaction"),
    );
    logChatDebug(
      "debug",
      "loadHistory: interaction / <ask> normalization snapshot",
      {
        raw: rawMessages.length,
        interactionRows: interactionRows.length,
        assistantRowsWithAsk: assistantRowsWithAsk.length,
        interactionSeedKeys: Object.keys(interactionSeed),
        assistantWithInteractionBlock: assistantMsgsWithInteractionBlock.map((m) => ({
          id: m.id,
          interactionBlocks: m.contentBlocks?.filter((b) => b.type === "interaction"),
        })),
      },
      { channel: "session.history", sessionKey: key },
    );
    if (assistantRowsWithAsk.length > 0 && assistantMsgsWithInteractionBlock.length === 0) {
      logChatDebug(
        "warn",
        "loadHistory: <ask> in raw assistant rows but no interaction blocks after normalize",
        { sample: assistantRowsWithAsk[0] },
        { channel: "session.history", sessionKey: key },
      );
    }

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
    // Seed the interactions slice so any `{type:"interaction"}` content part
    // hoisted from persisted assistant text finds its matching state.
    const seedIds = Object.keys(interactionSeed);
    if (seedIds.length > 0) {
      const st = useChatStore.getState();
      for (const id of seedIds) {
        const s = interactionSeed[id]!;
        st.upsertInteraction({
          interactionId: s.interactionId,
          component: s.component,
          payload: s.payload,
          schemaVersion: s.schemaVersion,
          cancellable: s.cancellable,
          status: s.status,
        });
        if (s.status !== "pending") {
          st.setInteractionResponse(s.interactionId, {
            status: s.status,
            response: s.response,
            responseBy: s.responseBy,
          });
        }
      }
      logChatDebug(
        "debug",
        "loadHistory: after seeding interactions slice",
        {
          entries: Object.entries(useChatStore.getState().interactions).map(([id, s]) => ({
            id,
            component: s.component,
            status: s.status,
            messageId: s.messageId,
          })),
        },
        { channel: "session.history", sessionKey: key },
      );
    }
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
