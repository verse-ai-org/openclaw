import { useMemo } from "react";
import { useShallow } from "zustand/shallow";
import { useChatStore } from "@/store/chat.store";
import { resolveActiveChatSessionKey } from "../../session/active-session";
import { mergeAssistantRunSegments } from "../../messages/inbound/merge-assistant-run-segments";
import { toLiveMessage } from "@/run-stream/run-message";
import type { ChatMessage } from "@/components/chat/types";

export type GatewayThreadRuntime = {
  messages: ChatMessage[];
  isRunning: boolean;
  activeSessionKey: string;
};

/**
 * Subscribes to chat history + active run state, builds the full message list
 * including the synthetic `__stream__` row while a run is in progress.
 */
export function useGatewayThreadRuntime(
  chatSessionKey: string | null,
  settingsSessionKey: string | null | undefined,
): GatewayThreadRuntime {
  const activeSessionKey = useMemo(
    () => resolveActiveChatSessionKey(chatSessionKey, settingsSessionKey),
    [chatSessionKey, settingsSessionKey],
  );

  const { chatMessages, sending, activeRunState } = useChatStore(
    useShallow((s) => ({
      chatMessages: s.messages,
      sending: s.sending,
      activeRunState: s.activeRunState,
    })),
  );

  return useMemo(() => {
    const isRunning = sending || activeRunState !== null;
    const base = mergeAssistantRunSegments(chatMessages);
    const messages =
      activeRunState !== null ? [...base, toLiveMessage(activeRunState)] : base;
    return { messages, isRunning, activeSessionKey };
  }, [chatMessages, sending, activeRunState, activeSessionKey]);
}
