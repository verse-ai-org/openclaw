import { type FC, useState } from "react";
import { cn } from "@/lib/utils";
import type { ArtifactSummary, MessageAttachment } from "@/components/chat/types";
import { buildAssistantMediaUrl } from "./artifact-inbound-url";
import { ArtifactPreviewDialog } from "./ArtifactPreviewDialog";
import { useSettingsStore } from "@/store/settings.store";
import { buildInboundImageSources } from "./inbound-image-sources";

export const InlineInboundImages: FC<{
  attachments?: MessageAttachment[];
  artifacts?: ArtifactSummary[];
  className?: string;
}> = ({ attachments, artifacts, className }) => {
  const gatewayUrl = useSettingsStore((s) => s.settings.gatewayUrl);
  const token = useSettingsStore((s) => s.settings.token);
  const sources = buildInboundImageSources({ attachments, artifacts });
  const [preview, setPreview] = useState<ReturnType<typeof buildInboundImageSources>[number] | null>(null);

  if (sources.length === 0) {
    return null;
  }

  return (
    <>
      <div className={cn("flex flex-wrap gap-2", className)}>
        {sources.map((item) => {
          const src =
            item.src ||
            buildAssistantMediaUrl({
              gatewayUrl,
              token,
              mediaRef: item.key,
            });
          if (!src) {
            return null;
          }
          return (
            <button
              key={item.key}
              type="button"
              title={item.fileName}
              aria-label={`View image: ${item.fileName}`}
              onClick={() => setPreview({ ...item, src })}
              className={cn(
                "max-w-full rounded-lg border border-border p-0",
                "cursor-zoom-in transition-opacity hover:opacity-90",
                "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none",
              )}
            >
              <img
                src={src}
                alt=""
                className="max-h-56 max-w-full rounded-lg object-contain"
                loading="lazy"
              />
            </button>
          );
        })}
      </div>
      {preview ? (
        <ArtifactPreviewDialog
          open
          onOpenChange={(open) => {
            if (!open) {
              setPreview(null);
            }
          }}
          title={preview.fileName}
          mimeType={preview.mimeType}
          previewKind="image"
          contentSrc={preview.src}
        />
      ) : null}
    </>
  );
};
