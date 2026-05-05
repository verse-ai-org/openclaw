import type { ToolFallbackJsonObject } from "@/components/chat/tool";

// ---------------------------------------------------------------------------
// assistant-ui runtime message parts (used by MessagePrimitive rendering)
// ---------------------------------------------------------------------------

export type AssistantToolPart = {
  toolCallId: string;
  toolName: string;
  args: ToolFallbackJsonObject;
  result?: string;
  isError?: boolean;
};

export type AssistantContentPart =
  | { type: "text"; text: string }
  | ({ type: "tool-call" } & AssistantToolPart);

