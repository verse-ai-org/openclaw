import fs from "node:fs/promises";
import path from "node:path";
import {
  extractPathRefHintsFromMessageText,
  resolveInboundMediaRefFromAbsolutePath,
  splitUserMessageAndAppendixRegion,
  stripMediaAttachedLines,
} from "../chat-attachments.js";
import { attachmentRefArtifactContentIndexOffset } from "../chat-send-artifacts.js";
import {
  clientSupportsElectronReveal,
  projectArtifactSummaryForClient,
} from "../artifact-local-reveal-path.js";
import { buildArtifactId } from "../chat-artifact-id.js";
import { resolveMediaReferenceLocalPath } from "../../media/media-reference.js";
import { resolveDefaultAgentId } from "../../agents/agent-scope.js";
import { formatErrorMessage } from "../../infra/errors.js";
import type { OpenClawConfig } from "../../config/types.openclaw.js";
import {
  normalizeAgentId,
  parseAgentSessionKey,
  resolveAgentIdFromSessionKey,
  toAgentStoreSessionKey,
} from "../../routing/session-key.js";
import { getTaskSessionLookupByIdForStatus } from "../../tasks/task-status-access.js";
import {
  ErrorCodes,
  errorShape,
  type ArtifactSummary,
  type ArtifactsGetParams,
  validateArtifactsDownloadParams,
  validateArtifactsGetParams,
  validateArtifactsListParams,
} from "../protocol/index.js";
import { resolveSessionKeyForRun } from "../server-session-key.js";
import {
  resolveSessionStoreAgentId,
  resolveSessionStoreKey,
  resolveStoredSessionKeyForAgentStore,
} from "../session-store-key.js";
import { loadSessionEntry, visitSessionMessagesAsync } from "../session-utils.js";
import type { GatewayRequestHandlers, RespondFn } from "./types.js";
import { assertValidParams } from "./validation.js";

type ArtifactDownloadMode = ArtifactSummary["download"]["mode"];

type ArtifactRecord = ArtifactSummary & {
  data?: string;
  url?: string;
};

type ArtifactQuery = {
  sessionKey?: string;
  runId?: string;
  taskId?: string;
  agentId?: string;
};

type ResolvedArtifactSession = {
  sessionKey: string;
  agentId?: string;
};

function artifactError(type: string, message: string, details?: Record<string, unknown>) {
  return errorShape(ErrorCodes.INVALID_REQUEST, message, {
    details: {
      type,
      ...details,
    },
  });
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function asNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function messageTextFromRecord(msg: Record<string, unknown>): string {
  const content = msg.content;
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return "";
  }
  const parts: string[] = [];
  for (const block of content) {
    const record = asRecord(block);
    if (record?.type === "text" && typeof record.text === "string") {
      parts.push(record.text);
    }
  }
  return parts.join("\n");
}

function collectPathRefArtifactsFromLegacyUserText(params: {
  message: Record<string, unknown>;
  messageSeq: number;
  messageRunId?: string;
  messageTaskId?: string;
  sessionKey: string;
  artifacts: ArtifactRecord[];
}): void {
  if (params.message.role !== "user") {
    return;
  }
  const rawText = messageTextFromRecord(params.message);
  const hints = extractPathRefHintsFromMessageText(rawText);
  if (hints.length === 0) {
    return;
  }
  const displayText = stripMediaAttachedLines(
    splitUserMessageAndAppendixRegion(rawText).displayText,
  );
  const indexOffset = attachmentRefArtifactContentIndexOffset(displayText.trim());
  for (const [hintIndex, hint] of hints.entries()) {
    const contentIndex = indexOffset + hintIndex;
    const type = hint.mimeType.startsWith("image/")
      ? "image"
      : hint.mimeType.startsWith("audio/")
        ? "audio"
        : "file";
    const title = hint.fileName.trim() || "file";
    const artifactId = buildArtifactId({
      sessionKey: params.sessionKey,
      messageSeq: params.messageSeq,
      contentIndex,
      title,
      type,
    });
    if (params.artifacts.some((artifact) => artifact.id === artifactId)) {
      continue;
    }
    params.artifacts.push({
      id: artifactId,
      type,
      title,
      mimeType: hint.mimeType,
      ...(hint.size > 0 ? { sizeBytes: hint.size } : {}),
      sessionKey: params.sessionKey,
      ...(params.messageRunId ? { runId: params.messageRunId } : {}),
      ...(params.messageTaskId ? { taskId: params.messageTaskId } : {}),
      messageSeq: params.messageSeq,
      contentIndex,
      source: "user-upload",
      role: "input",
      ingestChannel: "path-ref",
      localRevealPath: hint.localRevealPath,
      ...(hint.stagingRevealPath ? { stagingRevealPath: hint.stagingRevealPath } : {}),
      download: { mode: "unsupported" },
    });
  }
}

