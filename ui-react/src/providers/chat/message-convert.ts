import type { ThreadMessageLike } from "@assistant-ui/react";
import { normalizeRole } from "@/hooks/chat-event-bridge";
import type { ChatMessage } from "@/store/chat.store";
import { logChatDebug } from "@/lib/chat-debug";
import { splitAskTags } from "./ask-tag-split";

const AGENT_COMPLETE_TAG_RE = /^\s*<(final|plan)>([\s\S]*?)<\/\1>\s*$/i;
const AGENT_OPEN_TAG_RE = /^\s*<(?:final|plan)>\n?/i;
const AGENT_CLOSE_TAG_RE = /\n?<\/(?:final|plan)>\s*$/i;

/**
 * Strip the `<final>` / `<plan>` framing tags that the runner emits around
 * certain assistant replies. `<ask>` tags are handled separately below — they
 * are NOT stripped here because they carry an `id` that must be hoisted into
 * an `{type:"interaction"}` content part instead of silently dropped.
 */
function stripAgentWrapperTags(text: string): string {
  let result = text;
  let match: RegExpMatchArray | null;
  // eslint-disable-next-line no-cond-assign
  while ((match = result.match(AGENT_COMPLETE_TAG_RE))) {
    result = match[2] ?? "";
  }
  result = result.replace(AGENT_OPEN_TAG_RE, "");
  result = result.replace(AGENT_CLOSE_TAG_RE, "");
  if (!/<\/(?:final|plan)>\s*$/iu.test(result)) {
    result = result.replace(/<\/(?:final|plan)?$/iu, "");
  }
  return result;
}

type ContentPart =
  | { type: "text"; text: string }
  | {
      type: "tool-call";
      toolCallId: string;
      toolName: string;
      args: Record<string, unknown>;
      result?: string;
      isError?: boolean;
    };

/**
 * Emit assistant-ui content parts for a raw assistant text block.
 *
 * Two transforms are applied:
 *  1. `stripAgentWrapperTags` removes `<final>` / `<plan>` framing.
 *  2. `splitAskTags` drops `<ask ...>...</ask>` interaction tags out of the
 *     text. We DO NOT push `{type:"interaction"}` content parts here —
 *     assistant-ui's internal content-part template throws
 *     `tapClientLookup: Index N out of bounds` when it encounters an
 *     unknown part kind. `InteractiveParts` reads interactions directly
 *     from the chat store's `interactions` slice + `contentBlocks`, so the
 *     tag only needs to be scrubbed from the text that feeds Markdown.
 */
function pushTextBlockWithAskSplit(
  parts: ContentPart[],
  rawText: string,
): void {
  const stripped = stripAgentWrapperTags(rawText);
  let buffer = "";
  for (const piece of splitAskTags(stripped)) {
    if (piece.kind === "text") buffer += piece.text;
    // interaction parts are intentionally dropped — they re-surface via
    // ChatMessage.contentBlocks → InteractiveParts, not via this content array.
  }
  if (buffer.length > 0) {
    parts.push({ type: "text", text: buffer });
  }
}

export function convertGatewayChatMessage(msg: ChatMessage): ThreadMessageLike {
  const role = normalizeRole(msg.role) as "user" | "assistant" | "system";

  const parts: ContentPart[] = [];
  // Messages that carry only a presentational marker — the legacy `interactive`
  // block or the new first-class `interaction` part — intentionally have no
  // text/tool-call parts to render. Track that so we don't synthesise an empty
  // string placeholder and cause an unwanted empty bubble below.
  const hasNonRenderingBlocks =
    msg.contentBlocks?.some(
      (block) => block.type === "interactive" || block.type === "interaction",
    ) ?? false;

  if (msg.contentBlocks && msg.contentBlocks.length > 0) {
    for (const block of msg.contentBlocks) {
      if (block.type === "text") {
        pushTextBlockWithAskSplit(parts, block.text);
      } else if (block.type === "interaction") {
        // Interaction content-blocks are consumed by InteractiveParts via the
        // chat store; assistant-ui's content-part renderer doesn't know this
        // kind and will throw if we leak it into the `content` array.
        continue;
      } else if (block.type === "tool-call") {
        let parsedArgs: Record<string, unknown> = {};
        if (block.argsText) {
          try {
            parsedArgs = JSON.parse(block.argsText) as Record<string, unknown>;
          } catch {
            // ignore
          }
        }
        parts.push({
          type: "tool-call",
          toolCallId: block.toolCallId,
          toolName: block.toolName,
          args: parsedArgs,
          result: block.result,
          isError: block.phase === "error",
        });
      }
    }
  } else {
    if (msg.content.trim()) {
      pushTextBlockWithAskSplit(parts, msg.content);
    }
    if (msg.toolCalls && msg.toolCalls.length > 0) {
      for (const tc of msg.toolCalls) {
        let parsedArgs: Record<string, unknown> = {};
        if (tc.argsText) {
          try {
            parsedArgs = JSON.parse(tc.argsText) as Record<string, unknown>;
          } catch {
            // ignore
          }
        }
        parts.push({
          type: "tool-call",
          toolCallId: tc.toolCallId,
          toolName: tc.toolName,
          args: parsedArgs,
          result: tc.result,
          isError: tc.phase === "error",
        });
      }
    }
  }

  if (parts.length === 0 && !hasNonRenderingBlocks) {
    parts.push({ type: "text", text: "" });
  }

  if (parts.filter((p) => p.type === "tool-call").length > 1) {
    logChatDebug(
      "debug",
      "convertMessage: assistant message part breakdown",
      {
        msgId: msg.id,
        partSummaries: parts.map((p) =>
          p.type === "tool-call" ? `tool:${p.toolName}` : `text:${p.text.slice(0, 20)}`,
        ),
      },
      { channel: "chat.history" },
    );
  }

  return {
    id: msg.id,
    role,
    content: parts as ThreadMessageLike["content"],
    createdAt: new Date(msg.ts),
  };
}
