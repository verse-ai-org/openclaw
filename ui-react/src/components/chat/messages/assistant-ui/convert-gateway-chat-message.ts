import type { ThreadMessageLike } from "@assistant-ui/react";
import type { ChatMessage } from "@/components/chat/types";
import { normalizeRole } from "../inbound/message-normalize";
import { stripAgentWrapperTags } from "./agent-message-tags";


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

export function convertGatewayChatMessage(msg: ChatMessage): ThreadMessageLike {
  const role = normalizeRole(msg.role) as "user" | "assistant" | "system";
  const parts: ContentPart[] = [];

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
      } else if (block.type === "ui") {
        // assistant-ui doesn't support unknown message part types. Encode UI surfaces
        // as a special tool-call part, and render them ourselves in AssistantMessage.
        parts.push({
          type: "tool-call",
          toolCallId: `ui:${block.uiId}`,
          toolName: "__ui__",
          args: {
            uiId: block.uiId,
            component: block.component,
            payload: block.payload,
          },
        });
      }
    }
  } else if (msg.content.trim()) {
    parts.push({ type: "text", text: stripAgentWrapperTags(msg.content) });
  }

  if (parts.length === 0) {
    parts.push({ type: "text", text: "" });
  }

  return {
    id: msg.id,
    role,
    content: parts as ThreadMessageLike["content"],
    createdAt: new Date(msg.ts),
  };
}
