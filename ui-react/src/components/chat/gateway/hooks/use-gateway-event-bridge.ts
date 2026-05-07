import { useEffect } from "react";
import { registerChatDispatch, unregisterChatDispatch } from "@/store/gateway.store";
import { gatewayToRunEvents } from "../gateway-run-adapter";
import { dispatchRunEvents } from "@/run-stream/run-dispatch";

/**
 * Registers the Gateway WebSocket event bridge for the current component tree.
 *
 * Translates raw `chat` / `agent` WS payloads → RunEvents via gateway-run-adapter,
 * then routes them to run-dispatch which owns all run lifecycle management.
 *
 * No return value — side-effect only (registers/unregisters on mount/unmount).
 */
export function useGatewayEventBridge(): void {
  useEffect(() => {
    const dispatch = (wsEvent: string, wsPayload: unknown) => {
      const { events, sessionKey, runId } = gatewayToRunEvents(wsEvent, wsPayload);
      if (events.length > 0) {
        dispatchRunEvents(events, sessionKey, runId);
      }
    };

    registerChatDispatch(dispatch);
    return () => {
      unregisterChatDispatch();
    };
  }, []);
}
