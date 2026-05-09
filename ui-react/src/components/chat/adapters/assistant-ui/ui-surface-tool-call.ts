import type { AssistantUiToolPart } from "@/components/chat/types";

export const UI_SURFACE_TOOL_NAME = "__ui__";

export type UiSurfaceToolCallArgs = {
  uiId: string;
  component: string;
  payload: unknown;
};

export function encodeUiSurfaceAsToolCallPart(input: {
  uiId: string;
  component: string;
  payload: unknown;
}): {
  type: "tool-call";
  toolCallId: string;
  toolName: string;
  args: UiSurfaceToolCallArgs;
} {
  return {
    type: "tool-call",
    toolCallId: `ui:${input.uiId}`,
    toolName: UI_SURFACE_TOOL_NAME,
    args: {
      uiId: input.uiId,
      component: input.component,
      payload: input.payload,
    },
  };
}

export function decodeUiSurfaceFromToolCallPart(part: {
  type: "tool-call";
  toolCallId: string;
  toolName: string;
  args: unknown;
}): AssistantUiToolPart | null {
  if (part.toolName !== UI_SURFACE_TOOL_NAME) {
    return null;
  }

  const args = (part.args ?? {}) as Record<string, unknown>;
  const uiId = typeof args.uiId === "string" && args.uiId.trim() ? args.uiId : part.toolCallId;
  const component =
    typeof args.component === "string" && args.component.trim() ? args.component : "unknown";

  return {
    uiId,
    component,
    payload: args.payload,
  };
}

