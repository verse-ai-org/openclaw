import { ThreadPrimitive, AuiIf } from "@assistant-ui/react";
import { ArrowDownIcon } from "lucide-react";
import type { FC } from "react";
import { cn } from "@/lib/utils";
import { AssistantMessage } from "./AssistantMessage";
import { Composer } from "./Composer";
import { UserMessage } from "./UserMessage";

// ---------------------------------------------------------------------------
// ThreadView
//
// The main chat thread layout: message list + composer.
// Wrap this inside <GatewayChatRuntimeProvider> before rendering.
// ---------------------------------------------------------------------------
export const ThreadView: FC = () => {
  return (
    <ThreadPrimitive.Root
      className="flex w-full h-full flex-col bg-background"
      style={{ "--thread-max-width": "48rem" } as React.CSSProperties}
    >
      <ThreadPrimitive.Viewport className="relative flex flex-1 flex-col overflow-x-hidden overflow-y-scroll scroll-smooth px-4 pt-4">
        {/* Empty state */}
        <AuiIf condition={(s) => s.thread.isEmpty}>
          <ThreadWelcome />
        </AuiIf>

        {/* Message list */}
        <ThreadPrimitive.Messages
          components={{
            UserMessage,
            AssistantMessage,
          }}
        />

        {/* Footer (scroll-to-bottom + composer) */}
        <ThreadPrimitive.ViewportFooter
          className={cn(
            "sticky bottom-0 mx-auto mt-auto flex w-full",
            "max-w-(--thread-max-width) flex-col gap-3 overflow-visible",
            "rounded-t-3xl bg-background pb-4 pt-2",
          )}
        >
          <ScrollToBottom />
          <Composer />
        </ThreadPrimitive.ViewportFooter>
      </ThreadPrimitive.Viewport>
    </ThreadPrimitive.Root>
  );
};

// ---------------------------------------------------------------------------
// Welcome screen (shown when thread is empty)
// ---------------------------------------------------------------------------
const ThreadWelcome: FC = () => (
  <div className="mx-auto my-auto flex w-full max-w-(--thread-max-width) grow flex-col items-center justify-center gap-3 py-8">
    <div className="flex flex-col items-center gap-2 text-center">
      <h1 className="text-2xl font-semibold">OpenClaw</h1>
      <p className="text-muted-foreground text-sm">Send a message to start the conversation.</p>
    </div>
  </div>
);

// ---------------------------------------------------------------------------
// Scroll-to-bottom button
// ---------------------------------------------------------------------------
const ScrollToBottom: FC = () => (
  <ThreadPrimitive.ScrollToBottom asChild>
    <button
      type="button"
      className={cn(
        "absolute -top-12 left-1/2 -translate-x-1/2 z-10",
        "flex size-8 items-center justify-center rounded-full border",
        "bg-background shadow-sm transition-all",
        "hover:bg-muted disabled:invisible",
      )}
      aria-label="Scroll to bottom"
    >
      <ArrowDownIcon className="size-4" />
    </button>
  </ThreadPrimitive.ScrollToBottom>
);
