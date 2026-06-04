import type { ArtifactRef, ArtifactSummary, ChatMessageRole, MessageAttachment } from "@/components/chat/types";

/** Gateway `artifactRefs` on chat.history messages. */
export function normalizeHistoryArtifactRefs(raw: unknown): ArtifactRef[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) {
    return undefined;
  }
  const out: ArtifactRef[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const o = item as Record<string, unknown>;
    const artifactId =
      typeof o.artifactId === "string"
        ? o.artifactId.trim()
        : typeof o.id === "string"
          ? o.id.trim()
          : "";
    if (!artifactId) {
      continue;
    }
    const role = o.role === "input" || o.role === "output" ? o.role : undefined;
    out.push({ artifactId, ...(role ? { role } : {}) });
  }
  return out.length > 0 ? out : undefined;
}

function normalizeArtifactSummary(item: unknown): ArtifactSummary | null {
  if (!item || typeof item !== "object") {
    return null;
  }
  const o = item as Record<string, unknown>;
  const id = typeof o.id === "string" ? o.id.trim() : "";
  const type = typeof o.type === "string" ? o.type.trim() : "";
  const title = typeof o.title === "string" ? o.title.trim() : "";
  if (!id || !type || !title) {
    return null;
  }
  const download = o.download;
  const mode =
    download &&
    typeof download === "object" &&
    ((download as { mode?: unknown }).mode === "bytes" ||
      (download as { mode?: unknown }).mode === "url" ||
      (download as { mode?: unknown }).mode === "unsupported")
      ? (download as { mode: ArtifactSummary["download"]["mode"] }).mode
      : "unsupported";
  const role = o.role === "input" || o.role === "output" ? o.role : undefined;
  return {
    id,
    type,
    title,
    ...(typeof o.mimeType === "string" && o.mimeType.trim() ? { mimeType: o.mimeType.trim() } : {}),
    ...(typeof o.sizeBytes === "number" && Number.isFinite(o.sizeBytes) && o.sizeBytes >= 0
      ? { sizeBytes: Math.floor(o.sizeBytes) }
      : {}),
    ...(role ? { role } : {}),
    ...(typeof o.mediaRef === "string" && o.mediaRef.trim().startsWith("media://")
      ? { mediaRef: o.mediaRef.trim() }
      : {}),
    download: { mode },
  };
}

/** Optional inline summaries on history rows (future) or send ack payloads. */
export function normalizeArtifactSummaries(raw: unknown): ArtifactSummary[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) {
    return undefined;
  }
  const out: ArtifactSummary[] = [];
  for (const item of raw) {
    const summary = normalizeArtifactSummary(item);
    if (summary) {
      out.push(summary);
    }
  }
  return out.length > 0 ? out : undefined;
}

/** Prefer gateway-provided attachment hints (after server-side content shortening). */
export function normalizeHistoryAttachmentHints(raw: unknown): MessageAttachment[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) {
    return undefined;
  }
  const out: MessageAttachment[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const o = item as Record<string, unknown>;
    const fileName =
      typeof o.fileName === "string"
        ? o.fileName
        : typeof o.name === "string"
          ? o.name
          : "";
    if (!fileName.trim()) {
      continue;
    }
    const mimeType =
      typeof o.mimeType === "string" && o.mimeType.trim() ? o.mimeType : "application/octet-stream";
    const size = typeof o.size === "number" && Number.isFinite(o.size) ? o.size : 0;
    const mediaRef =
      typeof o.mediaRef === "string" && o.mediaRef.trim().startsWith("media://")
        ? o.mediaRef.trim()
        : undefined;
    out.push({ fileName: fileName.trim(), mimeType, size, ...(mediaRef ? { mediaRef } : {}) });
  }
  return out.length > 0 ? out : undefined;
}

/** Normalize a raw message content field to a plain string. */
export function normalizeContent(raw: unknown): string {
  if (typeof raw === "string") {
    return raw;
  }
  if (Array.isArray(raw)) {
    return raw
      .map((block) => {
        if (!block || typeof block !== "object") {
          return "";
        }
        const b = block as Record<string, unknown>;
        if (b.type === "text" && typeof b.text === "string") {
          return b.text;
        }
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

/**
 * Normalize a raw Gateway message role to one of the two roles
 * that assistant-ui supports: "user" | "assistant".
 */
export function normalizeRole(raw: string | undefined): ChatMessageRole {
  const lower = (raw ?? "").toLowerCase().replace(/_/g, "");
  switch (lower) {
    case "user":
      return "user";
    default:
      return "assistant";
  }
}

/**
 * Plain text from a `chat` WS payload `message` object (delta / final).
 * Text parts in `content[]` are concatenated with **no** separator — matches
 * streaming cumulative assistant strings from the gateway.
 */
export function extractGatewayChatMessageText(message: unknown): string {
  if (!message || typeof message !== "object") {
    return "";
  }
  const m = message as Record<string, unknown>;
  if (typeof m.text === "string") {
    return m.text;
  }
  if (Array.isArray(m.content)) {
    return (m.content as unknown[])
      .filter(
        (b): b is { type: "text"; text: string } =>
          !!b &&
          typeof b === "object" &&
          (b as Record<string, unknown>).type === "text" &&
          typeof (b as Record<string, unknown>).text === "string",
      )
      .map((b) => b.text)
      .join("");
  }
  if (typeof m.content === "string") {
    return m.content;
  }
  return "";
}

/** Extract plain text from a Gateway message object (content string or content block array). */
export function extractMessageText(message: unknown): string {
  if (!message || typeof message !== "object") {
    return "";
  }
  const m = message as Record<string, unknown>;
  if (typeof m.text === "string") {
    return m.text;
  }
  return normalizeContent(m.content);
}

