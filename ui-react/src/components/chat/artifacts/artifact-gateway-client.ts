import { normalizeArtifactSummaries } from "@/components/chat/adapters/gateway/message-normalize";
import type { ArtifactSummary } from "@/components/chat/types";
import type { IGatewayClient } from "@/store/gateway.store";
import { useArtifactCacheStore } from "@/store/artifact-cache.store";

export async function fetchArtifactsList(
  client: IGatewayClient,
  sessionKey: string,
): Promise<ArtifactSummary[]> {
  const result = await client.request<{ artifacts?: unknown[] }>("artifacts.list", {
    sessionKey: sessionKey.trim(),
  });
  return normalizeArtifactSummaries(result?.artifacts) ?? [];
}

export async function prefetchArtifactsForSession(
  client: IGatewayClient | null,
  sessionKey: string,
): Promise<void> {
  if (!client?.connected) {
    return;
  }
  const key = sessionKey.trim();
  if (!key) {
    return;
  }
  try {
    const summaries = await fetchArtifactsList(client, key);
    if (summaries.length > 0) {
      useArtifactCacheStore.getState().mergeSummaries(key, summaries);
    }
  } catch (err) {
    console.warn("[artifacts] list prefetch failed:", err);
  }
}

export type ArtifactDownloadResult = {
  artifact: ArtifactSummary;
  encoding?: "base64";
  data?: string;
  url?: string;
};

export async function downloadArtifact(
  client: IGatewayClient,
  params: { sessionKey: string; artifactId: string },
): Promise<ArtifactDownloadResult> {
  const result = await client.request<{
    artifact?: unknown;
    encoding?: "base64";
    data?: string;
    url?: string;
  }>("artifacts.download", {
    sessionKey: params.sessionKey.trim(),
    artifactId: params.artifactId.trim(),
  });
  const summaries = normalizeArtifactSummaries(
    result?.artifact ? [result.artifact] : undefined,
  );
  const artifact = summaries?.[0];
  if (!artifact) {
    throw new Error("artifact download returned invalid payload");
  }
  useArtifactCacheStore.getState().mergeSummaries(params.sessionKey, [artifact]);
  return {
    artifact,
    ...(result.encoding === "base64" ? { encoding: "base64" as const } : {}),
    ...(typeof result.data === "string" ? { data: result.data } : {}),
    ...(typeof result.url === "string" && result.url.trim() ? { url: result.url.trim() } : {}),
  };
}
