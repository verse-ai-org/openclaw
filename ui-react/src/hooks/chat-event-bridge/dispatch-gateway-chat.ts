import { handleAgentEvent, type AgentEventPayload } from "./handlers/agent-event";
import { handleChatEvent, type ChatEventPayload } from "./handlers/chat-event";
import type { BridgeEventOutcome } from "./handlers/event-outcome";
import type { BridgeRuntimeContext } from "./handlers/shared";
import { logChatDebug } from "@/lib/chat-debug";
import { useRunStatusStore } from "@/run-status/store";

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

  const emitOutcome = (outcome: BridgeEventOutcome, channel: "chat" | "agent.lifecycle" | "agent.tool") => {
    if (outcome.kind === "ignored") {
      // keep warnings/errors visible even if debug logging is off
      const level = outcome.reason === "stale" ? "warn" : "debug";
      logChatDebug(level, `ws ignored: ${outcome.reason}`, outcome, { channel });
      return;
    }
    logChatDebug("debug", `ws ${outcome.kind}`, outcome, { channel });
  };

  const dispatchRunStatus = (outcome: BridgeEventOutcome) => {
    const sessionKeyRaw = payloadObject?.sessionKey;
    const sessionKey =
      typeof sessionKeyRaw === "string" && sessionKeyRaw.trim()
        ? sessionKeyRaw.trim()
        : "";
    if (!sessionKey) {
      return;
    }
    const runIdRaw = payloadObject?.runId;
    const runId = typeof runIdRaw === "string" && runIdRaw.trim() ? runIdRaw.trim() : null;

    if (outcome.kind === "applied") {
      useRunStatusStore.getState().dispatch({ type: "RUN_PROGRESS_SEEN", sessionKey, runId });
      return;
    }
    if (outcome.kind === "finalized") {
      const chatState = payloadObject?.state;
      const terminal =
        chatState === "error"
          ? ("error" as const)
          : chatState === "aborted"
            ? ("aborted" as const)
            : ("final" as const);
      useRunStatusStore.getState().dispatch({
        type: "RUN_TERMINAL",
        sessionKey,
        runId,
        terminal,
      });
    }
  };

  switch (event) {
    case "chat":
      {
        const outcome = handleChatEvent(ctx, payload as ChatEventPayload);
        dispatchRunStatus(outcome);
        emitOutcome(outcome, "chat");
      }
      break;
    case "agent":
      {
        const stream = payloadObject?.stream;
        const channel = stream === "lifecycle" ? "agent.lifecycle" : "agent.tool";
        const outcome = handleAgentEvent(ctx, payload as AgentEventPayload);
        dispatchRunStatus(outcome);
        emitOutcome(outcome, channel);
      }
      break;
    default:
      break;
  }
}
