import type { RunEvent } from "@/run-stream/run-event";
import type { CanonicalChatEvent, RunId, ThreadId } from "./types";
import { EventType } from "./types";

/**
 * Adapter: RunEvent (current normalized gateway stream) -> CanonicalChatEvent.
 *
 * This is intentionally lossy for now (Phase 1 parallel wiring) and exists to
 * prove the canonical reducer shape without rewriting the gateway adapter yet.
 */
export function runEventsToCanonical(
  events: RunEvent[],
  threadId: ThreadId,
  runId: RunId | undefined,
  tsBase = Date.now(),
): CanonicalChatEvent[] {
  const rid = runId ?? "unknown";
  const out: CanonicalChatEvent[] = [];
  let ts = tsBase;

  for (const e of events) {
    ts += 1;
    switch (e.type) {
      case "run.started":
        out.push({
          type: EventType.RunStarted,
          threadId,
          runId: (e.runId ?? rid) as RunId,
          ts,
        });
        break;

      case "text.delta":
        out.push({
          type: EventType.MessageSetLiveText,
          threadId,
          ts,
          messageId: `run:${rid}`,
          fullText: e.text,
        });
        break;

      case "text.append":
        if (e.text) {
          out.push({
            type: EventType.MessageAppendText,
            threadId,
            ts,
            messageId: `run:${rid}`,
            partId: crypto.randomUUID(),
            text: e.text,
          });
        }
        break;

      case "tool.start":
        out.push({
          type: EventType.ToolStart,
          threadId,
          runId: rid as RunId,
          ts,
          toolCallId: e.id,
          toolName: e.name,
          args: e.args,
        });
        break;

      case "tool.ui":
        out.push({
          type: EventType.ToolUi,
          threadId,
          runId: rid as RunId,
          ts,
          toolCallId: e.id,
          toolName: e.name,
          kind: e.kind,
          payload: e.payload,
        });
        break;

      case "tool.update":
        out.push({
          type: EventType.ToolUpdate,
          threadId,
          runId: rid as RunId,
          ts,
          toolCallId: e.id,
          partialOutput: e.partialOutput,
        });
        break;

      case "tool.result":
        out.push({
          type: EventType.ToolResult,
          threadId,
          runId: rid as RunId,
          ts,
          toolCallId: e.id,
          output: e.output,
        });
        break;

      case "tool.error":
        out.push({
          type: EventType.ToolError,
          threadId,
          runId: rid as RunId,
          ts,
          toolCallId: e.id,
          error: e.error,
        });
        break;

      case "run.finished":
        out.push({ type: EventType.RunFinished, threadId, runId: rid as RunId, ts });
        break;

      case "run.error":
        out.push({
          type: EventType.RunError,
          threadId,
          runId: rid as RunId,
          ts,
          message: e.message,
        });
        break;

      case "run.aborted":
        out.push({ type: EventType.RunAborted, threadId, runId: rid as RunId, ts });
        break;

      default:
        break;
    }
  }

  return out;
}

