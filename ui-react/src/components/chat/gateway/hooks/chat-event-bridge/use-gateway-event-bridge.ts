import { useEffect } from "react";
import {
  registerChatDispatch,
  unregisterChatDispatch,
} from "@/store/gateway.store";
import { dispatchGatewayChatEvent } from "./dispatch-gateway-chat";
import {
  attachChatBridgeRunContext,
  detachChatBridgeRunContext,
} from "./run-bridge-context";
import type { BridgeRuntimeContext } from "@/components/chat/types";

export function useGatewayEventBridge() {
  useEffect(() => {
    const ctx: BridgeRuntimeContext = {
      pendingInteractiveHydrationRuns: new Set<string>(),
      pendingToolResults: new Map<string, { phase: "result" | "error"; data: Record<string, unknown> }>(),
      activeRunBySession: new Map<string, string>(),
      finalizedRunBySession: new Map<string, string>(),
    };

    const dispatch = (event: string, payload: unknown) => {
      dispatchGatewayChatEvent(ctx, event, payload);
    };

    attachChatBridgeRunContext(ctx);
    registerChatDispatch(dispatch);

    return () => {
      detachChatBridgeRunContext();
      unregisterChatDispatch();
    };
  }, []);
}
