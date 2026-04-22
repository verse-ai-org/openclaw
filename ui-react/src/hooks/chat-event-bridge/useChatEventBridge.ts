import { useEffect } from "react";
import {
  registerChatDispatch,
  unregisterChatDispatch,
} from "@/store/gateway.store";
import { handleAgentEvent } from "./handlers/agent-event";
import { handleChatEvent } from "./handlers/chat-event";
import { handleInteractionEvent } from "./handlers/interaction-event";
import type { BridgeRuntimeContext } from "./handlers/shared";

export function useChatEventBridge() {
  useEffect(() => {
    const ctx: BridgeRuntimeContext = {
      pendingInteractiveHydrationRuns: new Set<string>(),
      // Buffer for out-of-order tool events: result/error may arrive before start.
      pendingToolResults: new Map<
        string,
        { phase: "result" | "error"; data: Record<string, unknown> }
      >(),
      activeRunBySession: new Map<string, string>(),
      pendingLifecycleFinalizeByRun: new Map<string, ReturnType<typeof setTimeout>>(),
    };

    const dispatch = (event: string, payload: unknown) => {
      if (import.meta.env.DEV) {
        console.log(`[ChatEventBridge] ${event}`, payload);
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
        case "interaction":
          handleInteractionEvent(
            payload as {
              version?: number;
              phase?: string;
              sessionKey?: string;
              interactionId?: string;
              kind?: string;
              status?: string;
              definition?: unknown;
              payload?: unknown;
            },
          );
          break;
        default:
          break;
      }
    };

    registerChatDispatch(dispatch);
    return () => {
      for (const timer of ctx.pendingLifecycleFinalizeByRun.values()) {
        clearTimeout(timer);
      }
      ctx.pendingLifecycleFinalizeByRun.clear();
      unregisterChatDispatch();
    };
  }, []);
}
