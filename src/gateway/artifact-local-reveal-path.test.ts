import { describe, expect, it } from "vitest";
import {
  clientSupportsElectronReveal,
  projectArtifactSummaryForClient,
} from "./artifact-local-reveal-path.js";

describe("artifact-local-reveal-path", () => {
  it("detects electron capability", () => {
    expect(clientSupportsElectronReveal(["tool-events", "electron"])).toBe(true);
    expect(clientSupportsElectronReveal(["tool-events"])).toBe(false);
  });

  it("strips localRevealPath for non-electron clients", () => {
    const summary = {
      id: "artifact_x",
      type: "file",
      title: "doc.pdf",
      ingestChannel: "path-ref" as const,
      localRevealPath: "/tmp/doc.pdf",
      download: { mode: "unsupported" as const },
    };
    expect(projectArtifactSummaryForClient(summary, false)).toEqual({
      id: "artifact_x",
      type: "file",
      title: "doc.pdf",
      ingestChannel: "path-ref",
      download: { mode: "unsupported" },
    });
    expect(projectArtifactSummaryForClient(summary, true)).toEqual(summary);
  });

  it("strips stagingRevealPath for non-electron clients", () => {
    const summary = {
      id: "artifact_x",
      type: "file",
      title: "doc.pdf",
      ingestChannel: "path-ref" as const,
      localRevealPath: "/tmp/doc.pdf",
      stagingRevealPath: "/workspace/staging/doc.pdf",
      download: { mode: "unsupported" as const },
    };
    expect(projectArtifactSummaryForClient(summary, false)).toEqual({
      id: "artifact_x",
      type: "file",
      title: "doc.pdf",
      ingestChannel: "path-ref",
      download: { mode: "unsupported" },
    });
  });
});
