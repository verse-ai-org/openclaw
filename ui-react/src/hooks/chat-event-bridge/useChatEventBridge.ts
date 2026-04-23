import { useEffect } from "react";
import {
  registerChatDispatch,
  unregisterChatDispatch,
} from "@/store/gateway.store";
import { logChatDebug } from "@/lib/chat-debug";
import { handleAgentEvent } from "./handlers/agent-event";
import { handleChatEvent } from "./handlers/chat-event";
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
    };

    const dispatch = (event: string, payload: unknown) => {
      const p = payload as Record<string, unknown> | undefined;
      logChatDebug(
        "debug",
        `gateway event: ${event}`,
        {
          runId: p?.runId,
          sessionKey: p?.sessionKey,
          state: p?.state,
          stream: p?.stream,
          phase: (p?.data as Record<string, unknown> | undefined)?.phase,
        },
        {
          channel: "chat",
          runId: typeof p?.runId === "string" ? p.runId : undefined,
          sessionKey: typeof p?.sessionKey === "string" ? p.sessionKey : undefined,
          state: typeof p?.state === "string" ? p.state : undefined,
          phase:
            typeof (p?.data as Record<string, unknown> | undefined)?.phase === "string"
              ? String((p?.data as Record<string, unknown>).phase)
              : undefined,
        },
      );

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

    registerChatDispatch(dispatch);
    return () => {
      unregisterChatDispatch();
    };
  }, []);
}
