import type { FC } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export const ArtifactPreviewDialog: FC<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  mimeType: string;
  /** Image URL (https, blob, or data URL). */
  imageSrc: string;
}> = ({ open, onOpenChange, title, mimeType, imageSrc }) => (
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
      {mimeType.startsWith("image/") ? (
        <div className="flex min-h-0 min-w-0 justify-center overflow-auto">
          <img
            src={imageSrc}
            alt={title}
            className="mx-auto max-h-[min(80vh,80rem)] max-w-full rounded-md object-contain"
          />
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Preview is only available for images in this build.
        </p>
      )}
    </DialogContent>
  </Dialog>
);
