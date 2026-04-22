import { ComposerPrimitive, AuiIf, useComposerRuntime } from "@assistant-ui/react";
import { SendHorizonal, Square } from "lucide-react";
import {
  useCallback,
  useEffect,
  useState,
  type DragEventHandler,
  type FC,
  type FormEventHandler,
} from "react";
import { cn } from "@/lib/utils";
import {
  ComposerAddAttachment,
  ComposerAttachments,
} from "@/components/assistant-ui/attachment";
import {
  ALLOWED_MIME_TYPES,
  MAX_ATTACHMENT_COUNT,
  MAX_FILE_SIZE_BYTES_REFERENCE_MODE,
} from "@/providers/chat/adapters/gateway-attachment-adapter";
import { useChatStore } from "@/store/chat.store";

// ---------------------------------------------------------------------------
// Composer
//
// Attachments: assistant-ui primitives (`ComposerAttachments`, `ComposerAddAttachment`)
// + `adapters.attachments` in `GatewayChatRuntimeProvider`
//   (see `@/providers/chat/adapters/gateway-attachment-adapter.ts`).
// ---------------------------------------------------------------------------
export const Composer: FC = () => {
  const composerRuntime = useComposerRuntime();
  const [attachmentError, setAttachmentError] = useState<string | null>(null);

  const validateFiles = useCallback((files: FileList | null): string | null => {
    if (!files || files.length === 0) {
      return null;
    }
    if (files.length > MAX_ATTACHMENT_COUNT) {
      return `Too many files selected. Maximum is ${MAX_ATTACHMENT_COUNT}.`;
    }
    for (const file of files) {
      if (file.type.startsWith("image/")) {
        return "Image uploads are currently disabled.";
      }
      if (file.size <= 0) {
        return `Empty files are not supported: ${file.name}`;
      }
      if (file.size > MAX_FILE_SIZE_BYTES_REFERENCE_MODE) {
        return `File is too large: ${file.name}. Max size is 100MB.`;
      }
      if (!ALLOWED_MIME_TYPES.has(file.type)) {
        return `Unsupported file type: ${file.name}`;
      }
    }
    return null;
  }, []);

  const handleFileInputChangeCapture = useCallback<FormEventHandler<HTMLDivElement>>((evt) => {
    const target = evt.target as HTMLInputElement | null;
    if (!target || target.tagName !== "INPUT" || target.type !== "file") {
      return;
    }
    setAttachmentError(validateFiles(target.files));
  }, [validateFiles]);

  const handleDropCapture = useCallback<DragEventHandler<HTMLDivElement>>((evt) => {
    setAttachmentError(validateFiles(evt.dataTransfer.files));
  }, [validateFiles]);

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

  // Also handle the case where Composer is already mounted when pendingDraftMessage
  // is set (e.g. navigating to /chat from the agent profile page while chat is open).
  useEffect(() => {
    return useChatStore.subscribe((s) => {
      const msg = s.pendingDraftMessage;
      if (msg) {
        composerRuntime.setText(msg);
        useChatStore.getState().setPendingDraftMessage(null);
      }
    });
  // composerRuntime is stable; subscribe once for the lifetime of the component
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <ComposerPrimitive.Root className="relative w-full">
      <ComposerPrimitive.AttachmentDropzone
        onChangeCapture={handleFileInputChangeCapture}
        onDropCapture={handleDropCapture}
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
          <div className="flex items-center gap-1">
            <ComposerAddAttachment />
          </div>

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
        {attachmentError && (
          <div className="mx-4 mb-2 rounded-md border border-destructive/30 bg-destructive/5 px-2.5 py-1.5">
            <p className="text-xs text-destructive" role="alert">
              {attachmentError}
            </p>
          </div>
        )}
      </ComposerPrimitive.AttachmentDropzone>
    </ComposerPrimitive.Root>
  );
};
