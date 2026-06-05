import { normalizeArtifactSummaries } from "@/components/chat/adapters/gateway/message-normalize";
import { isLegacySyntheticArtifactId } from "@/components/chat/artifacts/legacy-artifact-refs";
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
  params: { sessionKey: string; artifactId: string; mimeType?: string },
): Promise<ArtifactDownloadResult> {
  const sessionKey = params.sessionKey.trim();
  const artifactId = params.artifactId.trim();
  if (isLegacySyntheticArtifactId(artifactId)) {
    throw new Error("legacy synthetic artifacts cannot be downloaded");
  }
  const cached = useArtifactCacheStore.getState().getDownload(sessionKey, artifactId);
  if (cached?.url || (cached?.encoding === "base64" && cached.data)) {
    const summary = useArtifactCacheStore.getState().getSummary(sessionKey, artifactId);
    if (summary) {
      return {
        artifact: summary,
        ...(cached.encoding === "base64" ? { encoding: "base64" as const } : {}),
        ...(typeof cached.data === "string" ? { data: cached.data } : {}),
        ...(typeof cached.url === "string" ? { url: cached.url } : {}),
      };
    }
  }

  const result = await client.request<{
    artifact?: unknown;
    encoding?: "base64";
    data?: string;
    url?: string;
  }>("artifacts.download", {
    sessionKey,
    artifactId,
  });
  const summaries = normalizeArtifactSummaries(
    result?.artifact ? [result.artifact] : undefined,
  );
  const artifact = summaries?.[0];
  if (!artifact) {
    throw new Error("artifact download returned invalid payload");
  }
  useArtifactCacheStore.getState().mergeSummaries(sessionKey, [artifact]);
  const downloadPayload = {
    ...(result.encoding === "base64" && typeof result.data === "string"
      ? { encoding: "base64" as const, data: result.data }
      : {}),
    ...(typeof result.url === "string" && result.url.trim() ? { url: result.url.trim() } : {}),
    ...(params.mimeType?.trim() || artifact.mimeType?.trim()
      ? { mimeType: params.mimeType?.trim() || artifact.mimeType?.trim() }
      : {}),
  };
  useArtifactCacheStore.getState().setDownload(sessionKey, artifactId, downloadPayload);
  return {
    artifact,
    ...(result.encoding === "base64" ? { encoding: "base64" as const } : {}),
    ...(typeof result.data === "string" ? { data: result.data } : {}),
    ...(typeof result.url === "string" && result.url.trim() ? { url: result.url.trim() } : {}),
  };
}
