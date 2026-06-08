import {
  Download,
  ExternalLink,
  FileAudio,
  FileText,
  Files,
  Image,
  MoreHorizontal,
} from "lucide-react";
import { type FC, useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { downloadArtifact } from "@/components/chat/artifacts/artifact-gateway-client";
import { saveArtifactBytes } from "@/components/chat/artifacts/artifact-file-save";
import {
  createBlobUrlFromBase64,
  decodeTextFromBase64,
} from "@/components/chat/artifacts/artifact-preview-bytes";
import {
  exceedsPreviewMaxBytes,
  resolveArtifactPreviewKind,
} from "@/components/chat/artifacts/artifact-preview-mime";
import { ArtifactPreviewDialog } from "@/components/chat/artifacts/ArtifactPreviewDialog";
import { isLegacySyntheticArtifactId } from "@/components/chat/artifacts/legacy-artifact-refs";
import type { ArtifactRef, ArtifactSummary, MessageAttachment } from "@/components/chat/types";
import {
  resolveArtifactChipTitleTooltip,
  resolveArtifactDisplayMime,
  resolveArtifactDisplayTitle,
} from "@/components/chat/artifacts/artifact-helpers";
import {
  isArtifactChipInteractive,
  isArtifactPreviewInteraction,
  isElectronEnvironment,
  resolveArtifactPrimaryInteraction,
  resolveArtifactRenderType,
  resolveArtifactSecondaryInteraction,
  type ArtifactChipInteraction,
} from "./artifacts/artifact-renderer-registry";
import { resolveArtifactChipIcon } from "@/components/chat/artifacts/artifact-chip-icon";
import {
  discardStagingCopy,
  replaceOriginalWithStagingCopy,
  revealLocalPath,
  saveStagingCopyAs,
} from "@/components/chat/artifacts/artifact-staging-actions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useArtifactCacheStore } from "@/store/artifact-cache.store";
import { useGatewayStore } from "@/store/gateway.store";

type ArtifactChipProps = {
  title: string;
  mimeType: string;
  fileName?: string;
  className?: string;
  interactive?: boolean;
  loading?: boolean;
  onClick?: () => void;
  titleTooltip?: string;
};

export const ArtifactChip: FC<ArtifactChipProps> = ({
  title,
  mimeType,
  fileName,
  className,
  interactive = false,
  loading = false,
  onClick,
  titleTooltip,
}) => {
  const icon = useMemo(
    () => resolveArtifactChipIcon({ mimeType, fileName: fileName ?? title }),
    [fileName, mimeType, title],
  );
  const Comp = interactive ? "button" : "div";
  return (
    <Comp
      type={interactive ? "button" : undefined}
      onClick={interactive && !loading ? onClick : undefined}
      disabled={interactive && loading ? true : undefined}
      title={titleTooltip ?? title}
      aria-label={titleTooltip ?? title}
      className={cn(
        "flex items-center gap-1.5 rounded-lg bg-muted px-2.5 py-1.5 text-xs text-muted-foreground",
        "transition-colors",
        interactive && "cursor-pointer ring-1 ring-border/40 hover:bg-muted hover:text-foreground hover:ring-border",
        !interactive && "cursor-default opacity-70",
        interactive && loading && "cursor-wait opacity-60",
        className,
      )}
    >
      {icon.type === "asset" ? (
        <img src={icon.src} alt="" aria-hidden className="size-4 shrink-0" />
      ) : icon.lucide === "image" ? (
        <Image className="size-3.5 shrink-0" />
      ) : icon.lucide === "audio" ? (
        <FileAudio className="size-3.5 shrink-0" />
      ) : (
        <FileText className="size-3.5 shrink-0" />
      )}
      <span className="truncate font-medium">{title}</span>
    </Comp>
  );
};

type PreviewState = {
  previewKind: ReturnType<typeof resolveArtifactPreviewKind>;
  contentSrc?: string;
  textContent?: string;
};

export const ArtifactRefChip: FC<{
  sessionKey: string;
  artifactRef: ArtifactRef;
  artifacts?: ArtifactSummary[];
  attachmentHint?: MessageAttachment;
}> = ({ sessionKey, artifactRef, artifacts, attachmentHint }) => {
  const cached = useArtifactCacheStore((s) => s.getSummary(sessionKey, artifactRef.artifactId));
  const summary = useMemo(
    () => artifacts?.find((a) => a.id === artifactRef.artifactId) ?? cached,
    [artifacts, artifactRef.artifactId, cached],
  );
  const summaries = artifacts ?? (summary ? [summary] : undefined);
  const title = resolveArtifactDisplayTitle(artifactRef, summaries, attachmentHint);
  const mimeType = resolveArtifactDisplayMime(artifactRef, summaries, attachmentHint);
  const renderType = resolveArtifactRenderType(summary, mimeType);
  const primaryInteraction = resolveArtifactPrimaryInteraction({
    summary,
    renderType,
    mimeType,
    downloadMode: summary?.download.mode,
    source: summary?.source,
    ingestChannel: summary?.ingestChannel,
    role: artifactRef.role ?? summary?.role,
    isElectron: isElectronEnvironment(),
  });
  const isElectron = isElectronEnvironment();
  const secondaryInteraction = resolveArtifactSecondaryInteraction(primaryInteraction, {
    summary,
    isElectron,
  });
  const hasStagingActions = Boolean(
    isElectron &&
      summary?.stagingRevealPath?.trim() &&
      summary?.localRevealPath?.trim(),
  );

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewState, setPreviewState] = useState<PreviewState | null>(null);
  const [loading, setLoading] = useState(false);

  const chipTitleTooltip = useMemo(
    () => resolveArtifactChipTitleTooltip({ title, summary }),
    [summary, title],
  );

  const clearPreviewState = useCallback(() => {
    setPreviewState((current) => {
      if (current?.contentSrc?.startsWith("blob:")) {
        URL.revokeObjectURL(current.contentSrc);
      }
      return null;
    });
  }, []);

  useEffect(() => () => clearPreviewState(), [clearPreviewState]);

  const applyDownloadResult = useCallback(
    (
      result: { encoding?: "base64"; data?: string; url?: string },
      action: ArtifactChipInteraction,
    ) => {
      if (result.url) {
        window.open(result.url, "_blank", "noopener,noreferrer");
        return true;
      }
      if (result.encoding !== "base64" || !result.data) {
        return false;
      }

      if (action === "download-file") {
        saveArtifactBytes({ data: result.data, mimeType, fileName: title });
        toast.success(`Saved ${title}`);
        return true;
      }

      const previewKind = resolveArtifactPreviewKind(mimeType);
      if (previewKind === "text") {
        clearPreviewState();
        setPreviewState({
          previewKind,
          textContent: decodeTextFromBase64(result.data),
        });
        setPreviewOpen(true);
        return true;
      }

      if (previewKind === "image" || previewKind === "pdf" || previewKind === "audio") {
        clearPreviewState();
        const contentSrc =
          previewKind === "image"
            ? `data:${mimeType};base64,${result.data}`
            : createBlobUrlFromBase64(result.data, mimeType);
        setPreviewState({ previewKind, contentSrc });
        setPreviewOpen(true);
        return true;
      }

      return false;
    },
    [clearPreviewState, mimeType, title],
  );

  const fetchArtifactBytes = useCallback(async () => {
    const cached = useArtifactCacheStore
      .getState()
      .getDownload(sessionKey, artifactRef.artifactId);
    if (cached?.url) {
      return { url: cached.url };
    }
    if (cached?.encoding === "base64" && cached.data) {
      return { encoding: "base64" as const, data: cached.data };
    }

    const client = useGatewayStore.getState().client;
    if (!client?.connected) {
      toast.error("Gateway not connected");
      return null;
    }
    const result = await downloadArtifact(client, {
      sessionKey,
      artifactId: artifactRef.artifactId,
      mimeType,
    });
    return result;
  }, [artifactRef.artifactId, mimeType, sessionKey]);

  const runArtifactAction = useCallback(
    async (action: ArtifactChipInteraction) => {
      if (isLegacySyntheticArtifactId(artifactRef.artifactId)) {
        return;
      }

      if (action === "reveal-in-folder" || action === "reveal-staging-in-folder") {
        const revealPath =
          action === "reveal-staging-in-folder"
            ? summary?.stagingRevealPath?.trim()
            : summary?.localRevealPath?.trim();
        if (!revealPath) {
          return;
        }
        setLoading(true);
        try {
          const result = await revealLocalPath(revealPath);
          if (!result.ok) {
            toast.error(`Could not locate ${title}`);
          }
        } catch (err) {
          console.warn("[artifacts] reveal failed:", err);
          toast.error(`Could not locate ${title}`);
        } finally {
          setLoading(false);
        }
        return;
      }

      if (action === "open-url" || action === "download-file" || isArtifactPreviewInteraction(action)) {
        if (
          isArtifactPreviewInteraction(action) &&
          exceedsPreviewMaxBytes(summary?.sizeBytes)
        ) {
          toast.info("File is large; downloading instead");
        }
        setLoading(true);
        try {
          const result = await fetchArtifactBytes();
          if (!result) {
            return;
          }
          const effectiveAction =
            isArtifactPreviewInteraction(action) && exceedsPreviewMaxBytes(summary?.sizeBytes)
              ? "download-file"
              : action;
          if (!applyDownloadResult(result, effectiveAction)) {
            toast.error(
              effectiveAction === "download-file"
                ? "Download unavailable for this artifact"
                : "Preview unavailable for this artifact",
            );
          }
        } catch (err) {
          console.warn("[artifacts] artifact action failed:", err);
          toast.error(
            action === "download-file"
              ? "Could not download artifact"
              : "Could not load artifact preview",
          );
        } finally {
          setLoading(false);
        }
      }
    },
    [
      applyDownloadResult,
      artifactRef.artifactId,
      fetchArtifactBytes,
      summary?.localRevealPath,
      summary?.stagingRevealPath,
      summary?.sizeBytes,
      title,
    ],
  );

  const handleReplaceOriginal = useCallback(async () => {
    const stagingPath = summary?.stagingRevealPath?.trim();
    const originalPath = summary?.localRevealPath?.trim();
    if (!stagingPath || !originalPath) {
      return;
    }
    setLoading(true);
    try {
      const result = await replaceOriginalWithStagingCopy({
        stagingPath,
        originalPath,
        fileName: title,
      });
      if (result.ok) {
        toast.success(`Replaced ${title} with the edited copy`);
      } else if (result.error !== "cancelled") {
        toast.error(`Could not replace ${title}`);
      }
    } finally {
      setLoading(false);
    }
  }, [summary?.localRevealPath, summary?.stagingRevealPath, title]);

  const handleSaveStagingCopyAs = useCallback(async () => {
    const stagingPath = summary?.stagingRevealPath?.trim();
    if (!stagingPath) {
      return;
    }
    setLoading(true);
    try {
      const result = await saveStagingCopyAs({ stagingPath, defaultName: title });
      if (result.ok) {
        toast.success(`Saved copy as ${result.savedPath ?? title}`);
      } else if (result.error !== "cancelled") {
        toast.error(`Could not save ${title}`);
      }
    } finally {
      setLoading(false);
    }
  }, [summary?.stagingRevealPath, title]);

  const handleDiscardStagingCopy = useCallback(async () => {
    const stagingPath = summary?.stagingRevealPath?.trim();
    if (!stagingPath || !summary) {
      return;
    }
    setLoading(true);
    try {
      const result = await discardStagingCopy(stagingPath);
      if (result.ok) {
        const { stagingRevealPath: _removed, ...rest } = summary;
        useArtifactCacheStore.getState().mergeSummaries(sessionKey, [rest]);
        toast.success(`Discarded workspace copy of ${title}`);
      } else if (result.error !== "cancelled") {
        toast.error(`Could not discard workspace copy`);
      }
    } finally {
      setLoading(false);
    }
  }, [sessionKey, summary, title]);

  const handlePrimaryClick = useCallback(() => {
    if (loading || !isArtifactChipInteractive(primaryInteraction)) {
      return;
    }
    void runArtifactAction(primaryInteraction);
  }, [loading, primaryInteraction, runArtifactAction]);

  const handleSecondaryClick = useCallback(() => {
    if (loading || secondaryInteraction === "none") {
      return;
    }
    void runArtifactAction(secondaryInteraction);
  }, [loading, runArtifactAction, secondaryInteraction]);

  const handlePreviewDownload = useCallback(() => {
    void runArtifactAction("download-file");
  }, [runArtifactAction]);

  const showSecondaryAction = secondaryInteraction !== "none";
  const SecondaryIcon =
    secondaryInteraction === "open-url"
      ? ExternalLink
      : secondaryInteraction === "reveal-staging-in-folder"
        ? Files
        : Download;
  const secondaryLabel =
    secondaryInteraction === "open-url"
      ? `Open ${title}`
      : secondaryInteraction === "reveal-staging-in-folder"
        ? `Show workspace copy of ${title}`
        : `Download ${title}`;

  const primaryAriaLabel = useMemo(() => {
    switch (primaryInteraction) {
      case "preview-image":
      case "preview-file":
        return `Preview ${title}`;
      case "reveal-in-folder":
        return `Show original ${title} in folder`;
      case "reveal-staging-in-folder":
        return `Show workspace copy of ${title}`;
      case "download-file":
        return `Download ${title}`;
      case "open-url":
        return `Open ${title}`;
      default:
        return title;
    }
  }, [primaryInteraction, title]);

  return (
    <>
      <div className="flex items-center gap-1">
        {hasStagingActions ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                title={`Staging actions for ${title}`}
                aria-label={`Staging actions for ${title}`}
                disabled={loading}
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-lg hidden",
                  "text-muted-foreground",
                  "hover:bg-muted hover:text-foreground transition-colors",
                  "disabled:pointer-events-none disabled:opacity-50",
                )}
              >
                <MoreHorizontal className="size-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onClick={() => void handleSaveStagingCopyAs()}>
                Save copy as…
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void handleReplaceOriginal()}>
                Replace original…
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void handleDiscardStagingCopy()}>
                Discard workspace copy
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
        {showSecondaryAction ? (
          <button
            type="button"
            title={secondaryLabel}
            aria-label={secondaryLabel}
            disabled={loading}
            onClick={handleSecondaryClick}
            className={cn(
              "flex size-7 shrink-0 items-center justify-center rounded-lg hidden",
              "text-muted-foreground",
              "hover:bg-muted hover:text-foreground transition-colors",
              "disabled:pointer-events-none disabled:opacity-50",
            )}
          >
            <SecondaryIcon className="size-3.5" />
          </button>
        ) : null}
        <ArtifactChip
          title={loading && isArtifactChipInteractive(primaryInteraction) ? `${title}…` : title}
          mimeType={mimeType}
          fileName={title}
          loading={loading}
          interactive={isArtifactChipInteractive(primaryInteraction)}
          titleTooltip={chipTitleTooltip ?? primaryAriaLabel}
          onClick={isArtifactChipInteractive(primaryInteraction) ? handlePrimaryClick : undefined}
        />
      </div>
      {previewState ? (
        <ArtifactPreviewDialog
          open={previewOpen}
          onOpenChange={(open) => {
            setPreviewOpen(open);
            if (!open) {
              clearPreviewState();
            }
          }}
          title={title}
          mimeType={mimeType}
          previewKind={previewState.previewKind}
          contentSrc={previewState.contentSrc}
          textContent={previewState.textContent}
          onDownload={secondaryInteraction === "download-file" ? handlePreviewDownload : undefined}
          downloading={loading}
        />
      ) : null}
    </>
  );
};
