import { useEffect } from "react";
import {
  registerChatDispatch,
  unregisterChatDispatch,
} from "@/store/gateway.store";
import { handleAgentEvent } from "./handlers/agent-event";
import { handleChatEvent } from "./handlers/chat-event";
import type { BridgeRuntimeContext } from "./handlers/shared";
import {
  attachChatBridgeRunContext,
  detachChatBridgeRunContext,
} from "./run-bridge-context";

export function useChatEventBridge() {
  useEffect(() => {
    const ctx: BridgeRuntimeContext = {
      pendingInteractiveHydrationRuns: new Set<string>(),
      pendingToolResults: new Map<string, { phase: "result" | "error"; data: Record<string, unknown> }>(),
      activeRunBySession: new Map<string, string>(),
      finalizedRunBySession: new Map<string, string>(),
    };

    const dispatch = (event: string, payload: unknown) => {
      const payloadObject =
        payload && typeof payload === "object" ? (payload as Record<string, unknown>) : undefined;
      if (import.meta.env.DEV) {
        console.log(
          `[ChatEventBridge] ${event}`,
          payloadObject?.stream ?? payloadObject?.sessionKey ?? payloadObject?.runId,
        );
      }

      switch (event) {
        case "chat":
          handleChatEvent(
            ctx,
            payload as {
              runId?: string;
              sessionKey?: string;
              state?: string;
              message?: unknown;
              errorMessage?: string;
            },
          );
          break;
        case "agent":
          handleAgentEvent(
            ctx,
            payload as {
              stream?: string;
              sessionKey?: string;
              runId?: string;
              data?: unknown;
            },
          );
          break;
        default:
          break;
      }
    };

    attachChatBridgeRunContext(ctx);
    registerChatDispatch(dispatch);
    return () => {
      detachChatBridgeRunContext();
      unregisterChatDispatch();
    };
  }, []);
}
