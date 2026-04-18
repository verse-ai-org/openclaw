import {
  MessagePrimitive,
  ComposerPrimitive,
  useComposerRuntime,
  useAuiState,
} from "@assistant-ui/react";
import { CheckIcon, XIcon } from "lucide-react";
import { type FC, useCallback } from "react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Save even when the textarea text is unchanged: DefaultEditComposerRuntimeCore
// only calls thread.append when `text !== previousText || options?.startRun`.
// ComposerPrimitive.Send invokes send() with no args, so unchanged text skips
// append and never reaches Gateway onEdit — pass startRun: true from our button.
// ---------------------------------------------------------------------------
const UserEditSaveButton: FC = () => {
  const composerRuntime = useComposerRuntime();
  const disabled = useAuiState(
    (s) =>
      (s.thread.isRunning && !s.thread.capabilities.queue) ||
      !s.composer.isEditing ||
      s.composer.isEmpty,
  );
  const onClick = useCallback(() => {
    void composerRuntime.send({ startRun: true });
  }, [composerRuntime]);

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium",
        "bg-primary text-primary-foreground hover:bg-primary/90 transition-colors",
        "disabled:opacity-40 disabled:cursor-not-allowed",
      )}
    >
      <CheckIcon className="size-3" />
      Save & Send
    </button>
  );
};

// ---------------------------------------------------------------------------
// UserEditComposer
//
// Rendered by ThreadPrimitive.Messages when the user message is in edit mode
// (see @assistant-ui/core ThreadMessages.js: UserEditComposer vs UserMessage).
// Editing UI must NOT wrap ComposerPrimitive.Input/Send in ComposerPrimitive.Root:
// Root is the thread-level <form> for the main composer; nesting it under a
// message-scoped edit composer breaks tap context and causes
// "Composer is not available" on send.
// ---------------------------------------------------------------------------
export const UserEditComposer: FC = () => {
  return (
    <MessagePrimitive.Root className="group/msg mx-auto w-full max-w-3xl py-2" data-role="user">
      <div className="flex justify-end">
        <div className="w-full max-w-[80%]">
          <div
            className={cn(
              "flex flex-col gap-2 rounded-2xl border border-primary/30 bg-card px-3 py-2.5 shadow-sm",
            )}
          >
            <ComposerPrimitive.Input
              className={cn(
                "w-full resize-none bg-transparent text-sm text-foreground",
                "placeholder:text-muted-foreground",
                "focus:outline-none",
                "min-h-[2rem] max-h-40",
              )}
              rows={1}
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <ComposerPrimitive.Cancel asChild>
                <button
                  type="button"
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium",
                    "text-muted-foreground hover:bg-muted hover:text-foreground transition-colors",
                  )}
                >
                  <XIcon className="size-3" />
                  Cancel
                </button>
              </ComposerPrimitive.Cancel>

              <UserEditSaveButton />
            </div>
          </div>
        </div>
      </div>
    </MessagePrimitive.Root>
  );
};
