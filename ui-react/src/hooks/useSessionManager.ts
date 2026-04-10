import { useCallback, useEffect, useState } from "react";
import {
  normalizeContent,
  normalizeRole,
  extractToolCallParts,
  extractContentBlocks,
  mergeToolResults,
  consolidateToolMessages,
  stripAttachmentContent,
} from "@/hooks/useChatEventBridge";
import { useChatStore, type MessageAttachment } from "@/store/chat.store";
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

  // Watch for pending history reload requests from the event bridge.
  // Using Zustand state instead of a global mutable function avoids
  // the single-registration limitation of the old _reloadHistory pattern.
  const pendingReloadKey = useChatStore((s) => s.pendingHistoryReloadKey);

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
          // Step 1: merge standalone toolResult messages into preceding assistant messages
          const merged = mergeToolResults(result.messages);
          const normalized = merged.map((m: unknown) => {
            const msg = m as Record<string, unknown>;
            const role = normalizeRole(msg.role as string | undefined);
            const rawContent = normalizeContent(msg.content ?? msg.text ?? "");
            // For user messages: strip gateway-injected file content blocks,
            // preserving only the user's prompt and extracting file names for display.
            let content = rawContent;
            let attachments: MessageAttachment[] | undefined;
            if (role === "user") {
              const stripped = stripAttachmentContent(rawContent);
              content = stripped.prompt;
              attachments = stripped.attachments.length > 0 ? stripped.attachments : undefined;
            }
            return {
              id: (msg.id as string) ?? crypto.randomUUID(),
              role,
              content,
              ts: (msg.ts as number) ?? (msg.timestamp as number) ?? Date.now(),
              runId: msg.runId as string | undefined,
              sessionKey: key,
              attachments,
              // Use stripped content for user messages so contentBlocks (used by
              // convertMessage for rendering) never contain injected file text.
              toolCalls: extractToolCallParts(content),
              contentBlocks: extractContentBlocks(content),
            };
          });
          // Step 2: merge consecutive tool-call-only assistant messages so
          // MessagePrimitive.Parts groups them under a single ToolGroup wrapper
          const consolidated = consolidateToolMessages(normalized);

          if (import.meta.env.DEV) {
            console.group("[loadHistory] pipeline");
            console.log(`raw=${result.messages.length} → merged=${merged.length} → normalized=${normalized.length} → consolidated=${consolidated.length}`);
            consolidated.slice(0, 20).forEach((m, i) => {
              const blocks = m.contentBlocks;
              const preview = blocks
                ? blocks.map(b => b.type === "tool-call" ? `tool:${b.toolName}` : `text:${b.text.slice(0,20)}`).join(", ")
                : `[no blocks] content=${m.content.slice(0,40)}`;
              console.log(`  [${i}] role=${m.role} blocks=[${preview}]`);
            });
            console.groupEnd();
          }

          useChatStore.getState().setMessages(consolidated);
          useChatStore.getState().setMessagesLoading(false);
        }
      } catch (err) {
        console.error("[session] load history failed:", err);
        useChatStore.getState().setMessagesLoading(false);
      }
    },
    [client],
  );

  // React to pending history reload requests (set by useChatEventBridge on chat:final)
  useEffect(() => {
    if (!pendingReloadKey) return;
    void loadHistory(pendingReloadKey, true);
    useChatStore.getState().setPendingHistoryReloadKey(null);
  }, [pendingReloadKey, loadHistory]);

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

  // Delete a session by key. Cannot delete the main session.
  const deleteSession = useCallback(
    async (key: string): Promise<{ ok: boolean; error?: string }> => {
      if (!client?.connected) {
        return { ok: false, error: "Not connected" };
      }
      try {
        await client.request("sessions.delete", { key, deleteTranscript: true });
        // Remove from local list
        setSessions((prev) => prev.filter((s) => s.key !== key));
        // If we just deleted the active session, switch to the agent's main session
        if (key === useChatStore.getState().sessionKey) {
          const match = /^agent:([^:]+):/.exec(key);
          const fallbackKey = match ? `agent:${match[1]}:main` : "main";
          await switchSession(fallbackKey);
        }
        return { ok: true };
      } catch (err) {
        console.error("[session] delete failed:", err);
        return { ok: false, error: String(err) };
      }
    },
    [client, switchSession],
  );

  // Create a new session, optionally scoped to an agentId.
  // Gateway has no chat.session.new; use client-side keys (same as previous catch fallback).
  const newSession = useCallback(
    async (agentId?: string) => {
      if (!client?.connected) {
        return;
      }
      const newKey = agentId
        ? `agent:${agentId}:${crypto.randomUUID().slice(0, 8)}`
        : crypto.randomUUID().slice(0, 8);
      setSessions((prev) => [...prev, { key: newKey }]);
      await switchSession(newKey);
    },
    [client, switchSession],
  );

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
    deleteSession,
  };
}
