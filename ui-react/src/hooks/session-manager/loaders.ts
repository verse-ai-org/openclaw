import type { MutableRefObject } from "react";
import { useChatStore } from "@/store/chat.store";
import type { IGatewayClient } from "@/store/gateway.store";
import type { RawMessage } from "@/hooks/chat-event-bridge";
import { logChatDebug } from "@/lib/chat-debug";
import { normalizeHistoryMessages } from "./history-normalize";
import type { SessionEntry } from "./types";
import type { InteractiveSummaryPair } from "@/store/chat.store";

type InteractionSubmittedPayload = {
  version: 1;
  kind: string;
  mode?: string;
  data: Record<string, unknown>;
  summary?: Array<{ question: string; answer: string }>;
  displayText?: string;
};

function parseInteractionSummary(payload: unknown): InteractiveSummaryPair[] | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const raw = payload as { summary?: unknown; data?: unknown };
  const data =
    raw.data && typeof raw.data === "object"
      ? (raw.data as { summary?: unknown })
      : undefined;
  const summary = raw.summary ?? data?.summary;
  if (!Array.isArray(summary)) {
    return null;
  }
  const pairs = summary
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }
      const question = (entry as { question?: unknown }).question;
      const answer = (entry as { answer?: unknown }).answer;
      if (typeof question !== "string" || typeof answer !== "string") {
        return null;
      }
      return { question, answer };
    })
    .filter((entry): entry is InteractiveSummaryPair => entry != null);
  return pairs.length > 0 ? pairs : null;
}

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
    try {
      const interactionResult = await client.request<{
        interactions?: Array<{
          id?: unknown;
          status?: unknown;
          submittedPayload?: InteractionSubmittedPayload;
        }>;
      }>("chat.interaction.list", {
        sessionKey: key,
        statuses: ["submitted", "consumed"],
      });
      const interactions = Array.isArray(interactionResult?.interactions)
        ? interactionResult.interactions
        : [];
      for (const item of interactions) {
        const interactiveId =
          typeof item.id === "string" && item.id.trim() ? item.id.trim() : "";
        if (!interactiveId) {
          continue;
        }
        const pairs = parseInteractionSummary(item.submittedPayload);
        if (!pairs) {
          continue;
        }
        useChatStore.getState().setInteractiveSummary(interactiveId, pairs);
        if (item.status === "consumed") {
          useChatStore.getState().markInteractiveSubmittedAck(interactiveId);
          useChatStore.getState().markInteractiveConsumedAck(interactiveId);
        } else if (item.status === "submitted") {
          useChatStore.getState().markInteractiveSubmittedAck(interactiveId);
          useChatStore.getState().clearInteractiveConsumedAck(interactiveId);
        } else {
          useChatStore.getState().clearInteractiveSubmittedAck(interactiveId);
          useChatStore.getState().clearInteractiveConsumedAck(interactiveId);
        }
      }
    } catch {
      // Optional hydration for newer interaction APIs.
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
