import { useCallback, useEffect, useState } from "react";
import {
  normalizeContent,
  normalizeRole,
  extractToolCallParts,
  extractContentBlocks,
  mergeToolResults,
} from "@/hooks/useChatEventBridge";
import {
  useChatStore,
  registerHistoryReload,
  unregisterHistoryReload,
} from "@/store/chat.store";
import { useGatewayStore } from "@/store/gateway.store";
import { useSettingsStore } from "@/store/settings.store";

export interface SessionEntry {
  key: string;
  /** User-set label (e.g. via /label command). */
  label?: string;
  /** Backend-derived display name (channel name, group name, etc.). */
  displayName?: string;
  /** Title inferred from the first user message in the transcript. */
  derivedTitle?: string;
  /** Last message snippet for preview. */
  lastMessagePreview?: string;
  updatedAt?: number;
}

/**
 * Resolve the best human-readable display name for a session.
 * Priority: displayName > derivedTitle > label > key
 */
export function resolveSessionDisplayName(session: SessionEntry): string {
  return (
    session.displayName ?? session.derivedTitle ?? session.label ?? session.key
  );
}

export function useSessionManager() {
  const [sessions, setSessions] = useState<SessionEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const client = useGatewayStore((s) => s.client);
  const gatewayStatus = useGatewayStore((s) => s.status);
  const settings = useSettingsStore((s) => s.settings);
  const sessionKey =
    useChatStore((s) => s.sessionKey) ?? settings.sessionKey ?? "main";

  // Load session list from gateway
  const loadSessions = useCallback(async () => {
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
    } catch {
      setSessions([{ key: sessionKey }]);
    } finally {
      setLoading(false);
    }
  }, [client, sessionKey]);

  // Load history for a given session key
  const loadHistory = useCallback(
    async (key: string, silent = false) => {
      if (!client?.connected) {
        return;
      }
      if (!silent) {
        useChatStore.getState().clearMessages();
      }
      useChatStore.getState().setMessagesLoading(true);
      try {
        const result = await client.request<{ messages?: unknown[] }>(
          "chat.history",
          {
            sessionKey: key,
          },
        );
        if (Array.isArray(result?.messages)) {
          const merged = mergeToolResults(result.messages);
          const normalized = merged.map((m: unknown) => {
            const msg = m as Record<string, unknown>;
            return {
              id: (msg.id as string) ?? crypto.randomUUID(),
              role: normalizeRole(msg.role as string | undefined),
              content: normalizeContent(msg.content ?? msg.text ?? ""),
              ts: (msg.ts as number) ?? (msg.timestamp as number) ?? Date.now(),
              runId: msg.runId as string | undefined,
              sessionKey: key,
              toolCalls: extractToolCallParts(msg.content),
              contentBlocks: extractContentBlocks(msg.content),
            };
          });
          useChatStore.getState().setMessages(normalized);
          useChatStore.getState().setMessagesLoading(false);
        }
      } catch (err) {
        console.error("[session] load history failed:", err);
        useChatStore.getState().setMessagesLoading(false);
      }
    },
    [client],
  );

  // Switch to a session
  const switchSession = useCallback(
    async (key: string) => {
      useChatStore.getState().setSessionKey(key);
      useSettingsStore
        .getState()
        .updateSettings({ sessionKey: key, lastActiveSessionKey: key });
      await loadHistory(key);
    },
    [loadHistory],
  );

  // Create a new session, optionally scoped to an agentId.
  // When agentId is provided the session key is formatted as
  // "agent:<agentId>:<uuid8>" so Gateway routes the session to that agent.
  const newSession = useCallback(
    async (agentId?: string) => {
      if (!client?.connected) {
        return;
      }
      // Build a local key immediately so the sidebar renders the item right away.
      const localKey = agentId
        ? `agent:${agentId}:${crypto.randomUUID().slice(0, 8)}`
        : crypto.randomUUID().slice(0, 8);
      try {
        const result = await client.request<{ sessionKey?: string }>(
          "chat.session.new",
          {},
        );
        // Prefer the server-assigned key, but re-scope it to the target agent if
        // the server returned a generic key (e.g. a short uuid).
        const serverKey = result?.sessionKey;
        const newKey =
          agentId && serverKey && !serverKey.startsWith(`agent:${agentId}:`)
            ? localKey
            : (serverKey ?? localKey);
        setSessions((prev) => [...prev, { key: newKey }]);
        await switchSession(newKey);
      } catch {
        setSessions((prev) => [...prev, { key: localKey }]);
        await switchSession(localKey);
      }
    },
    [client, switchSession],
  );

  // Register reload callback for chat.final events
  useEffect(() => {
    registerHistoryReload((key) => void loadHistory(key, true));
    return () => {
      unregisterHistoryReload();
    };
  }, [loadHistory]);

  // Load sessions & history when connected
  useEffect(() => {
    if (gatewayStatus === "connected") {
      void loadSessions();
      void loadHistory(sessionKey);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gatewayStatus]);

  const activeSession = sessions.find((s) => s.key === sessionKey);
  const activeLabel = activeSession
    ? resolveSessionDisplayName(activeSession)
    : sessionKey;

  return {
    sessions,
    loading,
    sessionKey,
    activeLabel,
    switchSession,
    newSession,
  };
}
