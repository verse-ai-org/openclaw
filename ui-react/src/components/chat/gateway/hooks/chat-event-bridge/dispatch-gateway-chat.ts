import { handleAgentEvent } from "./handlers/agent-event";
import { handleChatEvent } from "./handlers/chat-event";
import { checkGatewayWsAgentPayload, checkGatewayWsChatPayload } from "./gateway-ws-check";
import { logChatDebug } from "../../../utils/chat-debug";
import type { BridgeRuntimeContext } from "@/components/chat/types";

/**
 * Gateway WS fan-in: `chat` / `agent` payloads are normalized inside handlers
 * and `run-projection` reducers; **terminal** transitions (final/error/aborted)
 * and persisting assistant rows live in `handlers/shared.ts` (`finalizeChatRun`).
 */
export function dispatchGatewayChatEvent(
  ctx: BridgeRuntimeContext,
  event: string,
  payload: unknown,
): void {
  const payloadObject = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : undefined;

  logChatDebug(
    "debug",
    "ws ingress",
    {
      event,
      stream: payloadObject?.stream,
      sessionKey: payloadObject?.sessionKey,
      runId: payloadObject?.runId,
      state: payloadObject?.state,
      phase: (payloadObject?.data as { phase?: unknown } | undefined)?.phase,
    },
    { channel: "bridge.ingress" },
  );

  switch (event) {
    case "chat": {
      handleChatEvent(ctx, checkGatewayWsChatPayload(payload));
      break;
    }
    case "agent":
      handleAgentEvent(ctx, checkGatewayWsAgentPayload(payload));
      break;
    default:
      break;
  }
}
