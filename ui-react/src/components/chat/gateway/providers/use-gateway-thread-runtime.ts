import { useMemo } from "react";
import { useShallow } from "zustand/shallow";
import { resolveActiveChatSessionKey } from "../../session/active-session";
import {
  hydrateProjectionFromHistoryRun,
  mergeHydratedInteractiveStreams,
  mergeHydratedToolStreams,
} from "../../utils/hydrate-projection-from-history";
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
    // Thread "running" is a UI/runtime concern: it controls whether we render a
    // synthetic `__stream__` assistant message and show Cancel vs Send.
    //
    // It deliberately uses multiple signals:
    // - `sending`: optimistic, immediate UX after the user submits (before any WS events arrive)
    // - `pendingForActiveSession`: backend-derived run activity (restored via `chat.status` or WS events)
    // - `liveCumulativeText`: projection has already started receiving stream deltas (defensive fallback)
    const isOptimisticallySending = chatSlice.sending;
    const hasActiveRunForSession = chatSlice.pendingForActiveSession != null;
    const hasLiveProjectionStream = projectionSlice.liveCumulativeText !== null;
    const isRunning = isOptimisticallySending || hasActiveRunForSession || hasLiveProjectionStream;

    const hydration =
      isRunning && effectiveRunId
        ? hydrateProjectionFromHistoryRun({
            chatMessages: chatSlice.chatMessages,
            effectiveRunId,
          })
        : null;

    const committedBlocks = hydration
      ? [...hydration.committedBlocks, ...projectionSlice.committedBlocks]
      : projectionSlice.committedBlocks;
    const mergedTools = hydration
      ? mergeHydratedToolStreams({
          hydratedById: hydration.toolStreamById,
          hydratedOrder: hydration.toolStreamOrder,
          liveById: projectionSlice.toolStreamById,
          liveOrder: projectionSlice.toolStreamOrder,
        })
      : { byId: projectionSlice.toolStreamById, order: projectionSlice.toolStreamOrder };
    const mergedInteractive = hydration
      ? mergeHydratedInteractiveStreams({
          hydratedById: hydration.interactiveStreamById,
          hydratedOrder: hydration.interactiveStreamOrder,
          liveById: projectionSlice.interactiveStreamById,
          liveOrder: projectionSlice.interactiveStreamOrder,
        })
      : {
          byId: projectionSlice.interactiveStreamById,
          order: projectionSlice.interactiveStreamOrder,
        };

    const messages = selectThreadMessages({
      chatMessages: hydration ? hydration.baseChatMessages : chatSlice.chatMessages,
      isRunning,
      liveCumulativeText: projectionSlice.liveCumulativeText,
      committedBlocks,
      toolStreamById: mergedTools.byId,
      toolStreamOrder: mergedTools.order,
      interactiveStreamById: mergedInteractive.byId,
      interactiveStreamOrder: mergedInteractive.order,
      effectiveRunId,
    });

    return { messages, isRunning, activeSessionKey };
  }, [activeSessionKey, chatSlice, projectionSlice]);
}
