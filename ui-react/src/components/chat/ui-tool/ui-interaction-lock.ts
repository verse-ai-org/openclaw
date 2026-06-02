import type { ConversationState } from "@/components/chat/conversation";
import { selectIsRunning } from "@/store/conversation-selectors";

/** True while an outbound send or assistant run is in progress — Interactive cards stay read-only. */
export function isInteractionLocked(args: {
  sending: boolean;
  conversation: ConversationState | undefined;
}): boolean {
  if (args.sending) {
    return true;
  }
  return args.conversation ? selectIsRunning(args.conversation) : false;
}
