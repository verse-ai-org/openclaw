import { ComposerPrimitive, AuiIf, useComposerRuntime } from "@assistant-ui/react";
import { SendHorizonal, Square } from "lucide-react";
import { useEffect, type FC } from "react";
import { cn } from "@/lib/utils";
import {
  ComposerAddAttachment,
  ComposerAttachments,
} from "@/components/assistant-ui/attachment";
import { useChatStore } from "@/store/chat.store";

// ---------------------------------------------------------------------------
// Composer
//
// Attachments: assistant-ui primitives (`ComposerAttachments`, `ComposerAddAttachment`)
// + `adapters.attachments` in `GatewayChatRuntimeProvider` (see `gateway-attachment-adapter.ts`).
// ---------------------------------------------------------------------------
export const Composer: FC = () => {
  const composerRuntime = useComposerRuntime();

  // Consume pendingDraftMessage once on mount to pre-fill the input.
  // Clears the store entry immediately so it only fires once.
  useEffect(() => {
    const draft = useChatStore.getState().pendingDraftMessage;
    if (draft) {
      composerRuntime.setText(draft);
      useChatStore.getState().setPendingDraftMessage(null);
    }
  // composerRuntime identity is stable within a session; run only on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <ComposerPrimitive.Root className="relative w-full">
      <ComposerPrimitive.AttachmentDropzone
        className={cn(
          "flex w-full flex-col rounded-2xl border border-input bg-background",
          "px-1 pt-2 outline-none transition-shadow",
          "has-[textarea:focus-visible]:border-ring has-[textarea:focus-visible]:ring-2 has-[textarea:focus-visible]:ring-ring/20",
          "data-[dragging=true]:border-ring data-[dragging=true]:border-dashed data-[dragging=true]:bg-accent/50",
        )}
      >
        {/* Pending attachments (runtime attachment state) */}
        <ComposerAttachments />

        {/* Text input */}
        <ComposerPrimitive.Input
          placeholder="Message..."
          className={cn(
            "mb-1 max-h-40 min-h-12 w-full resize-none bg-transparent",
            "px-4 pt-2 pb-3 text-sm outline-none",
            "placeholder:text-muted-foreground focus-visible:ring-0",
          )}
          rows={1}
          autoFocus
          aria-label="Message input"
        />

        {/* Action row */}
        <div className="relative mx-2 mb-2 flex items-center justify-between">
          <ComposerAddAttachment />

          {/* Send button (shown when not running) */}
          <AuiIf condition={(s) => !s.thread.isRunning}>
            <ComposerPrimitive.Send asChild>
              <button
                type="button"
                className={cn(
                  "flex size-8 items-center justify-center rounded-full",
                  "bg-primary text-primary-foreground",
                  "transition-colors hover:bg-primary/90",
                  "disabled:opacity-40 disabled:cursor-not-allowed",
                )}
                aria-label="Send message"
              >
                <SendHorizonal className="size-4" />
              </button>
            </ComposerPrimitive.Send>
          </AuiIf>

          {/* Cancel button (shown while running) */}
          <AuiIf condition={(s) => s.thread.isRunning}>
            <ComposerPrimitive.Cancel asChild>
              <button
                type="button"
                className={cn(
                  "flex size-8 items-center justify-center rounded-full",
                  "bg-primary text-primary-foreground",
                  "transition-colors hover:bg-primary/90",
                )}
                aria-label="Stop generating"
              >
                <Square className="size-3 fill-current" />
              </button>
            </ComposerPrimitive.Cancel>
          </AuiIf>
        </div>
      </ComposerPrimitive.AttachmentDropzone>
    </ComposerPrimitive.Root>
  );
};