function resolveRequesterSessionAgentId(
  sessionKey: string | undefined,
  cfg?: OpenClawConfig,
): string | undefined {
  const key = asNonEmptyString(sessionKey);
  if (!key) {
    return undefined;
  }
  const parsed = parseAgentSessionKey(key);
  if (!parsed && key.toLowerCase().startsWith("agent:")) {
    return undefined;
  }
  if (cfg) {
    const canonicalKey = resolveSessionStoreKey({ cfg, sessionKey: key });
    return resolveSessionStoreAgentId(cfg, canonicalKey);
  }
  if (parsed) {
    return parsed.agentId;
  }
  return resolveAgentIdFromSessionKey(key);
}

function resolveScopedArtifactSessionKey(
  sessionKey: string | undefined,
  agentId: string | undefined,
  cfg?: OpenClawConfig,
): string | undefined {
  const key = asNonEmptyString(sessionKey);
  if (!key) {
    return undefined;
  }
  const scopedAgentId = asNonEmptyString(agentId);
  if (!scopedAgentId) {
    return key;
  }
  const parsed = parseAgentSessionKey(key);
  if (!parsed && key.toLowerCase().startsWith("agent:")) {
    return undefined;
  }
  if (cfg) {
    const scopedKey = resolveStoredSessionKeyForAgentStore({
      cfg,
      agentId: scopedAgentId,
      sessionKey: key,
    });
    if (
      scopedKey !== "global" &&
      scopedKey !== "unknown" &&
      resolveSessionStoreAgentId(cfg, scopedKey) !== normalizeAgentId(scopedAgentId)
    ) {
      return undefined;
    }
    return scopedKey;
  }
  if (parsed && parsed.agentId !== normalizeAgentId(scopedAgentId)) {
    return undefined;
  }
  return toAgentStoreSessionKey({ agentId: scopedAgentId, requestKey: key });
}

function normalizeArtifactType(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (normalized === "image" || normalized === "input_image" || normalized === "image_url") {
    return "image";
  }
  if (normalized === "audio" || normalized === "input_audio") {
    return "audio";
  }
  if (normalized === "file" || normalized === "input_file") {
    return "file";
  }
  return "file";
}

function mimeFromDataUrl(value: string): string | undefined {
  const match = /^data:([^;,]+)(?:;[^,]*)?,/i.exec(value.trim());
  return match?.[1]?.toLowerCase();
}

function base64FromDataUrl(value: string): string | undefined {
  const match = /^data:[^,]*;base64,(.*)$/is.exec(value.trim());
  return match?.[1]?.replace(/\s+/g, "");
}

function estimateBase64Size(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  try {
    return Buffer.from(value, "base64").byteLength;
  } catch {
    return undefined;
  }
}

function mediaUrlValue(value: unknown): string | undefined {
  if (typeof value === "string") {
    return asNonEmptyString(value);
  }
  const record = asRecord(value);
  return asNonEmptyString(record?.url);
}

function isSafeDownloadUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || /^data:/i.test(trimmed)) {
    return false;
  }
  if (trimmed.startsWith("/")) {
    return !trimmed.startsWith("//") && trimmed.startsWith("/api/");
  }
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function resolveMessageSeq(message: Record<string, unknown>, fallback: number): number {
  const meta = asRecord(message["__openclaw"]);
  const seq = meta?.seq;
  return typeof seq === "number" && Number.isInteger(seq) && seq > 0 ? seq : fallback;
}

function resolveMessageRunId(message: Record<string, unknown>): string | undefined {
  const meta = asRecord(message["__openclaw"]);
  return asNonEmptyString(meta?.runId) ?? asNonEmptyString(message.runId);
}

