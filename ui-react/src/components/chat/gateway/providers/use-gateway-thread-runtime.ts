import { useMemo } from "react";
import { useShallow } from "zustand/shallow";
import { useChatStore } from "@/store/chat.store";
import { useConversationStore } from "@/store/conversation.store";
import { resolveActiveChatSessionKey } from "../../session/active-session";
import type { ChatMessage } from "@/components/chat/types";
import { selectChatMessages, selectIsRunning } from "@/store/conversation-selectors";
import { useHydrateUiStateFromHistory } from "@/components/chat/ui-tool/use-hydrate-ui-state";

export type GatewayThreadRuntime = {
  messages: ChatMessage[];
  isRunning: boolean;
  activeSessionKey: string;
};

/**
 * Subscribes to conversation state and projects it to ChatMessage[] for assistant-ui.
 */
export function useGatewayThreadRuntime(
  chatSessionKey: string | null,
  settingsSessionKey: string | null | undefined,
): GatewayThreadRuntime {
  const activeSessionKey = useMemo(
    () => resolveActiveChatSessionKey(chatSessionKey, settingsSessionKey),
    [chatSessionKey, settingsSessionKey],
  );

  const { sending } = useChatStore(
    useShallow((s) => ({
      sending: s.sending,
    })),
  );

  const conversation = useConversationStore((s) => s.byThread[activeSessionKey]);

  const messages = useMemo(
    () => (conversation ? selectChatMessages(conversation) : []),
    [conversation],
  );
  const isRunning = sending || (conversation ? selectIsRunning(conversation) : false);

  useHydrateUiStateFromHistory({ activeThreadId: activeSessionKey, messages });

  return useMemo(
    () => ({ messages, isRunning, activeSessionKey }),
    [messages, isRunning, activeSessionKey],
  );
}
