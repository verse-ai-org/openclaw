import { PlusIcon, MessageSquareIcon, ChevronDownIcon } from "lucide-react";
import { useState } from "react";
import { GatewayChatRuntimeProvider } from "@/components/chat/GatewayChatRuntimeProvider";
import { ThreadView } from "@/components/chat/ThreadView";
import { useChatEventBridge } from "@/hooks/useChatEventBridge";
import { useSessionManager } from "@/hooks/useSessionManager";
import { cn } from "@/lib/utils";

export function ChatPage() {
  useChatEventBridge();
  const { sessions, loading, sessionKey, activeLabel, switchSession, newSession } =
    useSessionManager();

  const [open, setOpen] = useState(false);

  return (
    <GatewayChatRuntimeProvider>
      <div className="flex h-full flex-col overflow-hidden">
        {/* Session bar */}
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
            <span className="max-w-[200px] truncate">{loading ? "Loading…" : activeLabel}</span>
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
                          onClick={() => {
                            void switchSession(s.key);
                            setOpen(false);
                          }}
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

        {/* Chat thread */}
        <ThreadView />
      </div>
    </GatewayChatRuntimeProvider>
  );
}
