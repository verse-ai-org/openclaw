import type { ChatMessageMetadata } from "@/components/chat/types";

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
