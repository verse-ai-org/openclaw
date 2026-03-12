import { PlusIcon, MessageSquareIcon, ChevronDownIcon } from "lucide-react";
import { useCallback, useEffect, useState, type FC } from "react";
import { normalizeContent, normalizeRole, extractToolCallParts } from "@/hooks/useChatEventBridge";
import { cn } from "@/lib/utils";
import { useChatStore, registerHistoryReload, unregisterHistoryReload } from "@/store/chat.store";
import { useGatewayStore } from "@/store/gateway.store";
import { useSettingsStore } from "@/store/settings.store";

// ---------------------------------------------------------------------------
// SessionSelector
//
// Displays the active session and lets the user switch or create sessions.
// Fetches the session list from the gateway on mount and when the connection
// becomes available.
// ---------------------------------------------------------------------------

interface SessionEntry {
  key: string;
  label?: string;
  updatedAt?: number;
}

export const SessionSelector: FC = () => {
  const [sessions, setSessions] = useState<SessionEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const client = useGatewayStore((s) => s.client);
  const gatewayStatus = useGatewayStore((s) => s.status);
  const settings = useSettingsStore((s) => s.settings);
  const sessionKey = useChatStore((s) => s.sessionKey) ?? settings.sessionKey ?? "main";

  // Load session list from gateway
  const loadSessions = useCallback(async () => {
    if (!client?.connected) {
      return;
    }
    setLoading(true);
    try {
      const result = await client.request<{ sessions?: SessionEntry[] }>("chat.sessions.list", {});
      setSessions(result?.sessions ?? []);
    } catch {
      // If gateway doesn't support sessions, show the current session only
      setSessions([{ key: sessionKey }]);
    } finally {
      setLoading(false);
    }
  }, [client, sessionKey]);

  // Load history for a given session key.
  // silent=true: do not clear existing messages first (used after chat.final to avoid flicker).
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
        const result = await client.request<{ messages?: unknown[] }>("chat.history", {
          sessionKey: key,
        });
        // History messages are handled by useChatEventBridge via chat.history event,
        // but if the gateway returns them synchronously we handle them here too.
        if (Array.isArray(result?.messages)) {
          // Normalize & set via store directly (same shape as event bridge)
          const normalized = result.messages.map((m: unknown) => {
            const msg = m as Record<string, unknown>;
            return {
              id: (msg.id as string) ?? crypto.randomUUID(),
              role: normalizeRole(msg.role as string | undefined),
              content: normalizeContent(msg.content ?? msg.text ?? ""),
              ts: (msg.ts as number) ?? (msg.timestamp as number) ?? Date.now(),
              runId: msg.runId as string | undefined,
              sessionKey: key,
              toolCalls: extractToolCallParts(msg.content),
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
      useSettingsStore.getState().updateSettings({ sessionKey: key, lastActiveSessionKey: key });
      setOpen(false);
      await loadHistory(key);
    },
    [loadHistory],
  );

  // Create a new session
  const newSession = useCallback(async () => {
    if (!client?.connected) {
      return;
    }
    try {
      const result = await client.request<{ sessionKey?: string }>("chat.session.new", {});
      const newKey = result?.sessionKey ?? crypto.randomUUID().slice(0, 8);
      setSessions((prev) => [...prev, { key: newKey }]);
      await switchSession(newKey);
    } catch {
      // Fallback: generate a local key
      const newKey = crypto.randomUUID().slice(0, 8);
      setSessions((prev) => [...prev, { key: newKey }]);
      await switchSession(newKey);
    }
  }, [client, switchSession]);

  // Register loadHistory as the global history-reload callback so that
  // useChatEventBridge can trigger a refresh when "chat" final arrives without inline message.
  useEffect(() => {
    registerHistoryReload((key) => void loadHistory(key, true));
    return () => {
      unregisterHistoryReload();
    };
  }, [loadHistory]);

  // Load sessions when connected
  useEffect(() => {
    if (gatewayStatus === "connected") {
      void loadSessions();
      // Load history for the active session on first connect
      void loadHistory(sessionKey);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gatewayStatus]);

  const activeLabel = sessions.find((s) => s.key === sessionKey)?.label ?? sessionKey;

  return (
    <div className="relative flex h-10 shrink-0 items-center border-b px-3">
      {/* Session picker trigger */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex items-center gap-1.5 rounded-md px-2 py-1 text-sm",
          "text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
        )}
        aria-label="Switch session"
      >
        <MessageSquareIcon className="size-3.5" />
        <span className="max-w-[160px] truncate">{loading ? "Loading…" : activeLabel}</span>
        <ChevronDownIcon className="size-3.5" />
      </button>

      {/* New session button */}
      <button
        type="button"
        onClick={() => void newSession()}
        className={cn(
          "ml-1 rounded-md p-1 text-muted-foreground",
          "transition-colors hover:bg-muted hover:text-foreground",
        )}
        aria-label="New session"
        title="New session"
      >
        <PlusIcon className="size-3.5" />
      </button>

      {/* Dropdown */}
      {open && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden />
          <div
            className={cn(
              "absolute left-3 top-10 z-20 min-w-[200px] rounded-lg border",
              "bg-popover text-popover-foreground shadow-md",
            )}
          >
            {sessions.length === 0 ? (
              <p className="px-3 py-2 text-xs text-muted-foreground">No sessions</p>
            ) : (
              <ul className="py-1">
                {sessions.map((s) => (
                  <li key={s.key}>
                    <button
                      type="button"
                      onClick={() => void switchSession(s.key)}
                      className={cn(
                        "flex w-full items-center gap-2 px-3 py-1.5 text-sm",
                        "transition-colors hover:bg-muted",
                        s.key === sessionKey && "font-medium text-foreground",
                      )}
                    >
                      <MessageSquareIcon className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate">{s.label ?? s.key}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
};
