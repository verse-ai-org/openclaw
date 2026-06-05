import { Download, ExternalLink, FileText, Image } from "lucide-react";
import { type FC, useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { downloadArtifact } from "@/components/chat/artifacts/artifact-gateway-client";
import { saveArtifactBytes } from "@/components/chat/artifacts/artifact-file-save";
import { ArtifactPreviewDialog } from "@/components/chat/artifacts/ArtifactPreviewDialog";
import { isLegacySyntheticArtifactId } from "@/components/chat/artifacts/legacy-artifact-refs";
import type { ArtifactRef, ArtifactSummary, MessageAttachment } from "@/components/chat/types";
import {
  resolveArtifactDisplayMime,
  resolveArtifactDisplayTitle,
} from "./artifact-helpers";
import {
  resolveArtifactChipInteraction,
  resolveArtifactRenderType,
} from "./artifacts/artifact-renderer-registry";
import { useArtifactCacheStore } from "@/store/artifact-cache.store";
import { useGatewayStore } from "@/store/gateway.store";

type ArtifactChipProps = {
  title: string;
  mimeType: string;
  className?: string;
  interactive?: boolean;
  onClick?: () => void;
};

export const ArtifactChip: FC<ArtifactChipProps> = ({
  title,
  mimeType,
  className,
  interactive = false,
  onClick,
}) => {
  const isImage = mimeType.startsWith("image/");
  const Comp = interactive ? "button" : "div";
  return (
    <Comp
      type={interactive ? "button" : undefined}
      onClick={interactive ? onClick : undefined}
      className={cn(
        "flex items-center gap-1.5 rounded-lg bg-muted px-2.5 py-1.5 text-xs text-muted-foreground",
        interactive && "cursor-pointer hover:bg-muted/80 transition-colors",
        className,
      )}
    >
      {isImage ? (
        <Image className="size-3.5 shrink-0" />
      ) : (
        <FileText className="size-3.5 shrink-0" />
      )}
      <span className="truncate font-medium">{title}</span>
    </Comp>
  );
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
  const chipInteraction = resolveArtifactChipInteraction({
    renderType,
    mimeType,
    downloadMode: summary?.download.mode,
  });

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const applyDownloadResult = useCallback(
    (result: { encoding?: "base64"; data?: string; url?: string }) => {
      if (result.url) {
        window.open(result.url, "_blank", "noopener,noreferrer");
        return true;
      }
      if (result.encoding !== "base64" || !result.data) {
        return false;
      }
      if (chipInteraction === "download-file") {
        saveArtifactBytes({ data: result.data, mimeType, fileName: title });
        toast.success(`Saved ${title}`);
        return true;
      }
      const dataUrl = `data:${mimeType};base64,${result.data}`;
      setPreviewDataUrl(dataUrl);
      setPreviewOpen(true);
      return true;
    },
    [chipInteraction, mimeType, title],
  );

  const openArtifactAction = useCallback(async () => {
    if (isLegacySyntheticArtifactId(artifactRef.artifactId)) {
      return;
    }

    const cached = useArtifactCacheStore
      .getState()
      .getDownload(sessionKey, artifactRef.artifactId);
    if (cached?.url) {
      window.open(cached.url, "_blank", "noopener,noreferrer");
      return;
    }
    if (cached?.encoding === "base64" && cached.data) {
      if (applyDownloadResult({ encoding: "base64", data: cached.data })) {
        return;
      }
    }

    const client = useGatewayStore.getState().client;
    if (!client?.connected) {
      toast.error("Gateway not connected");
      return;
    }
    setLoading(true);
    try {
      const result = await downloadArtifact(client, {
        sessionKey,
        artifactId: artifactRef.artifactId,
        mimeType,
      });
      if (!applyDownloadResult(result)) {
        toast.error(
          chipInteraction === "download-file"
            ? "Download unavailable for this artifact"
            : "Preview unavailable for this artifact",
        );
      }
    } catch (err) {
      console.warn("[artifacts] download failed:", err);
      toast.error(
        chipInteraction === "download-file"
          ? "Could not download artifact"
          : "Could not load artifact preview",
      );
    } finally {
      setLoading(false);
    }
  }, [
    applyDownloadResult,
    artifactRef.artifactId,
    chipInteraction,
    mimeType,
    sessionKey,
    title,
  ]);

  const handlePreviewClick = useCallback(() => {
    if (loading || chipInteraction !== "preview-image") {
      return;
    }
    void openArtifactAction();
  }, [chipInteraction, loading, openArtifactAction]);

  const handleDownloadClick = useCallback(() => {
    if (loading || (chipInteraction !== "download-file" && chipInteraction !== "open-url")) {
      return;
    }
    void openArtifactAction();
  }, [chipInteraction, loading, openArtifactAction]);

  const showDownloadAction =
    chipInteraction === "download-file" || chipInteraction === "open-url";
  const ActionIcon = chipInteraction === "open-url" ? ExternalLink : Download;
  const actionLabel =
    chipInteraction === "open-url" ? `Open ${title}` : `Download ${title}`;

  return (
    <>
      <div className="flex items-center gap-1">
        {showDownloadAction ? (
          <button
            type="button"
            title={actionLabel}
            aria-label={actionLabel}
            disabled={loading}
            onClick={handleDownloadClick}
            className={cn(
              "flex size-7 shrink-0 items-center justify-center rounded-lg",
              "text-muted-foreground",
              "hover:bg-muted hover:text-foreground transition-colors",
              "disabled:pointer-events-none disabled:opacity-50",
            )}
          >
            <ActionIcon className="size-3.5" />
          </button>
        ) : null}
        <ArtifactChip
          title={loading && chipInteraction === "preview-image" ? `${title}…` : title}
          mimeType={mimeType}
          interactive={chipInteraction === "preview-image"}
          onClick={chipInteraction === "preview-image" ? handlePreviewClick : undefined}
        />
      </div>
      {previewDataUrl ? (
        <ArtifactPreviewDialog
          open={previewOpen}
          onOpenChange={setPreviewOpen}
          title={title}
          mimeType={mimeType}
          imageSrc={previewDataUrl}
        />
      ) : null}
    </>
  );
};
