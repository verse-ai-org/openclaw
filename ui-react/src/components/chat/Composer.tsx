import { ComposerPrimitive, AuiIf, useComposerRuntime } from "@assistant-ui/react";
import { Download, SendHorizonal, Square } from "lucide-react";
import { toast } from "sonner";
import {
  useCallback,
  useEffect,
  useState,
  type ClipboardEventHandler,
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
  MAX_IMAGE_SIZE_BYTES,
  MAX_FILE_SIZE_BYTES_REFERENCE_MODE,
} from "./gateway/providers/send";
import { useComposerStore } from "@/store/composer.store";
import { useConversationStore } from "@/store/conversation.store";
import { selectChatMessages } from "@/store/conversation-selectors";
import { useChatStore } from "@/store/chat.store";
import { useSettingsStore } from "@/store/settings.store";
import { useAgentsStore } from "@/store/agents.store";
import { resolveActiveChatSessionKey } from "./session/active-session";
import { exportChatMarkdown } from "./export-chat-markdown";
import { resolveAssistantDisplayName } from "./resolve-assistant-display-name";

// ---------------------------------------------------------------------------
// Composer
//
// Attachments: assistant-ui primitives (`ComposerAttachments`, `ComposerAddAttachment`)
// + `adapters.attachments` in `GatewayChatRuntimeProvider`
//   (see `components/chat/gateway/providers/send/attachment-adapter.ts`).
// ---------------------------------------------------------------------------
export const Composer: FC = () => {
  const composerRuntime = useComposerRuntime();
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const chatSessionKey = useChatStore((s) => s.sessionKey);
  const settingsSessionKey = useSettingsStore((s) => s.settings.sessionKey);
  const activeSessionKey = resolveActiveChatSessionKey(chatSessionKey, settingsSessionKey);
  const conversation = useConversationStore((s) => s.byThread[activeSessionKey]);
  const exportMessages = conversation ? selectChatMessages(conversation) : [];
  const hasExportableMessages = exportMessages.length > 0;
  const agentsList = useAgentsStore((s) => s.agentsList);
  const assistantName = resolveAssistantDisplayName(activeSessionKey, agentsList);

  const handleExport = useCallback(() => {
    const ok = exportChatMarkdown(exportMessages, assistantName);
    if (!ok) {
      toast.error("Nothing to export", { duration: 2500 });
    }
  }, [exportMessages, assistantName]);

  const validateFiles = useCallback((files: FileList | null): string | null => {
    if (!files || files.length === 0) {
      return null;
    }
    if (files.length > MAX_ATTACHMENT_COUNT) {
      return `附件过多，最多支持 ${MAX_ATTACHMENT_COUNT} 个`;
    }
    for (const file of files) {
      if (file.size <= 0) {
        return `不支持空文件: ${file.name}`;
      }
      if (file.type.startsWith("image/")) {
        if (file.size > MAX_IMAGE_SIZE_BYTES) {
          return `图片过大: ${file.name}，最大支持 ${MAX_IMAGE_SIZE_BYTES / 1024 / 1024}MB`;
        }
        continue;
      }
      if (file.size > MAX_FILE_SIZE_BYTES_REFERENCE_MODE) {
        return `文件过大: ${file.name}，最大支持 100MB`;
      }
      if (!ALLOWED_MIME_TYPES.has(file.type)) {
        return `不支持的文件类型: ${file.name}`;
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

  const handlePaste = useCallback<ClipboardEventHandler<HTMLTextAreaElement>>((evt) => {
    const items = evt.clipboardData?.items;
    if (!items) return;
    const imageFiles: File[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) imageFiles.push(file);
      }
    }
    if (imageFiles.length === 0) return;
    evt.preventDefault();
    for (const file of imageFiles) {
      const err = validateFiles(
        Object.assign([file], { item: () => file }) as unknown as FileList,
      );
      if (err) {
        setAttachmentError(err);
        return;
      }
      composerRuntime.addAttachment(file);
    }
  }, [composerRuntime, validateFiles]);

  // Consume pendingDraftMessage once on mount to pre-fill the input.
  // Clears the store entry immediately so it only fires once.
  useEffect(() => {
    const draft = useComposerStore.getState().pendingDraftMessage;
    if (draft) {
      composerRuntime.setText(draft);
      useComposerStore.getState().clearPendingDraftMessage();
    }
  // composerRuntime identity is stable within a session; run only on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Also handle the case where Composer is already mounted when pendingDraftMessage
  // is set (e.g. navigating to /chat from the agent profile page while chat is open).
  useEffect(() => {
    return useComposerStore.subscribe((s) => {
      const msg = s.pendingDraftMessage;
      if (msg) {
        composerRuntime.setText(msg);
        useComposerStore.getState().clearPendingDraftMessage();
      }
    });
  // composerRuntime is stable; subscribe once for the lifetime of the component
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <ComposerPrimitive.Root className="relative z-100 w-full">
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
          onPaste={handlePaste}
        />

        {/* Action row */}
        <div className="relative mx-2 mb-2 flex items-center justify-between">
          <div className="flex items-center gap-1">
            <ComposerAddAttachment />
            <button
              type="button"
              onClick={handleExport}
              disabled={!hasExportableMessages}
              className={cn(
                "flex size-8 items-center justify-center rounded-full",
                "text-muted-foreground transition-colors",
                "hover:bg-muted hover:text-foreground",
                "disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent",
              )}
              title="Export chat"
              aria-label="Export chat"
            >
              <Download className="size-4" />
            </button>
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
