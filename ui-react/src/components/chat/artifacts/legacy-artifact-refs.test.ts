import { describe, expect, it } from "vitest";
import {
  isLegacySyntheticArtifactId,
  legacyArtifactIdForAttachment,
  syntheticArtifactRefsFromLegacyAttachments,
} from "./legacy-artifact-refs";

describe("legacy-artifact-refs", () => {
  it("builds stable synthetic ids for legacy attachment hints", () => {
    expect(
      legacyArtifactIdForAttachment({ fileName: "report.pdf", mimeType: "application/pdf", size: 0 }),
    ).toBe("legacy:report.pdf");
    expect(
      syntheticArtifactRefsFromLegacyAttachments([
        { fileName: "report.pdf", mimeType: "application/pdf", size: 0 },
      ]),
    ).toEqual([{ artifactId: "legacy:report.pdf", role: "input" }]);
  });

  it("detects legacy synthetic artifact ids", () => {
    expect(isLegacySyntheticArtifactId("legacy:report.pdf")).toBe(true);
    expect(isLegacySyntheticArtifactId("artifact_abc")).toBe(false);
  });
});