function resolveMessageTaskId(message: Record<string, unknown>): string | undefined {
  const meta = asRecord(message["__openclaw"]);
  return (
    asNonEmptyString(meta?.messageTaskId) ??
    asNonEmptyString(meta?.taskId) ??
    asNonEmptyString(message.messageTaskId) ??
    asNonEmptyString(message.taskId)
  );
}

function resolveBlockDownload(block: Record<string, unknown>): {
  mode: ArtifactDownloadMode;
  data?: string;
  url?: string;
  mimeType?: string;
  sizeBytes?: number;
} {
  const data = asNonEmptyString(block.data);
  const content = asNonEmptyString(block.content);
  const url = asNonEmptyString(block.url) ?? asNonEmptyString(block.openUrl);
  const imageUrl = mediaUrlValue(block.image_url);
  const audioUrl = asNonEmptyString(block.audio_url);
  const source = asRecord(block.source);
  const sourceData = asNonEmptyString(source?.data);
  const sourceUrl = asNonEmptyString(source?.url);
  const dataUrl = [url, sourceUrl, imageUrl, audioUrl, data, content, sourceData].find(
    (value) => typeof value === "string" && /^data:/i.test(value),
  );
  const base64FromDetectedDataUrl = dataUrl ? base64FromDataUrl(dataUrl) : undefined;
  const directBase64 = [data, sourceData, content].find(
    (value) => typeof value === "string" && !/^data:/i.test(value),
  );
  const base64 = base64FromDetectedDataUrl ?? directBase64;
  const remoteUrl = [url, sourceUrl, imageUrl, audioUrl].find(
    (value) => typeof value === "string" && isSafeDownloadUrl(value),
  );
  const mimeType =
    asNonEmptyString(block.mimeType) ??
    asNonEmptyString(block.media_type) ??
    asNonEmptyString(source?.media_type) ??
    asNonEmptyString(source?.mimeType) ??
    (dataUrl ? mimeFromDataUrl(dataUrl) : undefined);
  const explicitSize = block.sizeBytes ?? source?.sizeBytes;
  const sizeBytes =
    typeof explicitSize === "number" && Number.isFinite(explicitSize) && explicitSize >= 0
      ? Math.floor(explicitSize)
      : estimateBase64Size(base64);
  if (base64) {
    return { mode: "bytes", data: base64, mimeType, sizeBytes };
  }
  if (remoteUrl) {
    return { mode: "url", url: remoteUrl, mimeType, sizeBytes };
  }
  return { mode: "unsupported", mimeType, sizeBytes };
}

function isArtifactBlock(block: Record<string, unknown>): boolean {
  const type = asNonEmptyString(block.type)?.toLowerCase();
  if (
    type === "image" ||
    type === "audio" ||
    type === "file" ||
    type === "input_image" ||
    type === "input_audio" ||
    type === "input_file" ||
    type === "image_url"
  ) {
    return true;
  }
  return Boolean(
    block.url || block.openUrl || block.data || block.source || block.image_url || block.audio_url,
  );
}

export function collectArtifactsFromMessages(params: {
  messages: unknown[];
  sessionKey: string;
  runId?: string;
  taskId?: string;
}): ArtifactRecord[] {
  const artifacts: ArtifactRecord[] = [];
  let messageFallbackSeq = 0;
  for (const message of params.messages) {
    messageFallbackSeq += 1;
    collectArtifactsFromMessage({ ...params, message, messageFallbackSeq, artifacts });
  }
  return artifacts;
}

