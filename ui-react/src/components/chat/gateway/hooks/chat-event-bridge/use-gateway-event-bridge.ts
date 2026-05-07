import { useEffect, useRef } from "react";
import {
  registerChatDispatch,
  unregisterChatDispatch,
} from "@/store/gateway.store";
import { dispatchGatewayChatEvent } from "./dispatch-gateway-chat";
import type { BridgeRuntimeContext } from "@/components/chat/types";

/**
 * Creates and registers the chat event bridge. Returns the stable
 * `BridgeRuntimeContext` ref so the caller can expose it via
 * `BridgeChatContext.Provider`.
 */
export function useGatewayEventBridge(): BridgeRuntimeContext {
  const ctxRef = useRef<BridgeRuntimeContext>({
    pendingInteractiveHydrationRuns: new Set<string>(),
    pendingToolResults: new Map<string, { phase: "result" | "error"; data: Record<string, unknown> }>(),
    activeRunBySession: new Map<string, string>(),
    finalizedRunBySession: new Map<string, string>(),
  });

  useEffect(() => {
    const ctx = ctxRef.current;
    const dispatch = (event: string, payload: unknown) => {
      dispatchGatewayChatEvent(ctx, event, payload);
    };

    registerChatDispatch(dispatch);

    return () => {
      unregisterChatDispatch();
    };
  }, []);

  return ctxRef.current;
}
