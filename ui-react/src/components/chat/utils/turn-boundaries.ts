import type { ChatMessage } from "@/components/chat/types";

export function isFirstAssistantInTurn(args: {
  historyMessages: ChatMessage[];
  assistantMessageId: string;
}): boolean {
  const { historyMessages, assistantMessageId } = args;
  const idx = historyMessages.findIndex((m) => m.id === assistantMessageId);
  if (idx < 0) {
    // Streaming placeholder (__stream__) not in store yet — treat as first in turn
    // if the last stored message is a user message.
    const last = historyMessages.at(-1);
    return !last || last.role === "user";
  }
  const prev = historyMessages[idx - 1];
  return !prev || prev.role === "user";
}

