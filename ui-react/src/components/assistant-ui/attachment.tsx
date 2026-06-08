"use client";

import { PropsWithChildren, useEffect, useMemo, useState, type FC } from "react";
import { XIcon, PlusIcon, FileText, FileAudio, Image as ImageIcon } from "lucide-react";
import {
  AttachmentPrimitive,
  ComposerPrimitive,
  MessagePrimitive,
  useAuiState,
  useAui,
} from "@assistant-ui/react";
import { useShallow } from "zustand/shallow";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { TooltipIconButton } from "@/components/assistant-ui/tooltip-icon-button";
import {
  resolveArtifactChipIcon,
  type ArtifactChipIcon,
} from "@/components/chat/artifacts/artifact-chip-icon";
import { cn } from "@/lib/utils";

const AttachmentTypeIcon: FC<{ icon: ArtifactChipIcon; className?: string }> = ({
  icon,
  className,
}) => {
  if (icon.type === "asset") {
    return (
      <img src={icon.src} alt="" aria-hidden className={cn("shrink-0 object-contain", className)} />
    );
  }
  if (icon.lucide === "image") {
    return (
      <ImageIcon className={cn("shrink-0 text-muted-foreground", className)} aria-hidden />
    );
  }
  if (icon.lucide === "audio") {
    return (
      <FileAudio className={cn("shrink-0 text-muted-foreground", className)} aria-hidden />
    );
  }
  return <FileText className={cn("shrink-0 text-muted-foreground", className)} aria-hidden />;
};

function resolveAttachmentTypeLabel(fileName: string, icon: ArtifactChipIcon): string {
  const trimmed = fileName.trim();
  const dot = trimmed.lastIndexOf(".");
  if (dot > 0 && dot < trimmed.length - 1) {
    return trimmed.slice(dot + 1).toUpperCase();
  }
  switch (icon.kind) {
    case "pdf":
      return "PDF";
    case "word":
      return "DOC";
    case "excel":
      return "XLS";
    case "text":
      return "TXT";
    case "audio":
      return "AUDIO";
    case "image":
      return "IMAGE";
    default:
      return "FILE";
  }
}

const useAttachmentMeta = () => {
  const { mimeType, fileName, isImage } = useAuiState(
    useShallow((s) => ({
      mimeType:
        s.attachment.contentType ||
        s.attachment.file?.type ||
        "application/octet-stream",
      fileName: s.attachment.name,
      isImage: s.attachment.type === "image",
    })),
  );
  const icon = useMemo(
    () => resolveArtifactChipIcon({ mimeType, fileName }),
    [mimeType, fileName],
  );
  const typeLabel = useMemo(
    () => resolveAttachmentTypeLabel(fileName, icon),
    [fileName, icon],
  );
  return { mimeType, fileName, isImage, icon, typeLabel };
};

const useFileSrc = (file: File | undefined) => {
  const [src, setSrc] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!file) {
      setSrc(undefined);
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    setSrc(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [file]);

  return src;
};

const useAttachmentSrc = () => {
  const { file, src } = useAuiState(
    useShallow((s): { file?: File; src?: string } => {
      if (s.attachment.type !== "image") {return {};}
      if (s.attachment.file) {return { file: s.attachment.file };}
      const src = s.attachment.content?.filter((c) => c.type === "image")[0]
        ?.image;
      if (!src) {return {};}
      return { src };
    }),
  );

  return useFileSrc(file) ?? src;
};

type AttachmentPreviewProps = {
  src: string;
};

const AttachmentPreview: FC<AttachmentPreviewProps> = ({ src }) => {
  const [isLoaded, setIsLoaded] = useState(false);
  return (
    <img
      src={src}
      alt="Image Preview"
      className={cn(
        "block h-auto max-h-[80vh] w-auto max-w-full object-contain",
        isLoaded
          ? "aui-attachment-preview-image-loaded"
          : "aui-attachment-preview-image-loading invisible",
      )}
      onLoad={() => setIsLoaded(true)}
    />
  );
};

const AttachmentPreviewDialog: FC<PropsWithChildren> = ({ children }) => {
  const src = useAttachmentSrc();

  if (!src) {return children;}

  return (
    <Dialog>
      <DialogTrigger
        className="aui-attachment-preview-trigger cursor-pointer transition-colors hover:bg-accent/50"
        asChild
      >
        {children}
      </DialogTrigger>
      <DialogContent className="aui-attachment-preview-dialog-content p-2 sm:max-w-3xl [&>button]:rounded-full [&>button]:bg-foreground/60 [&>button]:p-1 [&>button]:opacity-100 [&>button]:ring-0! [&_svg]:text-background [&>button]:hover:[&_svg]:text-destructive">
        <DialogTitle className="aui-sr-only sr-only">
          Image Attachment Preview
        </DialogTitle>
        <div className="aui-attachment-preview relative mx-auto flex max-h-[80dvh] w-full items-center justify-center overflow-hidden bg-background">
          <AttachmentPreview src={src} />
        </div>
      </DialogContent>
    </Dialog>
  );
};

