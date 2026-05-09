import type { ChatMessage } from "@/components/chat/types";
import type { ConversationState, CanonicalMessage } from "@/components/chat/conversation";
import { canonicalMessagesToChatMessages } from "@/components/chat/conversation";

export function selectCanonicalMessages(state: ConversationState): CanonicalMessage[] {
  return state.messageOrder
    .map((id) => state.messagesById.get(id))
    .filter(Boolean) as CanonicalMessage[];
}

export function selectChatMessages(state: ConversationState): ChatMessage[] {
  return canonicalMessagesToChatMessages(selectCanonicalMessages(state));
}

export function selectIsRunning(state: ConversationState): boolean {
  const rid = state.activeRunId;
  if (!rid) return false;
  const run = state.runsById.get(rid);
  return run?.status === "running";
}

export function selectActiveRunId(state: ConversationState): string | undefined {
  return state.activeRunId;
}
