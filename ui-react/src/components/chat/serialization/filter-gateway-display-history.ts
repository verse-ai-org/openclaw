import type { RawMessage } from "@/components/chat/types";

/** Mirrors `src/auto-reply/heartbeat.ts` defaults used by gateway chat.history projection. */
const HEARTBEAT_CONTEXT_PROMPT =
  "Read HEARTBEAT.md if it exists (workspace context). Follow it strictly. Do not infer or repeat old tasks from prior chats.";
export const GATEWAY_HEARTBEAT_PROMPT = `${HEARTBEAT_CONTEXT_PROMPT} If nothing needs attention, reply HEARTBEAT_OK.`;
export const HEARTBEAT_TRANSCRIPT_PROMPT = "[OpenClaw heartbeat poll]";
const HEARTBEAT_TOKEN = "HEARTBEAT_OK";
const DEFAULT_HEARTBEAT_ACK_MAX_CHARS = 300;
const HEARTBEAT_TASK_PROMPT_PREFIX =
  "Run the following periodic tasks (only those due based on their intervals):";
const HEARTBEAT_TASK_PROMPT_ACK = "After completing all due tasks, reply HEARTBEAT_OK.";
const OPENCLAW_RUNTIME_CONTEXT_CUSTOM_TYPE = "openclaw.runtime-context";
const STREAM_ERROR_FALLBACK_TEXT = "[assistant turn failed before producing content]";

type RoleContentMessage = {
  role: string;
  content?: unknown;
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isHiddenDisplayBlockType(type: unknown): boolean {
  return type === "thinking" || type === "reasoning";
}

function resolveMessageText(content: unknown): { text: string; hasVisibleNonTextContent: boolean } {
  if (typeof content === "string") {
    return { text: content, hasVisibleNonTextContent: false };
  }
  if (!Array.isArray(content)) {
    return { text: "", hasVisibleNonTextContent: content != null };
  }
  let hasVisibleNonTextContent = false;
  let text = "";
  for (const block of content) {
    if (typeof block !== "object" || block === null || !("type" in block)) {
      hasVisibleNonTextContent = true;
      continue;
    }
    const type = (block as { type?: unknown }).type;
    if (type !== "text") {
      if (!isHiddenDisplayBlockType(type)) {
        hasVisibleNonTextContent = true;
      }
      continue;
    }
    const blockText = (block as { text?: unknown }).text;
    if (typeof blockText !== "string") {
      hasVisibleNonTextContent = true;
      continue;
    }
    text += blockText;
  }
  return { text, hasVisibleNonTextContent };
}

function stripHeartbeatToken(
  raw: string,
  maxAckChars = DEFAULT_HEARTBEAT_ACK_MAX_CHARS,
): { shouldSkip: boolean } {
  let text = raw.trim();
  if (!text) {
    return { shouldSkip: true };
  }
  const strippedMarkup = text
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/^[*`~_]+/, "")
    .replace(/[*`~_]+$/, "");
  if (!text.includes(HEARTBEAT_TOKEN) && !strippedMarkup.includes(HEARTBEAT_TOKEN)) {
    return { shouldSkip: false };
  }

  const tokenAtEnd = new RegExp(`${escapeRegExp(HEARTBEAT_TOKEN)}[^\\w]{0,4}$`);
  let changed = true;
  let didStrip = false;
  text = strippedMarkup.trim();
  while (changed) {
    changed = false;
    const next = text.trim();
    if (next.startsWith(HEARTBEAT_TOKEN)) {
      text = next.slice(HEARTBEAT_TOKEN.length).trimStart();
      didStrip = true;
      changed = true;
      continue;
    }
    if (tokenAtEnd.test(next)) {
      const index = next.lastIndexOf(HEARTBEAT_TOKEN);
      const before = next.slice(0, index).trimEnd();
      const after = next.slice(index + HEARTBEAT_TOKEN.length).trimStart();
      text = before ? `${before}${after}`.trimEnd() : "";
      didStrip = true;
      changed = true;
    }
  }

  if (!didStrip) {
    return { shouldSkip: false };
  }
  return { shouldSkip: !text || text.length <= maxAckChars };
}

export function isHeartbeatSessionDisplayText(text: string): boolean {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (!trimmed) {
    return false;
  }
  if (trimmed === HEARTBEAT_TRANSCRIPT_PROMPT) {
    return true;
  }
  if (trimmed === STREAM_ERROR_FALLBACK_TEXT) {
    return true;
  }
  if (trimmed.startsWith(GATEWAY_HEARTBEAT_PROMPT)) {
    return true;
  }
  if (
    trimmed.startsWith(HEARTBEAT_TASK_PROMPT_PREFIX) &&
    trimmed.includes(HEARTBEAT_TASK_PROMPT_ACK)
  ) {
    return true;
  }
  return stripHeartbeatToken(trimmed).shouldSkip;
}