export function collectArtifactsFromMessage(params: {
  message: unknown;
  messageFallbackSeq: number;
  artifacts: ArtifactRecord[];
  sessionKey: string;
  runId?: string;
  taskId?: string;
}): void {
  const msg = asRecord(params.message);
  if (!msg) {
    return;
  }
  const messageSeq = resolveMessageSeq(msg, params.messageFallbackSeq);
  const messageRunId = resolveMessageRunId(msg);
  const messageTaskId = resolveMessageTaskId(msg);
  if (params.runId && messageRunId !== params.runId) {
    return;
  }
  if (params.taskId && messageTaskId !== params.taskId) {
    return;
  }
  const content = Array.isArray(msg.content) ? msg.content : [];
  for (let contentIndex = 0; contentIndex < content.length; contentIndex += 1) {
    const block = asRecord(content[contentIndex]);
    if (!block || !isArtifactBlock(block)) {
      continue;
    }
    const type = normalizeArtifactType(asNonEmptyString(block.type) ?? "file");
    const title =
      asNonEmptyString(block.title) ??
      asNonEmptyString(block.fileName) ??
      asNonEmptyString(block.filename) ??
      asNonEmptyString(block.alt) ??
      `${type} ${params.artifacts.length + 1}`;
    const download = resolveBlockDownload(block);
    const localRevealPath = asNonEmptyString(block.localRevealPath);
    const stagingRevealPath = asNonEmptyString(block.stagingRevealPath);
    const role = msg.role === "user" ? "input" : msg.role === "assistant" ? "output" : undefined;
    const source =
      msg.role === "user"
        ? "user-upload"
        : msg.role === "assistant"
          ? "assistant-output"
          : undefined;
    const summary: ArtifactRecord = {
      id: buildArtifactId({
        sessionKey: params.sessionKey,
        messageSeq,
        contentIndex,
        title,
        type,
      }),
      type,
      title,
      ...(download.mimeType ? { mimeType: download.mimeType } : {}),
      ...(download.sizeBytes !== undefined ? { sizeBytes: download.sizeBytes } : {}),
      sessionKey: params.sessionKey,
      ...(messageRunId ? { runId: messageRunId } : {}),
      ...(messageTaskId ? { taskId: messageTaskId } : {}),
      messageSeq,
      contentIndex,
      ...(source ? { source } : {}),
      ...(role ? { role } : {}),
      ingestChannel: localRevealPath ? "path-ref" : "transcript-block",
      ...(localRevealPath ? { localRevealPath } : {}),
      ...(stagingRevealPath ? { stagingRevealPath } : {}),
      download: { mode: localRevealPath ? "unsupported" : download.mode },
      ...(download.data ? { data: download.data } : {}),
      ...(download.url ? { url: download.url } : {}),
    };
    params.artifacts.push(summary);
  }

  if (msg.role === "user") {
    collectUserMediaPathArtifacts({
      message: msg,
      messageSeq,
      messageRunId,
      messageTaskId,
      sessionKey: params.sessionKey,
      contentStartIndex: content.length,
      artifacts: params.artifacts,
    });
    collectPathRefArtifactsFromLegacyUserText({
      message: msg,
      messageSeq,
      messageRunId,
      messageTaskId,
      sessionKey: params.sessionKey,
      artifacts: params.artifacts,
    });
  }
}

function collectUserMediaPathArtifacts(params: {
  message: Record<string, unknown>;
  messageSeq: number;
  messageRunId?: string;
  messageTaskId?: string;
  sessionKey: string;
  contentStartIndex: number;
  artifacts: ArtifactRecord[];
}): void {
  const mediaPaths = Array.isArray(params.message.MediaPaths)
    ? params.message.MediaPaths.filter((p): p is string => typeof p === "string" && p.trim().length > 0)
    : typeof params.message.MediaPath === "string" && params.message.MediaPath.trim()
      ? [params.message.MediaPath.trim()]
      : [];
  const mediaTypes = Array.isArray(params.message.MediaTypes)
    ? params.message.MediaTypes.filter((t): t is string => typeof t === "string")
    : typeof params.message.MediaType === "string"
      ? [params.message.MediaType]
      : [];
  for (let i = 0; i < mediaPaths.length; i += 1) {
    const mediaPath = mediaPaths[i];
    const mimeType = mediaTypes[i] ?? "application/octet-stream";
    const type = mimeType.startsWith("image/")
      ? "image"
      : mimeType.startsWith("audio/")
        ? "audio"
        : "file";
    const title = path.basename(mediaPath) || `${type} ${i + 1}`;
    const contentIndex = params.contentStartIndex + i;
    const mediaRef = resolveInboundMediaRefFromAbsolutePath(mediaPath);
    params.artifacts.push({
      id: buildArtifactId({
        sessionKey: params.sessionKey,
        messageSeq: params.messageSeq,
        contentIndex,
        title,
        type,
      }),
      type,
      title,
      mimeType,
      sessionKey: params.sessionKey,
      ...(params.messageRunId ? { runId: params.messageRunId } : {}),
      ...(params.messageTaskId ? { taskId: params.messageTaskId } : {}),
      messageSeq: params.messageSeq,
      contentIndex,
      source: "user-upload",
      role: "input",
      ingestChannel: mediaRef ? "path-ref" : "inline-base64",
      download: { mode: mediaRef ? "bytes" : "unsupported" },
      ...(mediaRef ? { url: mediaRef, mediaRef } : {}),
    });
  }
}

