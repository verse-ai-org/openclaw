import type {
  ContentBlock,
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
  /**
   * Ordered timeline of committed content parts for this run.
   * This is the canonical render model; tool and interactive items appear in-line
   * at the moment they are observed.
   */
  parts: ContentBlock[];
  /** toolCallId -> index into parts (for in-place updates). */
  toolPartIndex: Map<string, number>;
  /**
   * Lightweight tool entry state for formatting output.
   * Keeping this avoids parsing contentBlocks to derive state.
   */
  toolById: Map<string, ToolStreamEntry>;
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
    parts: [],
    toolPartIndex: new Map(),
    toolById: new Map(),
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
function committedTextPrefix(parts: ContentBlock[]): string {
  return parts
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
  const prefix = committedTextPrefix(s.parts);
  const tail = s.liveText.startsWith(prefix) ? s.liveText.slice(prefix.length) : s.liveText;
  if (!tail.trim()) return { ...s, liveText: "" };
  return {
    ...s,
    parts: [...s.parts, { type: "text", text: tail }],
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
      const toolById = new Map(c.toolById).set(event.id, entry);

      // Insert a tool part into the linear timeline.
      const parts = c.parts.slice();
      const toolIndex = parts.length;
      parts.push({
        type: "tool-call",
        toolCallId: event.id,
        toolName: event.name ?? "tool",
        argsText: event.args != null ? JSON.stringify(event.args, null, 2) : undefined,
        result: undefined,
        phase: "call",
      });
      const toolPartIndex = new Map(c.toolPartIndex).set(event.id, toolIndex);

      // Apply buffered result / error that arrived before this start event.
      const buffered = c.pendingResults.get(event.id);
      if (buffered) {
        const pending = new Map(c.pendingResults);
        pending.delete(event.id);
        toolById.set(event.id, {
          ...entry,
          phase: buffered.isError ? "error" : "result",
          output: buffered.output,
          error: buffered.error,
        });

        // Update the tool part immediately.
        const updatedParts = parts.slice();
        const idx = toolIndex;
        const cur = updatedParts[idx];
        if (cur && cur.type === "tool-call") {
          updatedParts[idx] = {
            ...cur,
            phase: buffered.isError ? "error" : "result",
            result: buffered.isError ? buffered.error : (buffered.output as unknown as string),
          };
        }

        return {
          ...c,
          parts: updatedParts,
          toolPartIndex,
          toolById,
          pendingResults: pending,
        };
      }
      return { ...c, parts, toolPartIndex, toolById };
    }

    case "tool.update": {
      const existing = s.toolById.get(event.id);
      if (!existing) return next; // start not yet seen
      const toolById = new Map(s.toolById).set(event.id, {
        ...existing,
        phase: "running",
        output: event.partialOutput ?? existing.output,
      });

      const idx = s.toolPartIndex.get(event.id);
      if (idx === undefined) return { ...next, toolById };
      const part = s.parts[idx];
      if (!part || part.type !== "tool-call") return { ...next, toolById };
      const parts = s.parts.slice();
      parts[idx] = {
        ...part,
        phase: "call",
      };
      return { ...next, parts, toolById };
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
      const toolById = new Map(s.toolById).set(event.id, {
        ...existing,
        phase: "result",
        output: event.output,
      });
      const idx = s.toolPartIndex.get(event.id);
      if (idx === undefined) return { ...next, toolById };
      const part = s.parts[idx];
      if (!part || part.type !== "tool-call") return { ...next, toolById };
      const parts = s.parts.slice();
      parts[idx] = {
        ...part,
        phase: "result",
      };
      return { ...next, parts, toolById };
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
      const toolById = new Map(s.toolById).set(event.id, {
        ...existing,
        phase: "error",
        error: event.error,
      });
      const idx = s.toolPartIndex.get(event.id);
      if (idx === undefined) return { ...next, toolById };
      const part = s.parts[idx];
      if (!part || part.type !== "tool-call") return { ...next, toolById };
      const parts = s.parts.slice();
      parts[idx] = {
        ...part,
        phase: "error",
      };
      return { ...next, parts, toolById };
    }

    case "run.finished": {
      const flushed = autoCommit(next);
      return { ...flushed, status: "finished", finalText: event.text };
    }

    case "run.error": {
      const flushed = autoCommit(next);
      return { ...flushed, status: "error", errorMessage: event.message };
    }

    case "run.aborted": {
      const flushed = autoCommit(next);
      return { ...flushed, status: "aborted" };
    }

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
