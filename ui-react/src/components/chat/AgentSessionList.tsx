import { ArrowLeftIcon, PlusIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { resolveSessionDisplayName, type SessionEntry } from "@/hooks/useSessionManager";
import type { GatewayAgentRow } from "@/types/agents";
import { resolveAgentEmoji, resolveAgentDisplayName } from "./AgentList";

// ---------------------------------------------------------------------------
// AgentSessionList — Panel that shows sessions for a specific agent
// (Pane 2, "sessions" view after drilling into an agent)
// ---------------------------------------------------------------------------

/** Format a unix-ms timestamp as a short relative string. */
function formatRelative(ts: number): string {
  const diffMs = Date.now() - ts;
  const diffMin = Math.round(diffMs / 60_000);
  if (diffMin < 1) { return "Just now"; }
  if (diffMin < 60) { return `Modified ${diffMin}m ago`; }
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) { return `Modified ${diffH}h ago`; }
  const diffD = Math.round(diffH / 24);
  return diffD === 1 ? "Modified Yesterday" : `Modified ${diffD}d ago`;
}

function SessionItem({
  session,
  isActive,
  onClick,
}: {
  session: SessionEntry;
  isActive: boolean;
  onClick: () => void;
}) {
  const label = resolveSessionDisplayName(session);

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full rounded-xl px-4 py-2 text-left transition-colors",
        "flex items-start gap-3",
        isActive ? "bg-[rgb(186,0,52)]/5" : "hover:bg-[rgb(243,244,246)]",
      )}
    >
      <div className="flex flex-1 min-w-0 flex-col gap-0.5">
        <span className="truncate text-[13px] font-semibold leading-5 text-foreground">
          {session.lastMessagePreview && (
            <span
              className={cn(
                "truncate text-[12px] leading-4 font-medium",
                isActive ? "text-[rgb(186,0,52)]" : "font-normal",
              )}
            >
              {session.lastMessagePreview}
            </span>
          )}
          {label}
        </span>
        <span className="truncate text-[rgb(142,142,147)] text-[12px] leading-4 font-medium">
          {session.updatedAt ? formatRelative(session.updatedAt) : "Session"}
        </span>
      </div>
    </button>
  );
}

interface AgentSessionListProps {
  agent: GatewayAgentRow;
  sessions: SessionEntry[];
  loading: boolean;
  sessionKey: string;
  /** Search query managed by the parent ChatSidebar (shared across views) */
  search: string;
  onBack: () => void;
  onSwitchSession: (key: string) => void;
  onNewSession: (agentId: string) => void;
  isConnected: boolean;
}

export function AgentSessionList({
  agent,
  sessions,
  loading,
  sessionKey,
  search,
  onBack,
  onSwitchSession,
  onNewSession,
  isConnected,
}: AgentSessionListProps) {
  const agentPrefix = `agent:${agent.id}:`;
  const agentSessions = sessions.filter((s) => s.key.startsWith(agentPrefix));

  const filtered = agentSessions.filter((s) => {
    if (!search) { return true; }
    const q = search.toLowerCase();
    return [s.displayName, s.derivedTitle, s.label, s.key].some(
      (f) => f && f.toLowerCase().includes(q),
    );
  });

  const emoji = resolveAgentEmoji(agent);
  const name = resolveAgentDisplayName(agent);

  return (
    <div className="flex flex-1 min-h-0 flex-col overflow-hidden">
      {/* Header: back link + agent identity block */}
      <div className="shrink-0 px-2 pt-3 pb-3 border-b border-[rgb(229,229,234)]">
        {/* Back link — small, muted */}
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1 px-1 mb-2 text-[12px] text-[rgb(142,142,147)] hover:text-foreground transition-colors"
        >
          <ArrowLeftIcon className="size-3 shrink-0" />
          <span className="font-medium">Agents</span>
        </button>

        {/* Agent identity block — prominent emoji + name */}
        <div className="flex items-center gap-3 px-1">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[rgb(243,244,246)] text-[22px]">
            {emoji}
          </span>
          <span className="flex-1 min-w-0 truncate text-[15px] font-bold text-foreground">
            {name}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-1 min-h-0 flex-col overflow-y-auto px-2 py-4">
        {/* Section heading + new session button */}
        <div className="flex items-center justify-between px-3 mb-3">
          <span className="text-[17px] font-bold leading-tight text-foreground">Sessions</span>
          <button
            type="button"
            onClick={() => void onNewSession(agent.id)}
            disabled={!isConnected}
            title="New session"
            aria-label="New session"
            className={cn(
              "flex size-6 items-center justify-center rounded-full",
              "text-[rgb(142,142,147)] transition-colors",
              isConnected
                ? "hover:bg-[rgb(243,244,246)] hover:text-foreground"
                : "opacity-40 cursor-not-allowed",
            )}
          >
            <PlusIcon className="size-4" />
          </button>
        </div>

        {/* Session list */}
        <div className="flex flex-col gap-0.5">
          {loading && filtered.length === 0 && (
            <p className="px-3 py-2 text-[13px] text-[rgb(142,142,147)]">Loading…</p>
          )}
          {!loading && filtered.length === 0 && (
            <p className="px-3 py-2 text-[13px] text-[rgb(142,142,147)]">
              {search ? "No results" : "No sessions yet"}
            </p>
          )}
          {filtered.map((s) => (
            <SessionItem
              key={s.key}
              session={s}
              isActive={s.key === sessionKey}
              onClick={() => onSwitchSession(s.key)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
