import { useMemo } from "react";
import { useShallow } from "zustand/shallow";
import { resolveActiveChatSessionKey } from "../../session/active-session";
import { selectThreadMessages } from "@/run-projection/selectors";
import { useRunProjectionStore } from "@/run-projection/store";
import type { ChatMessage } from "@/components/chat/types";
import { useChatStore } from "@/store/chat.store";

export type GatewayThreadRuntime = {
  messages: ChatMessage[];
  isRunning: boolean;
  activeSessionKey: string;
};

/**
 * Subscribes to chat history + run projection with shallow equality, then builds
 * assistant-ui runtime messages (including synthetic `__stream__`).
 */
export function useGatewayThreadRuntime(
  chatSessionKey: string | null,
  settingsSessionKey: string | null | undefined,
): GatewayThreadRuntime {
  const activeSessionKey = useMemo(
    () => resolveActiveChatSessionKey(chatSessionKey, settingsSessionKey),
    [chatSessionKey, settingsSessionKey],
  );

  const chatSlice = useChatStore(
    useShallow((s) => ({
      chatMessages: s.messages,
      sending: s.sending,
      runId: s.runId,
      pendingForActiveSession: s.pendingGenerationBySession[activeSessionKey],
    })),
  );

  const projectionSlice = useRunProjectionStore(
    useShallow((s) => ({
      liveCumulativeText: s.liveCumulativeText,
      committedBlocks: s.committedBlocks,
      toolStreamById: s.toolStreamById,
      toolStreamOrder: s.toolStreamOrder,
      interactiveStreamById: s.interactiveStreamById,
      interactiveStreamOrder: s.interactiveStreamOrder,
    })),
  );

  return useMemo(() => {
    const effectiveRunId = chatSlice.runId ?? chatSlice.pendingForActiveSession?.runId ?? null;
    const isRunning = chatSlice.sending || projectionSlice.liveCumulativeText !== null || chatSlice.pendingForActiveSession != null;

    const messages = selectThreadMessages({
      chatMessages: chatSlice.chatMessages,
      isRunning,
      liveCumulativeText: projectionSlice.liveCumulativeText,
      committedBlocks: projectionSlice.committedBlocks,
      toolStreamById: projectionSlice.toolStreamById,
      toolStreamOrder: projectionSlice.toolStreamOrder,
      interactiveStreamById: projectionSlice.interactiveStreamById,
      interactiveStreamOrder: projectionSlice.interactiveStreamOrder,
      effectiveRunId,
    });

    return { messages, isRunning, activeSessionKey };
  }, [activeSessionKey, chatSlice, projectionSlice]);
}
