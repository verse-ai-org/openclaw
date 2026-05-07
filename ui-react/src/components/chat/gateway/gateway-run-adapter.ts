/**
 * Gateway WS → RunEvent translation layer.
 *
 * This is the ONLY file that knows about Gateway wire formats (chat / agent
 * WS event payloads). Everything downstream operates on the protocol-agnostic
 * RunEvent type from @/run-stream.
 */
import { createInteractiveBlock, isInteractiveToolName } from "../interactive/blocks";
import {
  checkGatewayWsChatPayload,
  checkGatewayWsAgentPayload,
  checkGatewayAgentLifecycleData,
  checkGatewayAgentToolData,
} from "./gateway-ws-check";
import { extractGatewayChatMessageText } from "@/components/chat/utils/inbound/message-normalize";
import type { RunEvent } from "@/run-stream";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeSessionKey(raw: unknown): string {
  return typeof raw === "string" && raw.trim() ? raw.trim() : "";
}

function normalizeRunId(raw: unknown): string | undefined {
  return typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type GatewayRunAdapterResult = {
  events: RunEvent[];
  /** Session key extracted from the payload — used for routing in run-dispatch. */
  sessionKey: string;
  /** Run id extracted from the payload — used for stale-event detection. */
  runId: string | undefined;
};

/**
 * Translate a raw Gateway WebSocket event (event name + payload) into zero or
 * more protocol-agnostic RunEvents plus the session/run routing keys.
 *
 * Returns `{ events: [], sessionKey: "", runId: undefined }` for events that
 * should be silently ignored.
 */
export function gatewayToRunEvents(
  wsEvent: string,
  payload: unknown,
): GatewayRunAdapterResult {
  const p = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const sessionKey = normalizeSessionKey(p.sessionKey);
  const runId = normalizeRunId(p.runId);

  if (wsEvent === "chat") {
    const chat = checkGatewayWsChatPayload(payload);
    if (!chat?.state) return { events: [], sessionKey, runId };

    switch (chat.state) {
      case "delta": {
        const text = extractGatewayChatMessageText(chat.message);
        if (!text) return { events: [], sessionKey, runId };
        return { events: [{ type: "text.delta", text }], sessionKey, runId };
      }
      case "final": {
        const text = extractGatewayChatMessageText(chat.message);
        return {
          events: [{ type: "run.finished", text: text || undefined }],
          sessionKey,
          runId,
        };
      }
      case "error":
        return {
          events: [{ type: "run.error", message: chat.errorMessage }],
          sessionKey,
          runId,
        };
      case "aborted":
        return { events: [{ type: "run.aborted" }], sessionKey, runId };
      default:
        return { events: [], sessionKey, runId };
    }
  }

  if (wsEvent === "agent") {
    const agent = checkGatewayWsAgentPayload(payload);
    if (!agent) return { events: [], sessionKey, runId };

    if (agent.stream === "lifecycle") {
      const data = checkGatewayAgentLifecycleData(agent.data);
      if (!data) return { events: [], sessionKey, runId };
      switch (data.phase) {
        case "start":
          return {
            events: [{ type: "run.started", sessionKey, runId }],
            sessionKey,
            runId,
          };
        case "end":
        case "error":
          // Terminal run state comes from the `chat` channel (`final` / `error` /
          // `aborted`). Gateway broadcasts `agent` lifecycle end *before* `chat`
          // final; mapping end/error here would clear the run too early and drop
          // the following chat frames.
          return { events: [], sessionKey, runId };
        default:
          return { events: [], sessionKey, runId };
      }
    }

    if (agent.stream === "tool") {
      const data = checkGatewayAgentToolData(agent.data);
      if (!data) return { events: [], sessionKey, runId };

      const id =
        typeof data.toolCallId === "string" && data.toolCallId.trim()
          ? data.toolCallId
          : crypto.randomUUID();
      const name = typeof data.name === "string" && data.name.trim() ? data.name : "tool";

      switch (data.phase) {
        case "start":
          // Interactive UI: parse full payload from args (gateway sends structured
          // question_flow / option_list / approval_card at start — no history reload needed).
          if (isInteractiveToolName(name)) {
            const block = createInteractiveBlock({
              interactiveId: id,
              kind: name,
              payload: data.args,
            });
            if (!block) return { events: [], sessionKey, runId };
            return {
              events: [{ type: "interactive.start", block }],
              sessionKey,
              runId,
            };
          }
          return {
            events: [{ type: "tool.start", id, name, args: data.args }],
            sessionKey,
            runId,
          };

        case "update":
          if (isInteractiveToolName(name)) return { events: [], sessionKey, runId };
          return {
            events: [
              {
                type: "tool.update",
                id,
                partialOutput: data.partialResult ?? data.meta,
              },
            ],
            sessionKey,
            runId,
          };

        case "result": {
          // Interactive tools render from `interactive.start`; result often only carries meta/id.
          if (isInteractiveToolName(name)) {
            return { events: [], sessionKey, runId };
          }
          const isError = Boolean(data.isError);
          return {
            events: isError
              ? [
                {
                  type: "tool.error",
                  id,
                  error: typeof data.error === "string" ? data.error : undefined,
                },
              ]
              : [{ type: "tool.result", id, output: data.meta ?? data.result }],
            sessionKey,
            runId,
          };
        }

        case "error":
          if (isInteractiveToolName(name)) return { events: [], sessionKey, runId };
          return {
            events: [
              {
                type: "tool.error",
                id,
                error: typeof data.error === "string" ? data.error : undefined,
              },
            ],
            sessionKey,
            runId,
          };

        default:
          return { events: [], sessionKey, runId };
      }
    }
  }

  return { events: [], sessionKey, runId };
}