const AttachmentThumb: FC = () => {
  const src = useAttachmentSrc();

  return (
    <Avatar className="aui-attachment-tile-avatar h-full w-full rounded-none">
      <AvatarImage
        src={src}
        alt="Attachment preview"
        className="aui-attachment-tile-image object-cover"
      />
      <AvatarFallback className="rounded-none bg-muted">
        <ImageIcon className="aui-attachment-tile-fallback-icon size-8 text-muted-foreground" />
      </AvatarFallback>
    </Avatar>
  );
};

const ImageAttachmentCard: FC<{ isComposer: boolean }> = ({ isComposer }) => {
  const { fileName } = useAttachmentMeta();

  return (
    <div
      className={cn(
        "aui-attachment-image-card relative overflow-hidden rounded-xl border bg-muted",
        isComposer ? "size-14" : "size-16",
      )}
      title={fileName}
    >
      <AttachmentThumb />
    </div>
  );
};

const DocumentAttachmentCard: FC<{ isComposer: boolean }> = ({ isComposer }) => {
  const { fileName, icon, typeLabel } = useAttachmentMeta();

  return (
    <div
      className="aui-attachment-doc-card relative flex min-w-24 max-w-36 items-center gap-2.5 rounded-xl border bg-background px-2.5 py-2"
      title={fileName}
    >
      <div className="aui-attachment-doc-icon flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted">
        <AttachmentTypeIcon icon={icon} className="size-6" />
      </div>
      <div className="aui-attachment-doc-meta min-w-0 flex-1 pr-3">
        <div className="truncate text-sm font-semibold leading-tight text-foreground">
          {fileName}
        </div>
        <div className="truncate text-xs leading-tight text-muted-foreground">{typeLabel}</div>
      </div>
      {isComposer && <AttachmentRemove />}
    </div>
  );
};

const ImageAttachmentUI: FC<{ isComposer: boolean }> = ({ isComposer }) => {
  const { fileName } = useAttachmentMeta();

  return (
    <Tooltip>
      <AttachmentPrimitive.Root className="aui-attachment-root aui-attachment-root-image shrink-0">
        <div className="relative">
          <AttachmentPreviewDialog>
            <TooltipTrigger asChild>
              <div
                className="cursor-pointer transition-opacity hover:opacity-90"
                role="button"
                aria-label={fileName || "Image attachment"}
              >
                <ImageAttachmentCard isComposer={isComposer} />
              </div>
            </TooltipTrigger>
          </AttachmentPreviewDialog>
          {isComposer && <AttachmentRemove />}
        </div>
      </AttachmentPrimitive.Root>
      <TooltipContent side="top">
        <AttachmentPrimitive.Name />
      </TooltipContent>
    </Tooltip>
  );
};

const AttachmentUI: FC = () => {
  const aui = useAui();
  const isComposer = aui.attachment.source !== "message";
  const isImage = useAuiState((s) => s.attachment.type === "image");

  if (isImage) {
    return <ImageAttachmentUI isComposer={isComposer} />;
  }

  return (
    <AttachmentPrimitive.Root className="aui-attachment-root aui-attachment-root-document relative shrink-0">
      <DocumentAttachmentCard isComposer={isComposer} />
    </AttachmentPrimitive.Root>
  );
};

const AttachmentRemove: FC = () => {
  return (
    <AttachmentPrimitive.Remove asChild>
      <TooltipIconButton
        tooltip="Remove file"
        className="aui-attachment-remove absolute top-1 right-1 size-4 rounded-full bg-foreground p-0 text-background shadow-sm hover:bg-foreground/90 hover:text-background"
        side="top"
      >
        <XIcon className="size-2.5 stroke-[2.5px]" />
      </TooltipIconButton>
    </AttachmentPrimitive.Remove>
  );
};

export const UserMessageAttachments: FC = () => {
  return (
    <div className="aui-user-message-attachments-end col-span-full col-start-1 row-start-1 flex w-full flex-row justify-end gap-2">
      <MessagePrimitive.Attachments>
        {() => <AttachmentUI />}
      </MessagePrimitive.Attachments>
    </div>
  );
};

export const ComposerAttachments: FC = () => {
  return (
    <div className="aui-composer-attachments flex w-full flex-row flex-wrap items-center gap-2 overflow-x-auto px-4 empty:hidden">
      <ComposerPrimitive.Attachments>
        {() => <AttachmentUI />}
      </ComposerPrimitive.Attachments>
    </div>
  );
};

export const ComposerAddAttachment: FC = () => {
  return (
    <ComposerPrimitive.AddAttachment asChild>
      <TooltipIconButton
        tooltip="Add attachment"
        tooltipContent={
          <span className="flex flex-col leading-5">
            <span>Add attachment</span>
            <span>Image: max 10MB, File: max 100MB, Max 10 attachments</span>
          </span>
        }
        side="bottom"
        variant="ghost"
        size="icon"
        className="aui-composer-add-attachment size-8 rounded-full p-1 font-semibold text-xs hover:bg-muted-foreground/15 dark:border-muted-foreground/15 dark:hover:bg-muted-foreground/30"
        aria-label="Add attachment, the maximum size of an image is 10MB, the maximum size of a file is 100MB, and the maximum number of attachments is 10"
      >
        <PlusIcon className="aui-attachment-add-icon size-5 stroke-[1.5px]" />
      </TooltipIconButton>
    </ComposerPrimitive.AddAttachment>
  );
};
