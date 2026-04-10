import { ComposerPrimitive, AuiIf } from "@assistant-ui/react";
import { SendHorizonal, Square, Paperclip, X, FileText, Image } from "lucide-react";
import type { FC, ChangeEvent } from "react";
import { useCallback, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useChatStore, type PendingAttachment } from "@/store/chat.store";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

// ---------------------------------------------------------------------------
// File upload constants
// ---------------------------------------------------------------------------
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB per file
const MAX_TOTAL_SIZE = 20 * 1024 * 1024; // 20MB total
const MAX_FILE_COUNT = 10;

const ALLOWED_MIME_TYPES = new Set([
  // Images
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "image/bmp",
  // Documents
  "application/pdf",
  "text/plain",
  "text/markdown",
  "text/html",
  "text/csv",
  "application/json",
  "application/xml",
  // Office documents
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);

// ---------------------------------------------------------------------------
// Helper: Format file size
// ---------------------------------------------------------------------------
function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ---------------------------------------------------------------------------
// Helper: Check if file is image
// ---------------------------------------------------------------------------
function isImageFile(mimeType: string): boolean {
  return mimeType.startsWith("image/");
}

// ---------------------------------------------------------------------------
// AttachmentPreview: Shows pending attachments with delete buttons
// ---------------------------------------------------------------------------
interface AttachmentPreviewProps {
  files: PendingAttachment[];
  error: string | null;
  onRemove: (id: string) => void;
}

const AttachmentPreview: FC<AttachmentPreviewProps> = ({ files, error, onRemove }) => {
  if (files.length === 0 && !error) {
    return null;
  }

  return (
    <div className="px-3 pt-2 pb-1">
      {/* Error message */}
      {error && (
        <div className="mb-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      )}

      {/* File list */}
      {files.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {files.map((att) => (
            <div
              key={att.id}
              className="group flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-2.5 py-1.5 pr-2 text-xs transition-colors hover:bg-muted"
            >
              {/* File icon */}
              {isImageFile(att.mimeType) ? (
                <Image className="size-3.5 shrink-0 text-muted-foreground" />
              ) : (
                <FileText className="size-3.5 shrink-0 text-muted-foreground" />
              )}

              {/* File info */}
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-foreground">{att.fileName}</div>
                <div className="text-muted-foreground">{formatFileSize(att.size)}</div>
              </div>

              {/* Remove button */}
              <button
                type="button"
                onClick={() => onRemove(att.id)}
                className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-background/50 hover:text-foreground group-hover:opacity-100"
                aria-label={`Remove ${att.fileName}`}
              >
                <X className="size-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Composer
//
// Input area with: textarea, send/cancel button, and attachment upload.
// ---------------------------------------------------------------------------
export const Composer: FC = () => {
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const pendingAttachments = useChatStore((s) => s.pendingAttachments);
  const addPendingAttachments = useChatStore((s) => s.addPendingAttachments);
  const removePendingAttachment = useChatStore((s) => s.removePendingAttachment);

  // Handle file selection
  const handleFileSelect = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) {
        return;
      }

      setUploadError(null);

      // Check file count
      if (pendingAttachments.length + files.length > MAX_FILE_COUNT) {
        setUploadError(`Maximum ${MAX_FILE_COUNT} files allowed`);
        return;
      }

      // Check total size
      const currentTotalSize = pendingAttachments.reduce((sum, a) => sum + a.size, 0);
      const newFilesTotalSize = Array.from(files).reduce((sum, f) => sum + f.size, 0);
      if (currentTotalSize + newFilesTotalSize > MAX_TOTAL_SIZE) {
        setUploadError(`Total file size exceeds ${formatFileSize(MAX_TOTAL_SIZE)} limit`);
        return;
      }

      const newAttachments: PendingAttachment[] = [];

      for (const file of Array.from(files)) {
        // Check individual file size
        if (file.size > MAX_FILE_SIZE) {
          setUploadError(`File "${file.name}" exceeds ${formatFileSize(MAX_FILE_SIZE)} limit`);
          continue;
        }

        // Check MIME type
        if (!ALLOWED_MIME_TYPES.has(file.type)) {
          setUploadError(`File type "${file.type || "unknown"}" is not supported`);
          continue;
        }

        // Read file as base64
        try {
          const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.addEventListener("load", () => {
              const result = reader.result as string;
              // Remove data URL prefix (e.g., "data:image/png;base64,")
              const base64Data = result.split(",")[1] || result;
              resolve(base64Data);
            });
            reader.addEventListener("error", () => {
              reject(reader.error);
            });
            reader.readAsDataURL(file);
          });

          newAttachments.push({
            id: crypto.randomUUID(),
            fileName: file.name,
            mimeType: file.type,
            size: file.size,
            base64,
          });
        } catch (err) {
          console.error("Failed to read file:", err);
          setUploadError(`Failed to read file "${file.name}"`);
        }
      }

      if (newAttachments.length > 0) {
        addPendingAttachments(newAttachments);
      }
    },
    [pendingAttachments, addPendingAttachments],
  );

  // Handle file removal
  const handleRemoveFile = useCallback(
    (id: string) => {
      removePendingAttachment(id);
      setUploadError(null);
    },
    [removePendingAttachment],
  );

  // Handle file input change
  const handleFileInputChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files;
      if (!files || files.length === 0) {
        return;
      }
      await handleFileSelect(files);
      // Reset input so same file can be re-selected
      event.target.value = "";
    },
    [handleFileSelect],
  );

  // Trigger file input click
  const handleAttachmentClick = useCallback(() => {
    fileInputRef.current?.click();
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
        {/* Pending attachments preview */}
        <AttachmentPreview
          files={pendingAttachments}
          error={uploadError}
          onRemove={handleRemoveFile}
        />

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
          {/* Attachment button */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={handleAttachmentClick}
                className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="Add files & photos."
              >
                <Paperclip className="size-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">Add files &amp; photos</TooltipContent>
          </Tooltip>

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.md,.csv,.json,.xml,.html"
            className="hidden"
            onChange={handleFileInputChange}
            aria-label="Upload files"
          />

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