function isHeartbeatUserMessage(
  message: RoleContentMessage,
  heartbeatPrompt = GATEWAY_HEARTBEAT_PROMPT,
): boolean {
  if (message.role !== "user") {
    return false;
  }
  const { text } = resolveMessageText(message.content);
  const trimmed = text.trim();
  if (!trimmed) {
    return false;
  }
  const normalizedHeartbeatPrompt = heartbeatPrompt.trim();
  if (trimmed === HEARTBEAT_TRANSCRIPT_PROMPT) {
    return true;
  }
  if (normalizedHeartbeatPrompt && trimmed.startsWith(normalizedHeartbeatPrompt)) {
    return true;
  }
  return (
    trimmed.startsWith(HEARTBEAT_TASK_PROMPT_PREFIX) && trimmed.includes(HEARTBEAT_TASK_PROMPT_ACK)
  );
}

function isHeartbeatOkResponse(message: RoleContentMessage): boolean {
  if (message.role !== "assistant") {
    return false;
  }
  const { text, hasVisibleNonTextContent } = resolveMessageText(message.content);
  if (hasVisibleNonTextContent) {
    return false;
  }
  return stripHeartbeatToken(text).shouldSkip;
}

function asRoleContentMessage(message: RawMessage): RoleContentMessage | null {
  const role = message.role;
  if (typeof role !== "string") {
    return null;
  }
  return { role, content: message.content ?? message.text };
}

function isEmptyTextOnlyContent(content: unknown): boolean {
  const { text } = resolveMessageText(content);
  return text.trim().length === 0;
}

function hasTranscriptMediaPaths(message: RawMessage): boolean {
  return (
    typeof message.attachments === "object" &&
    message.attachments != null &&
    (Array.isArray(message.attachments) ? message.attachments.length > 0 : true)
  );
}

function isDisplayHiddenProjectedMessage(message: RawMessage): boolean {
  if (message.display === false) {
    return true;
  }
  return message.role === "custom" && message.customType === OPENCLAW_RUNTIME_CONTEXT_CUSTOM_TYPE;
}

function isSuppressedAssistantNoiseMessage(message: RawMessage): boolean {
  if (message.role !== "assistant") {
    return false;
  }
  const stopReason = message.stopReason;
  const { text } = resolveMessageText(message.content ?? message.text);
  const trimmed = text.trim();
  if (stopReason === "error" && trimmed === STREAM_ERROR_FALLBACK_TEXT) {
    return true;
  }
  if (stopReason === "aborted" && !trimmed) {
    return true;
  }
  return false;
}

function shouldHideProjectedHistoryMessage(message: RawMessage): boolean {
  if (isDisplayHiddenProjectedMessage(message)) {
    return true;
  }
  if (isSuppressedAssistantNoiseMessage(message)) {
    return true;
  }
  const roleContent = asRoleContentMessage(message);
  if (!roleContent) {
    return false;
  }
  if (
    roleContent.role === "user" &&
    isEmptyTextOnlyContent(message.content ?? message.text) &&
    !hasTranscriptMediaPaths(message)
  ) {
    return true;
  }
  if (roleContent.role === "assistant" && isEmptyTextOnlyContent(message.content ?? message.text)) {
    return false;
  }
  if (isHeartbeatUserMessage(roleContent)) {
    return true;
  }
  return isHeartbeatOkResponse(roleContent);
}

/**
 * Client-side mirror of gateway `projectChatDisplayMessages` heartbeat filtering.
 * Gateway already projects history, but ui-react re-applies the filter so stale
 * gateway builds and thinking-only HEARTBEAT_OK acks stay hidden in the UI.
 */
export function filterGatewayDisplayHistoryMessages(messages: RawMessage[]): RawMessage[] {
  if (messages.length === 0) {
    return messages;
  }
  let changed = false;
  const visible: RawMessage[] = [];
  for (let i = 0; i < messages.length; i++) {
    const current = messages[i];
    if (!current) {
      continue;
    }
    const currentRoleContent = asRoleContentMessage(current);
    const next = messages[i + 1];
    const nextRoleContent = next ? asRoleContentMessage(next) : null;
    if (
      currentRoleContent &&
      nextRoleContent &&
      isHeartbeatUserMessage(currentRoleContent) &&
      isHeartbeatOkResponse(nextRoleContent)
    ) {
      changed = true;
      i++;
      continue;
    }
    if (shouldHideProjectedHistoryMessage(current)) {
      changed = true;
      continue;
    }
    visible.push(current);
  }
  return changed ? visible : messages;
}
