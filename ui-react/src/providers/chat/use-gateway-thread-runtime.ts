import { useMemo } from "react";
import { useShallow } from "zustand/shallow";
import { resolveActiveChatSessionKey } from "@/hooks/chat-event-bridge/active-session";
import { selectThreadMessages } from "@/run-projection/selectors";
import { useRunProjectionStore } from "@/run-projection/store";
import { useRunStatusStore } from "@/run-status/store";
import { useChatStore, type ChatMessage } from "@/store/chat.store";

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
    })),
  );

  const runStatusSlice = useRunStatusStore(
    useShallow((s) => ({
      activeRun: s.activeRunsBySession[activeSessionKey],
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
    const effectiveRunId =
      chatSlice.runId ?? runStatusSlice.activeRun?.runId ?? null;
    const isRunning =
      chatSlice.sending ||
      projectionSlice.liveCumulativeText !== null ||
      runStatusSlice.activeRun != null;

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
  }, [activeSessionKey, chatSlice, projectionSlice, runStatusSlice]);
}