function resolveQuerySession(
  query: ArtifactQuery,
  cfg?: OpenClawConfig,
): ResolvedArtifactSession | undefined {
  if (query.sessionKey) {
    const sessionKey = resolveScopedArtifactSessionKey(query.sessionKey, query.agentId, cfg);
    if (!sessionKey) {
      return undefined;
    }
    return { sessionKey, ...(query.agentId ? { agentId: query.agentId } : {}) };
  }
  if (query.runId) {
    const agentId = query.agentId ?? resolveDefaultAgentId(cfg ?? {});
    const sessionKey = resolveSessionKeyForRun(query.runId, { agentId });
    const scopedSessionKey = resolveScopedArtifactSessionKey(sessionKey, agentId, cfg);
    return scopedSessionKey ? { sessionKey: scopedSessionKey, agentId } : undefined;
  }
  if (query.taskId) {
    const task = getTaskSessionLookupByIdForStatus(query.taskId);
    const requesterSessionKey = asNonEmptyString(task?.requesterSessionKey);
    const taskAgentId =
      asNonEmptyString(task?.agentId) ?? resolveRequesterSessionAgentId(requesterSessionKey, cfg);
    if (
      query.agentId &&
      taskAgentId &&
      normalizeAgentId(query.agentId) !== normalizeAgentId(taskAgentId)
    ) {
      return undefined;
    }
    const agentId = query.agentId ?? taskAgentId ?? resolveDefaultAgentId(cfg ?? {});
    if (requesterSessionKey) {
      const scopedSessionKey = resolveScopedArtifactSessionKey(requesterSessionKey, agentId, cfg);
      return scopedSessionKey ? { sessionKey: scopedSessionKey, agentId } : undefined;
    }
    const runId = asNonEmptyString(task?.runId);
    const sessionKey = runId ? resolveSessionKeyForRun(runId, { agentId }) : undefined;
    const scopedSessionKey = resolveScopedArtifactSessionKey(sessionKey, agentId, cfg);
    return scopedSessionKey ? { sessionKey: scopedSessionKey, agentId } : undefined;
  }
  return undefined;
}

async function loadArtifacts(
  query: ArtifactQuery,
  cfg?: OpenClawConfig,
): Promise<{ artifacts: ArtifactRecord[]; sessionKey?: string }> {
  const resolved = resolveQuerySession(query, cfg);
  if (!resolved) {
    return { artifacts: [] };
  }
  const { sessionKey } = resolved;
  const scopedGlobalAgentId =
    cfg?.session?.scope === "global" && sessionKey === "global" ? resolved.agentId : undefined;
  const { storePath, entry } = scopedGlobalAgentId
    ? loadSessionEntry(sessionKey, { agentId: scopedGlobalAgentId })
    : loadSessionEntry(sessionKey);
  const sessionId = entry?.sessionId;
  if (!sessionId || !storePath) {
    return { sessionKey, artifacts: [] };
  }
  const artifacts: ArtifactRecord[] = [];
  await visitSessionMessagesAsync(
    sessionId,
    storePath,
    entry?.sessionFile,
    (message, seq) => {
      collectArtifactsFromMessage({
        message,
        messageFallbackSeq: seq,
        artifacts,
        sessionKey,
        runId: query.runId,
        taskId: query.taskId,
      });
    },
    {
      mode: "full",
      reason: "artifact query transcript scan",
    },
  );
  return {
    sessionKey,
    artifacts,
  };
}

function requireQueryable(params: ArtifactQuery, respond: RespondFn): boolean {
  if (params.sessionKey || params.runId || params.taskId) {
    return true;
  }
  respond(
    false,
    undefined,
    artifactError(
      "artifact_query_unsupported",
      "artifacts require one of sessionKey, runId, or taskId",
    ),
  );
  return false;
}

