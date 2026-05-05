import type { ThreadMessageLike } from "@assistant-ui/react";
import { normalizeRole } from "../gateway/hooks/chat-event-bridge";
import type { ChatMessage } from "@/components/chat/types";
import { stripAllAskTags } from "@/components/chat/interactive";

const AGENT_COMPLETE_TAG_RE = /^\s*<(final|plan)>([\s\S]*?)<\/\1>\s*$/i;
const AGENT_OPEN_TAG_RE = /^\s*<(?:final|plan)>\n?/i;
const AGENT_CLOSE_TAG_RE = /\n?<\/(?:final|plan)>\s*$/i;

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
  return stripAllAskTags(result);
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
            console.warn(
              `[convertGatewayChatMessage] invalid json in tool call args: ${block.argsText}`,
            );
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
  } else if (msg.content.trim()) {
    parts.push({ type: "text", text: stripAgentWrapperTags(msg.content) });
  }

  if (parts.length === 0 && !hasInteractiveBlocks) {
    parts.push({ type: "text", text: "" });
  }

  return {
    id: msg.id,
    role,
    content: parts as ThreadMessageLike["content"],
    createdAt: new Date(msg.ts),
  };
}
