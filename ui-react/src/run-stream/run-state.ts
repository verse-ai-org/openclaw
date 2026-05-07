import type {
  ContentBlock,
  InteractiveContentBlock,
  ToolStreamEntry,
} from "@/components/chat/types";
import type { RunEvent } from "./run-event";

export type RunStatus = "running" | "finished" | "error" | "aborted";

export type RunState = {
  sessionKey: string;
  runId: string | undefined;
  status: RunStatus;
  /** Full cumulative text from the latest text.delta (not a per-chunk diff). */
  liveText: string;
  /** Text/interactive blocks frozen before each tool call, in order. */
  committedBlocks: ContentBlock[];
  toolById: Map<string, ToolStreamEntry>;
  toolOrder: string[];
  interactiveById: Map<string, InteractiveContentBlock>;
  interactiveOrder: string[];
  /**
   * Out-of-order buffer: tool.result / tool.error events that arrived before
   * their corresponding tool.start. Applied immediately when tool.start arrives.
   */
  pendingResults: Map<string, { isError: boolean; output?: unknown; error?: string }>;
  /** Full event log — used for refresh-restore replay. */
  eventLog: RunEvent[];
  /** Set by run.finished */
  finalText: string | undefined;
  /** Set by run.error */
  errorMessage: string | undefined;
};

export function emptyRunState(sessionKey: string, runId?: string): RunState {
  return {
    sessionKey,
    runId,
    status: "running",
    liveText: "",
    committedBlocks: [],
    toolById: new Map(),
    toolOrder: [],
    interactiveById: new Map(),
    interactiveOrder: [],
    pendingResults: new Map(),
    eventLog: [],
    finalText: undefined,
    errorMessage: undefined,
  };
}

export function isTerminal(s: RunState): boolean {
  return s.status !== "running";
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Compute the plain-text prefix already captured in committedBlocks so we can
 * slice it off the cumulative liveText when rendering the tail.
 */
function committedTextPrefix(blocks: ContentBlock[]): string {
  return blocks
    .filter((b): b is { type: "text"; text: string } => b.type === "text")
    .map((b) => b.text)
    .join(""); // no separator — gateway sends one continuous cumulative string
}

/**
 * Freeze the live text tail (everything after the committed prefix) into a
 * new text ContentBlock. Called automatically before tool / interactive events.
 */
function autoCommit(s: RunState): RunState {
  if (!s.liveText) return s;
  const prefix = committedTextPrefix(s.committedBlocks);
  const tail = s.liveText.startsWith(prefix) ? s.liveText.slice(prefix.length) : s.liveText;
  if (!tail.trim()) return { ...s, liveText: "" };
  return {
    ...s,
    committedBlocks: [...s.committedBlocks, { type: "text", text: tail }],
    liveText: "",
  };
}

// ---------------------------------------------------------------------------
// Pure reducer
// ---------------------------------------------------------------------------

export function applyRunEvent(s: RunState, event: RunEvent): RunState {
  const next: RunState = { ...s, eventLog: [...s.eventLog, event] };

  switch (event.type) {
    case "run.started":
      // Update runId if provided (may arrive after the state was optimistically created).
      return { ...next, runId: event.runId ?? s.runId };

    case "text.delta":
      return { ...next, liveText: event.text };

    case "tool.start": {
      const c = autoCommit(next);
      const entry: ToolStreamEntry = {
        id: event.id,
        toolName: event.name,
        phase: "start",
        input: event.args,
      };
      const byId = new Map(c.toolById).set(event.id, entry);
      const order = c.toolOrder.includes(event.id)
        ? c.toolOrder
        : [...c.toolOrder, event.id];

      // Apply buffered result / error that arrived before this start event.
      const buffered = c.pendingResults.get(event.id);
      if (buffered) {
        const pending = new Map(c.pendingResults);
        pending.delete(event.id);
        byId.set(event.id, {
          ...entry,
          phase: buffered.isError ? "error" : "result",
          output: buffered.output,
          error: buffered.error,
        });
        return { ...c, toolById: byId, toolOrder: order, pendingResults: pending };
      }
      return { ...c, toolById: byId, toolOrder: order };
    }

    case "tool.update": {
      const existing = s.toolById.get(event.id);
      if (!existing) return next; // start not yet seen — update will be applied when start arrives
      const byId = new Map(s.toolById).set(event.id, {
        ...existing,
        phase: "running",
        output: event.partialOutput ?? existing.output,
      });
      return { ...next, toolById: byId };
    }

    case "tool.result": {
      const existing = s.toolById.get(event.id);
      if (!existing) {
        // start not yet seen — buffer result
        const pending = new Map(s.pendingResults).set(event.id, {
          isError: false,
          output: event.output,
        });
        return { ...next, pendingResults: pending };
      }
      const byId = new Map(s.toolById).set(event.id, {
        ...existing,
        phase: "result",
        output: event.output,
      });
      return { ...next, toolById: byId };
    }

    case "tool.error": {
      const existing = s.toolById.get(event.id);
      if (!existing) {
        // start not yet seen — buffer error
        const pending = new Map(s.pendingResults).set(event.id, {
          isError: true,
          error: event.error,
        });
        return { ...next, pendingResults: pending };
      }
      const byId = new Map(s.toolById).set(event.id, {
        ...existing,
        phase: "error",
        error: event.error,
      });
      return { ...next, toolById: byId };
    }

    case "interactive.start": {
      const c = autoCommit(next);
      const bid = event.block.interactiveId;
      const byId = new Map(c.interactiveById).set(bid, event.block);
      const order = c.interactiveOrder.includes(bid)
        ? c.interactiveOrder
        : [...c.interactiveOrder, bid];
      return { ...c, interactiveById: byId, interactiveOrder: order };
    }

    case "run.finished":
      return { ...next, status: "finished", finalText: event.text };

    case "run.error":
      return { ...next, status: "error", errorMessage: event.message };

    case "run.aborted":
      return { ...next, status: "aborted" };

    default:
      return next;
  }
}

/**
 * Rebuild a RunState by replaying a persisted event log (refresh-restore path).
 * Returns null if the log is empty or doesn't start with run.started.
 */
export function replayRunState(events: RunEvent[]): RunState | null {
  const first = events[0];
  if (!first || first.type !== "run.started") return null;
  let s = emptyRunState(first.sessionKey, first.runId);
  for (const e of events.slice(1)) {
    s = applyRunEvent(s, e);
  }
  return s;
}

/** Exported for view layer use (run-message.ts). */
export { committedTextPrefix };
