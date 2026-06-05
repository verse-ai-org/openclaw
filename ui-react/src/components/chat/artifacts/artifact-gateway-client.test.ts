import { describe, expect, it, vi, beforeEach } from "vitest";
import { useArtifactCacheStore } from "@/store/artifact-cache.store";
import {
  downloadArtifact,
  fetchArtifactsList,
  prefetchArtifactsForSession,
} from "./artifact-gateway-client";

describe("artifact-gateway-client", () => {
  beforeEach(() => {
    useArtifactCacheStore.setState({ bySession: {}, downloadsBySession: {}, versionBySession: {} });
  });

  it("fetchArtifactsList normalizes gateway payloads", async () => {
    const client = {
      connected: true,
      request: vi.fn().mockResolvedValue({
        artifacts: [
          {
            id: "artifact_x",
            type: "image",
            title: "x.png",
            mimeType: "image/png",
            download: { mode: "bytes" },
          },
        ],
      }),
    };
    const list = await fetchArtifactsList(client as never, "agent:main:main");
    expect(list).toHaveLength(1);
    expect(list[0]?.id).toBe("artifact_x");
    expect(client.request).toHaveBeenCalledWith("artifacts.list", { sessionKey: "agent:main:main" });
  });

  it("prefetchArtifactsForSession fills the cache", async () => {
    const client = {
      connected: true,
      request: vi.fn().mockResolvedValue({
        artifacts: [
          {
            id: "artifact_y",
            type: "file",
            title: "y.pdf",
            download: { mode: "unsupported" },
          },
        ],
      }),
    };
    await prefetchArtifactsForSession(client as never, "agent:main:main");
    expect(useArtifactCacheStore.getState().getSummary("agent:main:main", "artifact_y")?.title).toBe(
      "y.pdf",
    );
  });

  it("downloadArtifact reuses cached bytes without a second RPC", async () => {
    useArtifactCacheStore.getState().mergeSummaries("agent:main:main", [
      {
        id: "artifact_cached",
        type: "image",
        title: "cached.png",
        mimeType: "image/png",
        download: { mode: "bytes" },
      },
    ]);
    useArtifactCacheStore.getState().setDownload("agent:main:main", "artifact_cached", {
      encoding: "base64",
      data: "aGVsbG8=",
      mimeType: "image/png",
    });
    const client = {
      connected: true,
      request: vi.fn(),
    };
    const result = await downloadArtifact(client as never, {
      sessionKey: "agent:main:main",
      artifactId: "artifact_cached",
    });
    expect(result.data).toBe("aGVsbG8=");
    expect(client.request).not.toHaveBeenCalled();
  });

  it("rejects download for legacy synthetic artifact ids", async () => {
    const client = { connected: true, request: vi.fn() };
    await expect(
      downloadArtifact(client as never, {
        sessionKey: "agent:main:main",
        artifactId: "legacy:report.pdf",
      }),
    ).rejects.toThrow(/legacy synthetic artifacts cannot be downloaded/i);
    expect(client.request).not.toHaveBeenCalled();
  });
});
