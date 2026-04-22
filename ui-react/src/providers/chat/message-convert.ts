import type { ThreadMessageLike } from "@assistant-ui/react";
import { normalizeRole } from "@/hooks/chat-event-bridge";
import type { ChatMessage } from "@/store/chat.store";

const AGENT_COMPLETE_TAG_RE = /^\s*<(final|plan)>([\s\S]*?)<\/\1>\s*$/i;
const AGENT_ANY_COMPLETE_TAG_RE = /<(final|plan)>([\s\S]*?)<\/\1>/gi;
const AGENT_OPEN_TAG_RE = /^\s*<(?:final|plan)>\n?/i;
const AGENT_CLOSE_TAG_RE = /\n?<\/(?:final|plan)>\s*$/i;

function stripAgentWrapperTags(text: string): string {
  let result = text;
  let anyMatch: RegExpExecArray | null;
  let lastWrappedContent: string | null = null;
  // If wrapper tags appear in the middle of content, prefer the wrapped body.
  // Some providers emit prelude text plus a full <final>...</final> block.
  AGENT_ANY_COMPLETE_TAG_RE.lastIndex = 0;
  while ((anyMatch = AGENT_ANY_COMPLETE_TAG_RE.exec(result))) {
    lastWrappedContent = anyMatch[2] ?? "";
  }
  if (lastWrappedContent != null) {
    result = lastWrappedContent;
  }
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

export function convertGatewayChatMessage(msg: ChatMessage): ThreadMessageLike {
  const role = normalizeRole(msg.role) as "user" | "assistant" | "system";

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
  const parts: ContentPart[] = [];
  const hasInteractiveBlocks = msg.contentBlocks?.some((block) => block.type === "interactive") ?? false;

  if (msg.contentBlocks && msg.contentBlocks.length > 0) {
    for (const block of msg.contentBlocks) {
      if (block.type === "text") {
        parts.push({ type: "text", text: stripAgentWrapperTags(block.text) });
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
      parts.push({ type: "text", text: stripAgentWrapperTags(msg.content) });
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

  if (parts.length === 0 && !hasInteractiveBlocks) {
    parts.push({ type: "text", text: "" });
  }

  // if (import.meta.env.DEV && parts.filter((p) => p.type === "tool-call").length > 1) {
  //   console.log(
  //     `[convertMessage] msg ${msg.id} has ${parts.length} parts:`,
  //     parts.map((p) =>
  //       p.type === "tool-call" ? `tool:${p.toolName}` : `text:${p.text.slice(0, 20)}`,
  //     ),
  //   );
  // }

  return {
    id: msg.id,
    role,
    content: parts as ThreadMessageLike["content"],
    createdAt: new Date(msg.ts),
  };
}
