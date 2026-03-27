import { PlusIcon, SearchIcon } from "lucide-react";
import { useState } from "react";
import { useSessionManager, resolveSessionDisplayName } from "@/hooks/useSessionManager";
import type { SessionEntry } from "@/hooks/useSessionManager";
import { cn } from "@/lib/utils";
import { useGatewayStore } from "@/store/gateway.store";

// ---------------------------------------------------------------------------
// ChatSidebar — Sessions Pane (Pane 2)
// Matches Figma: BossMu / Page 2 / Main App (Sidebar Open Toggle) / Aside - Sessions Pane
// Width: 300px, white bg, border-r
// Header: search input (64px)
// Content: "Recently Played" heading + card-style session list
// Active state: brand-red tint background (rgb(186,0,52) @ 5% opacity)
// ---------------------------------------------------------------------------

// function SessionIcon({ isActive }: { isActive: boolean }) {
//   return (
//     <div
//       className={cn(
//         "flex shrink-0 size-12 items-center justify-center rounded-lg",
//         isActive ? "bg-[rgb(186,0,52)]" : "bg-[rgb(243,244,246)]",
//       )}
//     >
//       <MessageSquareIcon
//         className={cn("size-[17px]", isActive ? "text-white" : "text-[rgb(142,142,147)]")}
//       />
//     </div>
//   );
// }

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
      {/* <SessionIcon isActive={isActive} /> */}
      <div className="flex flex-1 min-w-0 flex-col gap-0.5">
        {/* Title row */}
        <span className="truncate text-[13px] font-semibold leading-5 text-foreground">
          {session.lastMessagePreview && (
            
            <span 
                      className={cn(
            "truncate text-[12px] leading-4 font-medium",
            isActive
              ? "text-[rgb(186,0,52)]"
              : "font-normal",
          )}
            >
              {session.lastMessagePreview}
            </span>
          )}
          {label}
        </span>
        {/* Status / timestamp row */}
        <span
          className={cn("truncate text-[rgb(142,142,147)] text-[12px] leading-4 font-medium")}
        >
          {session.updatedAt ? formatRelative(session.updatedAt) : "Session"}
        </span>
      </div>
    </button>
  );
}

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

export function ChatSidebar() {
  const { sessions, loading, sessionKey, switchSession, newSession } = useSessionManager();
  const gatewayStatus = useGatewayStore((s) => s.status);
  const isConnected = gatewayStatus === "connected";

  const [search, setSearch] = useState("");

  const filtered = sessions.filter((s) => {
    const q = search.toLowerCase();
    return [s.displayName, s.derivedTitle, s.label, s.key].some(
      (f) => f && f.toLowerCase().includes(q),
    );
  });

  return (
    <div className="flex w-60 shrink-0 flex-col overflow-hidden border-r bg-white">
      {/* Header: search bar — 64px, matches Figma */}
      <div className="flex h-16 shrink-0 items-center px-2 border-b border-transparent">
        <div className="relative flex w-full items-center">
          <SearchIcon className="absolute left-3 size-3.5 text-[rgb(142,142,147)] pointer-events-none" />
          <input
            type="text"
            placeholder="Search sessions"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={cn(
              "w-full rounded-full bg-[rgb(239,239,239)] py-2 pl-8 pr-3",
              "text-[13px] text-foreground placeholder:text-[rgb(142,142,147)]",
              "border-none outline-none focus:ring-0",
            )}
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-1 min-h-0 flex-col overflow-y-auto px-2 py-4">
        {/* Section heading + new session button */}
        <div className="flex items-center justify-between px-3 mb-3">
          <span className="text-[17px] font-bold leading-tight text-foreground">
            Recently Played
          </span>
          <button
            type="button"
            onClick={() => void newSession()}
            disabled={!isConnected}
            title="New session"
            aria-label="New session"
            className={cn(
              "flex size-6 items-center justify-center rounded-full",
              "text-[rgb(142,142,147)] transition-colors",
              isConnected ? "hover:bg-[rgb(243,244,246)] hover:text-foreground" : "opacity-40 cursor-not-allowed",
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
              {search ? "No results" : "No sessions"}
            </p>
          )}
          {filtered.map((s) => (
            <SessionItem
              key={s.key}
              session={s}
              isActive={s.key === sessionKey}
              onClick={() => void switchSession(s.key)}
            />
          ))}
        </div>
      </div>

      {/* Footer: gateway status */}
      {/* <div className="flex h-10 shrink-0 items-center gap-1.5 border-t px-5">
        <span
          className={cn(
            "size-1.5 rounded-full shrink-0",
            isConnected ? "bg-emerald-500" : "bg-[rgb(142,142,147)]/50",
          )}
        />
        <span className="text-[11px] text-[rgb(142,142,147)]">
          {isConnected ? "Gateway connected" : "Gateway offline"}
        </span>
      </div> */}
    </div>
  );
}
