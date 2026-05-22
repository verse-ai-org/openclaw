import { useMemo, useRef } from "react";
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
 * Shallow-compare two ChatMessage arrays by id + content + contentBlocks length + status.
 * Returns true when assistant-ui does NOT need to re-render.
 */
function messagesStructurallyEqual(a: ChatMessage[], b: ChatMessage[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const ma = a[i]!;
    const mb = b[i]!;
    if (ma.id !== mb.id) return false;
    if (ma.content !== mb.content) return false;
    if (ma.role !== mb.role) return false;
    if ((ma.contentBlocks?.length ?? 0) !== (mb.contentBlocks?.length ?? 0)) return false;
  }
  return true;
}

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

  const prevMessagesRef = useRef<ChatMessage[]>([]);
  const messages = useMemo(() => {
    const next = conversation ? selectChatMessages(conversation) : [];
    if (messagesStructurallyEqual(prevMessagesRef.current, next)) {
      return prevMessagesRef.current;
    }
    prevMessagesRef.current = next;
    return next;
  }, [conversation]);
  const isRunning = sending || (conversation ? selectIsRunning(conversation) : false);

  useHydrateUiStateFromHistory({ activeThreadId: activeSessionKey, messages });

  return useMemo(
    () => ({ messages, isRunning, activeSessionKey }),
    [messages, isRunning, activeSessionKey],
  );
}
