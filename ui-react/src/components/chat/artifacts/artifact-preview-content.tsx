import type { FC } from "react";
import type { ArtifactPreviewKind } from "./artifact-preview-mime";

export const ArtifactPreviewContent: FC<{
  previewKind: ArtifactPreviewKind;
  title: string;
  contentSrc?: string;
  textContent?: string;
}> = ({ previewKind, title, contentSrc, textContent }) => {
  if (previewKind === "image" && contentSrc) {
    return (
      <div className="flex min-h-0 min-w-0 justify-center overflow-auto">
        <img
          src={contentSrc}
          alt={title}
          className="mx-auto max-h-[min(80vh,80rem)] max-w-full rounded-md object-contain"
        />
      </div>
    );
  }
  if (previewKind === "pdf" && contentSrc) {
    return (
      <iframe
        src={contentSrc}
        title={title}
        className="h-[min(80vh,48rem)] w-full rounded-md border border-border bg-background"
      />
    );
  }
  if (previewKind === "audio" && contentSrc) {
    return (
      <div className="flex justify-center py-4">
        <audio controls src={contentSrc} className="w-full max-w-lg">
          <track kind="captions" />
        </audio>
      </div>
    );
  }
  if (previewKind === "text" && textContent !== undefined) {
    return (
      <pre className="max-h-[min(80vh,48rem)] overflow-auto rounded-md border border-border bg-muted/30 p-3 text-xs leading-relaxed">
        {textContent}
      </pre>
    );
  }
  return <p className="text-sm text-muted-foreground">Preview is not available for this file.</p>;
};
