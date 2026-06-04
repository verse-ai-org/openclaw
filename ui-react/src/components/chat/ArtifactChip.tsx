import { FileText, Image } from "lucide-react";
import { type FC, useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { downloadArtifact } from "@/components/chat/artifacts/artifact-gateway-client";
import { ArtifactPreviewDialog } from "@/components/chat/artifacts/ArtifactPreviewDialog";
import type { ArtifactRef, ArtifactSummary, MessageAttachment } from "@/components/chat/types";
import {
  resolveArtifactDisplayMime,
  resolveArtifactDisplayTitle,
} from "./artifact-helpers";
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
  const downloadMode = summary?.download.mode;
  const canPreviewImage = downloadMode === "bytes" && mimeType.startsWith("image/");
  const canOpenUrl = downloadMode === "url";

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const openPreview = useCallback(async () => {
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
      });
      if (result.url) {
        window.open(result.url, "_blank", "noopener,noreferrer");
        return;
      }
      if (result.encoding === "base64" && result.data) {
        const dataUrl = `data:${mimeType};base64,${result.data}`;
        setPreviewDataUrl(dataUrl);
        setPreviewOpen(true);
        return;
      }
      toast.error("Preview unavailable for this artifact");
    } catch (err) {
      console.warn("[artifacts] download failed:", err);
      toast.error("Could not load artifact preview");
    } finally {
      setLoading(false);
    }
  }, [artifactRef.artifactId, mimeType, sessionKey]);

  const handleClick = useCallback(() => {
    if (loading) {
      return;
    }
    if (canOpenUrl && summary) {
      void openPreview();
      return;
    }
    if (canPreviewImage) {
      void openPreview();
    }
  }, [canOpenUrl, canPreviewImage, loading, openPreview, summary]);

  const interactive = canPreviewImage || canOpenUrl;

  return (
    <>
      <ArtifactChip
        title={loading ? `${title}…` : title}
        mimeType={mimeType}
        interactive={interactive}
        onClick={interactive ? handleClick : undefined}
      />
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

export const LegacyAttachmentChip: FC<{ attachment: MessageAttachment }> = ({ attachment }) => (
  <ArtifactChip title={attachment.fileName} mimeType={attachment.mimeType} />
);
