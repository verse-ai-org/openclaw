import type { ChatMessageMetadata } from "@/components/chat/types";

/** Prefer structured tool payload id over UI row ids (toolCallId / stale uiId). */
export function resolveInteractionId(payload: { id?: unknown }, fallback: string): string {
  if (typeof payload.id === "string" && payload.id.trim()) {
    return payload.id.trim();
  }
  return fallback;
}

export function buildInteractionMetadata(args: {
  interactionId: string;
  component: "question_flow" | "option_list" | "approval_card";
  payload: unknown;
}): ChatMessageMetadata {
  return {
    interaction: {
      id: args.interactionId,
      component: args.component,
      schemaVersion: 1,
      status: "submitted",
      payload: args.payload,
      submittedAt: Date.now(),
    },
  };
}

