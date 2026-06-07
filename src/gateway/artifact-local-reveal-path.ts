import type { ArtifactSummary } from "./protocol/index.js";

export function clientSupportsElectronReveal(caps: unknown): boolean {
  return Array.isArray(caps) && caps.some((cap) => cap === "electron");
}

export function projectArtifactSummaryForClient(
  summary: ArtifactSummary,
  allowLocalRevealPath: boolean,
): ArtifactSummary {
  if (allowLocalRevealPath) {
    return summary;
  }
  let projected = summary;
  if (summary.localRevealPath) {
    const { localRevealPath: _removed, ...rest } = projected;
    projected = rest;
  }
  if (summary.stagingRevealPath) {
    const { stagingRevealPath: _removed, ...rest } = projected;
    projected = rest;
  }
  return projected;
}

export function projectArtifactSummariesForClient(
  summaries: ArtifactSummary[],
  allowLocalRevealPath: boolean,
): ArtifactSummary[] {
  return summaries.map((summary) =>
    projectArtifactSummaryForClient(summary, allowLocalRevealPath),
  );
}
