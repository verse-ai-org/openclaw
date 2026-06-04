import {
  extractFileAttachmentHintsFromAppendix,
  extractMediaAttachedLineHints,
  extractMediaPathAttachmentHints,
  splitUserMessageAndAppendixRegion,
  stripMediaAttachedLines,
} from "./chat-attachments.js";
import { buildArtifactId } from "./chat-artifact-id.js";
import { attachmentRefArtifactContentIndexOffset } from "./chat-send-artifacts.js";
import { collectArtifactsFromMessage } from "./server-methods/artifacts.js";
import type { ArtifactRef, ArtifactSummary } from "./protocol/index.js";

function messageTextForArtifactProjection(message: Record<string, unknown>): string {
  const content = message.content;
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return "";
  }
  const parts: string[] = [];
  for (const block of content) {
    if (
      block &&
      typeof block === "object" &&
      (block as { type?: unknown }).type === "text" &&
      typeof (block as { text?: unknown }).text === "string"
    ) {
      parts.push((block as { text: string }).text);
    }
  }
  return parts.join("\n");
}

function artifactRefsFromHints(params: {
  sessionKey: string;
  messageSeq: number;
  role: "input" | "output";
  hints: Array<{ fileName: string; mimeType: string }>;
  contentStartIndex: number;
}): ArtifactRef[] {
  const refs: ArtifactRef[] = [];
  let index = 0;
  for (const hint of params.hints) {
    const fileName = hint.fileName.trim();
    if (!fileName) {
      continue;
    }
    const mimeType = hint.mimeType.trim() || "application/octet-stream";
    const type = mimeType.startsWith("image/")
      ? "image"
      : mimeType.startsWith("audio/")
        ? "audio"
        : "file";
    refs.push({
      artifactId: buildArtifactId({
        sessionKey: params.sessionKey,
        messageSeq: params.messageSeq,
        contentIndex: params.contentStartIndex + index,
        title: fileName,
        type,
      }),
      role: params.role,
    });
    index += 1;
  }
  return refs;
}

export function projectArtifactRefsForHistoryMessage(params: {
  message: Record<string, unknown>;
  sessionKey: string;
  messageSeq: number;
}): {
  displayText?: string;
  artifactRefs: ArtifactRef[];
  attachmentHints: Array<{
    fileName: string;
    mimeType: string;
    size: number;
    mediaRef?: string;
  }>;
} {
  const artifacts: Array<ArtifactSummary & { data?: string; url?: string }> = [];
  collectArtifactsFromMessage({
    message: params.message,
    messageFallbackSeq: params.messageSeq,
    artifacts,
    sessionKey: params.sessionKey,
  });

  const artifactRefs: ArtifactRef[] = artifacts.map((artifact) => ({
    artifactId: artifact.id,
    role: artifact.role ?? (params.message.role === "user" ? "input" : "output"),
  }));

  const rawText = messageTextForArtifactProjection(params.message);
  const { displayText: textAfterAppendix, appendixRegion } = splitUserMessageAndAppendixRegion(rawText);
  const displayText = stripMediaAttachedLines(textAfterAppendix);
  const fileHints = extractFileAttachmentHintsFromAppendix(appendixRegion);
  const mediaAttachedHints = extractMediaAttachedLineHints(rawText);
  const hintContentStartIndex =
    artifacts.length +
    attachmentRefArtifactContentIndexOffset(
      params.message.role === "user" ? displayText.trim() : "",
    );
  const hintRefs = artifactRefsFromHints({
    sessionKey: params.sessionKey,
    messageSeq: params.messageSeq,
    role: params.message.role === "user" ? "input" : "output",
    hints: [...fileHints, ...mediaAttachedHints],
    contentStartIndex: hintContentStartIndex,
  });

  const seen = new Set(artifactRefs.map((ref) => ref.artifactId));
  for (const ref of hintRefs) {
    if (!seen.has(ref.artifactId)) {
      artifactRefs.push(ref);
      seen.add(ref.artifactId);
    }
  }

  const attachmentHints = [
    ...fileHints,
    ...mediaAttachedHints,
    ...extractMediaPathAttachmentHints(params.message),
  ];

  const displayChanged = displayText !== rawText;

  return {
    ...(displayChanged ? { displayText } : {}),
    artifactRefs,
    attachmentHints,
  };
}

export function projectChatHistoryMessagesWithArtifacts(
  messages: Array<Record<string, unknown>>,
  sessionKey: string,
): Array<Record<string, unknown>> {
  let messageSeq = 0;
  return messages.map((message) => {
    messageSeq += 1;
    const role = message.role;
    if (role !== "user" && role !== "assistant") {
      return message;
    }
    const projection = projectArtifactRefsForHistoryMessage({
      message,
      sessionKey,
      messageSeq,
    });
    if (projection.artifactRefs.length === 0 && projection.displayText === undefined) {
      return message;
    }
    const next: Record<string, unknown> = { ...message };
    if (projection.displayText !== undefined) {
      if (typeof message.content === "string") {
        next.content = projection.displayText;
      } else if (Array.isArray(message.content)) {
        const nonText = message.content.filter(
          (block) =>
            !(
              block &&
              typeof block === "object" &&
              (block as { type?: unknown }).type === "text"
            ),
        );
        const textBlock = projection.displayText.trim()
          ? [{ type: "text", text: projection.displayText }]
          : [];
        next.content = [...textBlock, ...nonText];
      }
    }
    if (projection.artifactRefs.length > 0) {
      next.artifactRefs = projection.artifactRefs;
    }
    if (projection.attachmentHints.length > 0) {
      next.attachments = projection.attachmentHints;
    }
    return next;
  });
}
