import { describe, expect, it, beforeEach } from "vitest";
import { useArtifactCacheStore } from "@/store/artifact-cache.store";
import { enrichChatMessageWithArtifactCache } from "./resolve-message-artifacts";

describe("enrichChatMessageWithArtifactCache", () => {
  beforeEach(() => {
    useArtifactCacheStore.setState({ bySession: {}, versionBySession: {} });
  });

  it("hydrates artifacts and attachment mediaRef from cache after history reload", () => {
    useArtifactCacheStore.getState().mergeSummaries("agent:main:main", [
      {
        id: "artifact_1",
        type: "image",
        title: "photo.png",
        mimeType: "image/png",
        mediaRef: "media://inbound/photo.png",
        download: { mode: "bytes" },
      },
    ]);
    const enriched = enrichChatMessageWithArtifactCache("agent:main:main", {
      id: "u1",
      role: "user",
      content: "check this",
      ts: 1,
      artifactRefs: [{ artifactId: "artifact_1", role: "input" }],
      attachments: [{ fileName: "photo.png", mimeType: "image/png", size: 0 }],
    });
    expect(enriched.artifacts?.[0]?.mediaRef).toBe("media://inbound/photo.png");
    expect(enriched.attachments?.[0]?.mediaRef).toBe("media://inbound/photo.png");
  });

  it("synthesizes artifact title from attachment hints when cache misses", () => {
    const enriched = enrichChatMessageWithArtifactCache("agent:main:main", {
      id: "u2",
      role: "user",
      content: "analyze",
      ts: 2,
      artifactRefs: [{ artifactId: "artifact_csv", role: "input" }],
      attachments: [{ fileName: "test.csv", mimeType: "text/csv", size: 100 }],
    });
    expect(enriched.artifacts?.[0]?.title).toBe("test.csv");
  });
});
