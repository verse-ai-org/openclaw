import { useEffect } from "react";
import { registerChatDispatch, unregisterChatDispatch } from "@/store/gateway.store";
import { gatewayToRunEvents } from "../gateway-run-adapter";
import { runEventsToCanonical } from "@/components/chat/conversation/gateway-adapter";
import { useConversationStore } from "@/store/conversation.store";
import { useChatStore } from "@/store/chat.store";
import { EventType } from "@/components/chat/conversation";

/**
 * Registers the Gateway WebSocket event bridge for the current component tree.
 *
 * Translates raw `chat` / `agent` WS payloads → RunEvents via gateway-run-adapter,
 * then feeds canonical conversation events into the conversation store.
 *
 * No return value — side-effect only (registers/unregisters on mount/unmount).
 */
export function useGatewayEventBridge(): void {
  useEffect(() => {
    const dispatch = (wsEvent: string, wsPayload: unknown) => {
      const { events, sessionKey, runId } = gatewayToRunEvents(wsEvent, wsPayload);
      if (events.length > 0) {
        // Feed canonical conversation reducer.
        const canonical = runEventsToCanonical(events, sessionKey, runId);
        // console.log("canonical", JSON.stringify(canonical, null, 2));
        if (canonical.length > 0) {
          useConversationStore.getState().applyEvents(sessionKey, canonical);

          // Clear optimistic UI state when the run terminates.
          const hasTerminal = canonical.some(
            (e) =>
              e.type === EventType.RunFinished ||
              e.type === EventType.RunError ||
              e.type === EventType.RunAborted,
          );
          if (hasTerminal) {
            const st = useChatStore.getState();
            st.setSending(false);
            st.triggerSessionsReload();
            if (sessionKey.trim()) {
              st.setPendingHistoryReloadKey(sessionKey);
            }
          }

          const error = canonical.find((e) => e.type === EventType.RunError);
          if (error && error.type === EventType.RunError) {
            useChatStore.getState().setLastError(
              error.message?.trim() || "Generation failed. Please try again.",
            );
          }
        }
      }
    };

    registerChatDispatch(dispatch);
    return () => {
      unregisterChatDispatch();
    };
  }, []);
}
