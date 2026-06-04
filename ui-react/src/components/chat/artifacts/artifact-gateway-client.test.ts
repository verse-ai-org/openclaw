import { describe, expect, it, vi, beforeEach } from "vitest";
import { useArtifactCacheStore } from "@/store/artifact-cache.store";
import { fetchArtifactsList, prefetchArtifactsForSession } from "./artifact-gateway-client";

describe("artifact-gateway-client", () => {
  beforeEach(() => {
    useArtifactCacheStore.setState({ bySession: {} });
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
});
