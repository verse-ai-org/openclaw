import { describe, expect, it } from "vitest";
import {
  exceedsPreviewMaxBytes,
  isPreviewableMime,
  PREVIEW_MAX_BYTES,
  resolveArtifactPreviewKind,
} from "./artifact-preview-mime";

describe("artifact-preview-mime", () => {
  it("classifies previewable mime types", () => {
    expect(resolveArtifactPreviewKind("application/pdf")).toBe("pdf");
    expect(resolveArtifactPreviewKind("text/plain")).toBe("text");
    expect(resolveArtifactPreviewKind("audio/mpeg")).toBe("audio");
    expect(resolveArtifactPreviewKind("application/vnd.openxmlformats-officedocument.wordprocessingml.document")).toBe(
      "none",
    );
    expect(isPreviewableMime("application/json")).toBe(true);
    expect(isPreviewableMime("application/zip")).toBe(false);
  });

  it("enforces preview size threshold", () => {
    expect(exceedsPreviewMaxBytes(PREVIEW_MAX_BYTES)).toBe(false);
    expect(exceedsPreviewMaxBytes(PREVIEW_MAX_BYTES + 1)).toBe(true);
    expect(exceedsPreviewMaxBytes(undefined)).toBe(false);
  });
});
