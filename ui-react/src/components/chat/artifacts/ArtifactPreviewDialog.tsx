import { Download } from "lucide-react";
import { type FC, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { ArtifactPreviewContent } from "./artifact-preview-content";
import type { ArtifactPreviewKind } from "./artifact-preview-mime";

export const ArtifactPreviewDialog: FC<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  mimeType: string;
  previewKind: ArtifactPreviewKind;
  /** Blob/data URL for image, PDF, or audio. */
  contentSrc?: string;
  /** Decoded text for text previews. */
  textContent?: string;
  onDownload?: () => void;
  downloading?: boolean;
}> = ({
  open,
  onOpenChange,
  title,
  previewKind,
  contentSrc,
  textContent,
  onDownload,
  downloading = false,
}) => {
  useEffect(() => {
    if (!open && contentSrc?.startsWith("blob:")) {
      URL.revokeObjectURL(contentSrc);
    }
  }, [open, contentSrc]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "grid w-[min(96vw,72rem)] max-w-[min(96vw,72rem)] gap-3 overflow-hidden p-4 sm:max-w-[min(96vw,72rem)] sm:p-6",
        )}
      >
        <DialogHeader className="min-w-0 shrink-0">
          <DialogTitle className="truncate text-sm font-medium" title={title}>
            {title}
          </DialogTitle>
        </DialogHeader>
        <ArtifactPreviewContent
          previewKind={previewKind}
          title={title}
          contentSrc={contentSrc}
          textContent={textContent}
        />
        <DialogFooter className="gap-2 sm:justify-end">
          {onDownload ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={downloading}
              onClick={onDownload}
            >
              <Download className="size-3.5" />
              Download
            </Button>
          ) : null}
          <Button type="button" variant="secondary" size="sm" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
