import {  PlusIcon, Trash2Icon, ChevronLeft } from "lucide-react";
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { resolveSessionDisplayName, type SessionEntry } from "@/hooks/session-manager";
import type { GatewayAgentRow } from "@/types/agents";
import { resolveAgentEmoji, resolveAgentDisplayName, resolveAgentBio } from "./AgentList";

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
  onDelete,
}: {
  session: SessionEntry;
  isActive: boolean;
  onClick: () => void;
  onDelete: () => void;
}) {
  const label = resolveSessionDisplayName(session);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmOpen(true);
  };

  return (
    <>
      <div
        className={cn(
          "group/session relative w-full rounded-xl transition-colors",
          isActive ? "bg-[rgb(186,0,52)]/5" : "hover:bg-[rgb(243,244,246)]",
        )}
      >
        <button
          type="button"
          onClick={onClick}
          className="w-full px-4 py-2 text-left flex items-start gap-3"
        >
          <div className="flex flex-1 min-w-0 flex-col gap-0.5 pr-6">
            <span
              className={cn(
                "truncate text-[13px] font-semibold leading-5",
                isActive ? "text-[rgb(186,0,52)]" : "text-foreground",
              )}
            >
              {label}
            </span>
            <span className="truncate text-[rgb(142,142,147)] text-[12px] leading-4 font-medium">
              {session.updatedAt ? formatRelative(session.updatedAt) : "Session"}
            </span>
          </div>
        </button>

        {/* Delete button — appears on hover, offset right */}
        <button
          type="button"
          onClick={handleDeleteClick}
          title="Delete session"
          aria-label="Delete session"
          className={cn(
            "absolute right-2 top-1/2 -translate-y-1/2",
            "flex size-6 items-center justify-center rounded-md",
            "text-muted-foreground transition-all duration-150",
            "opacity-0 group-hover/session:opacity-100",
            "hover:bg-destructive/10 hover:text-destructive",
          )}
        >
          <Trash2Icon className="size-3.5" />
        </button>
      </div>

      {/* Confirmation dialog */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete session?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>{label}</strong> and all its messages. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                setConfirmOpen(false);
                onDelete();
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
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
  onDeleteSession: (key: string) => Promise<void>;
  isConnected: boolean;
  /** Optional: called when the user clicks the agent avatar or name to view its profile */
  onViewProfile?: (agentId: string) => void;
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
  onDeleteSession,
  isConnected,
  onViewProfile,
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
  const bio = resolveAgentBio(agent);
  const avatarUrl = agent.identity?.avatarUrl;

  return (
    <div className="flex flex-1 min-h-0 flex-col overflow-hidden">
      {/* Header: back link + agent identity block */}
      <div className="shrink-0 px-2 py-2 shadow-bottom">
        {/* Back link — small, muted */}
        <button
          type="button"
          onClick={onBack}
          className="flex items-center justify-center px-1 mb-2 text-[12px] text-[rgb(142,142,147)] hover:text-foreground transition-colors"
        >
          <ChevronLeft className="size-4 shrink-0" />
          <span className="font-medium">Employees</span>
        </button>

        {/* Agent identity block — avatar/emoji + name (clickable to open profile drawer) */}
        <div className="flex items-center gap-3 px-1">
          <button
            type="button"
            onClick={() => onViewProfile?.(agent.id)}
            disabled={!onViewProfile}
            className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[rgb(243,244,246)] text-[22px] overflow-hidden transition-opacity hover:opacity-80 disabled:cursor-default disabled:hover:opacity-100"
            title={onViewProfile ? `View ${name} profile` : undefined}
          >
            {avatarUrl ? (
              <img src={avatarUrl} alt={name} className="size-full object-contain rounded-xl" />
            ) : (
              emoji
            )}
          </button>
          <button
            type="button"
            onClick={() => onViewProfile?.(agent.id)}
            disabled={!onViewProfile}
            className="flex-1 min-w-0 truncate text-sm font-bold text-foreground text-left cursor-pointer transition-colors hover:text-primary disabled:cursor-default disabled:hover:text-foreground"
          >
            {name}
            <p className="flex-1 min-w-0 truncate text-xs text-muted-foreground whitespace-nowrap overflow-clip">
              {bio}
            </p>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-1 min-h-0 flex-col overflow-y-auto px-2 py-4 border-t">
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
              onDelete={() => void onDeleteSession(s.key)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