async function findArtifact(
  params: ArtifactsGetParams,
  cfg?: OpenClawConfig,
): Promise<{
  artifact?: ArtifactRecord;
  sessionKey?: string;
}> {
  const loaded = await loadArtifacts(params, cfg);
  return {
    sessionKey: loaded.sessionKey,
    artifact: loaded.artifacts.find((artifact) => artifact.id === params.artifactId),
  };
}

function toSummary(artifact: ArtifactRecord): ArtifactSummary {
  const { data: dataValue, url, ...summary } = artifact;
  const mediaRef =
    typeof summary.mediaRef === "string" && summary.mediaRef.trim()
      ? summary.mediaRef
      : typeof url === "string" && url.startsWith("media://")
        ? url
        : undefined;
  return {
    ...summary,
    ...(mediaRef ? { mediaRef } : {}),
  };
}

export const artifactsHandlers: GatewayRequestHandlers = {
  "artifacts.list": async ({ params, respond, context, client }) => {
    if (!assertValidParams(params, validateArtifactsListParams, "artifacts.list", respond)) {
      return;
    }
    if (!requireQueryable(params, respond)) {
      return;
    }
    const { artifacts, sessionKey } = await loadArtifacts(params, context.getRuntimeConfig?.());
    if (!sessionKey && (params.runId || params.taskId)) {
      respond(
        false,
        undefined,
        artifactError("artifact_scope_not_found", "no session found for artifact query"),
      );
      return;
    }
    const allowLocalRevealPath = clientSupportsElectronReveal(client?.connect?.caps);
    respond(true, {
      artifacts: artifacts.map((artifact) =>
        projectArtifactSummaryForClient(toSummary(artifact), allowLocalRevealPath),
      ),
    });
  },
  "artifacts.get": async ({ params, respond, context, client }) => {
    if (!assertValidParams(params, validateArtifactsGetParams, "artifacts.get", respond)) {
      return;
    }
    if (!requireQueryable(params, respond)) {
      return;
    }
    const { artifact } = await findArtifact(params, context.getRuntimeConfig?.());
    if (!artifact) {
      respond(
        false,
        undefined,
        artifactError("artifact_not_found", "artifact not found", {
          artifactId: params.artifactId,
        }),
      );
      return;
    }
    const allowLocalRevealPath = clientSupportsElectronReveal(client?.connect?.caps);
    respond(true, {
      artifact: projectArtifactSummaryForClient(toSummary(artifact), allowLocalRevealPath),
    });
  },
  "artifacts.download": async ({ params, respond, context, client }) => {
    if (
      !assertValidParams(params, validateArtifactsDownloadParams, "artifacts.download", respond)
    ) {
      return;
    }
    if (!requireQueryable(params, respond)) {
      return;
    }
    const { artifact } = await findArtifact(params, context.getRuntimeConfig?.());
    if (!artifact) {
      respond(
        false,
        undefined,
        artifactError("artifact_not_found", "artifact not found", {
          artifactId: params.artifactId,
        }),
      );
      return;
    }
    if (artifact.download.mode === "unsupported" && !artifact.url) {
      respond(
        false,
        undefined,
        artifactError("artifact_download_unsupported", "artifact download is unsupported", {
          artifactId: artifact.id,
        }),
      );
      return;
    }
    let data = artifact.data;
    if (!data && artifact.url?.startsWith("media://")) {
      try {
        const localPath = await resolveMediaReferenceLocalPath(artifact.url);
        const buffer = await fs.readFile(localPath);
        data = buffer.toString("base64");
      } catch (err) {
        respond(
          false,
          undefined,
          artifactError("artifact_download_failed", "failed to read inbound media", {
            artifactId: artifact.id,
            error: formatErrorMessage(err),
          }),
        );
        return;
      }
    }
    const allowLocalRevealPath = clientSupportsElectronReveal(client?.connect?.caps);
    respond(true, {
      artifact: projectArtifactSummaryForClient(toSummary(artifact), allowLocalRevealPath),
      ...(artifact.download.mode === "bytes" || data
        ? { encoding: "base64" as const, data }
        : {}),
      ...(artifact.download.mode === "url" && artifact.url && isSafeDownloadUrl(artifact.url)
        ? { url: artifact.url }
        : {}),
    });
  },
};
