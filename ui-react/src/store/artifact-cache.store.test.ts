import { describe, expect, it, beforeEach } from "vitest";
import { useArtifactCacheStore } from "./artifact-cache.store";

describe("artifact-cache.store", () => {
  beforeEach(() => {
    useArtifactCacheStore.setState({ bySession: {}, versionBySession: {} });
  });

  it("merges summaries by session and id", () => {
    useArtifactCacheStore.getState().mergeSummaries("agent:main:main", [
      {
        id: "artifact_a",
        type: "image",
        title: "a.png",
        download: { mode: "bytes" },
      },
    ]);
    useArtifactCacheStore.getState().mergeSummaries("agent:main:main", [
      {
        id: "artifact_b",
        type: "file",
        title: "b.pdf",
        download: { mode: "unsupported" },
      },
    ]);
    expect(useArtifactCacheStore.getState().getSummary("agent:main:main", "artifact_a")?.title).toBe(
      "a.png",
    );
    expect(useArtifactCacheStore.getState().getSummary("agent:main:main", "artifact_b")?.title).toBe(
      "b.pdf",
    );
  });

  it("bumps version when summaries merge", () => {
    useArtifactCacheStore.getState().mergeSummaries("agent:main:main", [
      { id: "artifact_a", type: "image", title: "a.png", download: { mode: "bytes" } },
    ]);
    expect(useArtifactCacheStore.getState().versionBySession["agent:main:main"]).toBe(1);
  });

  it("clears a session bucket", () => {
    useArtifactCacheStore.getState().mergeSummaries("agent:main:main", [
      { id: "artifact_a", type: "image", title: "a.png", download: { mode: "bytes" } },
    ]);
    useArtifactCacheStore.getState().clearSession("agent:main:main");
    expect(useArtifactCacheStore.getState().getSummary("agent:main:main", "artifact_a")).toBeUndefined();
  });
});
