import { ThreadPrimitive, AuiIf } from "@assistant-ui/react";
import { ArrowDownIcon, AlertCircleIcon, XIcon } from "lucide-react";
import type { FC } from "react";
import { cn } from "@/lib/utils";
import { useChatStore } from "@/store/chat.store";
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
  const messagesLoading = useChatStore((s) => s.messagesLoading);
  const lastError = useChatStore((s) => s.lastError);

  return (
    <ThreadPrimitive.Root
      className="flex w-full flex-1 min-h-0 flex-col"
      style={{ "--thread-max-width": "48rem" } as React.CSSProperties}
    >
      <ThreadPrimitive.Viewport className="relative flex flex-1 flex-col overflow-x-hidden overflow-y-scroll scroll-smooth px-4 pt-4">
        {/* Loading skeleton — shown while fetching session history */}
        {messagesLoading && <MessageSkeleton />}

        {/* Empty state — only shown when not loading and thread is truly empty */}
        {!messagesLoading && (
          <AuiIf condition={(s) => s.thread.isEmpty}>
            <ThreadWelcome />
          </AuiIf>
        )}

        {/* Message list */}
        <ThreadPrimitive.Messages
          components={{
            UserMessage,
            AssistantMessage,
          }}
        />

        {/* Footer (scroll-to-bottom + error banner + composer) */}
        <ThreadPrimitive.ViewportFooter
          className={cn(
            "sticky bottom-0 mx-auto mt-auto flex w-full",
            "max-w-(--thread-max-width) flex-col gap-3 overflow-visible",
            "rounded-t-3xl pb-4 pt-2",
          )}
        >
          <ScrollToBottom />
          {lastError && <ErrorBanner message={lastError} />}
          <Composer />
        </ThreadPrimitive.ViewportFooter>
      </ThreadPrimitive.Viewport>
    </ThreadPrimitive.Root>
  );
};

// ---------------------------------------------------------------------------
// Welcome screen (shown when thread is empty and not loading)
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
// Loading skeleton — shown while session history is being fetched
// ---------------------------------------------------------------------------
const MessageSkeleton: FC = () => (
  <div className="mx-auto w-full max-w-3xl space-y-6 py-4 animate-pulse">
    {/* Assistant message skeletons */}
    <div className="space-y-2 px-2">
      <div className="h-3.5 w-3/4 rounded bg-muted" />
      <div className="h-3.5 w-2/3 rounded bg-muted" />
      <div className="h-3.5 w-1/2 rounded bg-muted" />
    </div>
    {/* User message skeleton (right-aligned bubble) */}
    <div className="flex justify-end px-2">
      <div className="h-9 w-40 rounded-2xl bg-muted" />
    </div>
    {/* Assistant message skeletons */}
    <div className="space-y-2 px-2">
      <div className="h-3.5 w-4/5 rounded bg-muted" />
      <div className="h-3.5 w-3/5 rounded bg-muted" />
    </div>
  </div>
);

// ---------------------------------------------------------------------------
// Error banner — shown above the composer when generation fails
// ---------------------------------------------------------------------------
interface ErrorBannerProps {
  message: string;
}

const ErrorBanner: FC<ErrorBannerProps> = ({ message }) => (
  <div
    className={cn(
      "flex items-start gap-2.5 rounded-xl border border-destructive/30",
      "bg-destructive/5 px-3 py-2.5 text-sm text-destructive",
    )}
    role="alert"
  >
    <AlertCircleIcon className="mt-0.5 size-4 shrink-0" />
    <span className="flex-1 leading-5">{message}</span>
    <button
      type="button"
      onClick={() => useChatStore.getState().setLastError(null)}
      className="ml-1 shrink-0 rounded p-0.5 hover:bg-destructive/10 transition-colors"
      aria-label="Dismiss error"
    >
      <XIcon className="size-3.5" />
    </button>
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
