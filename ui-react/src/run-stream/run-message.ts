import type { ChatMessage, ContentBlock } from "@/components/chat/types";
import { formatToolStreamOutput } from "@/components/chat/utils/tool-stream-format";
import { committedTextPrefix, type RunState } from "./run-state";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** The portion of liveText that comes after the committed prefix. */
function liveTextTail(s: RunState): string {
  const prefix = committedTextPrefix(s.committedBlocks);
  return s.liveText.startsWith(prefix) ? s.liveText.slice(prefix.length) : s.liveText;
}

/**
 * Build the ordered ContentBlock array that represents the current run state.
 *
 * @param includeTail   When true, appends the live text tail (used for the
 *                      __stream__ row while the run is in progress).
 * @param extraText     Appended as a final text block (used for run.finished
 *                      when gateway delivers the full text at the end).
 */
function buildBlocks(
  s: RunState,
  includeTail: boolean,
  extraText?: string,
): ContentBlock[] {
  const blocks: ContentBlock[] = [...s.committedBlocks];

  for (const id of s.interactiveOrder) {
    const e = s.interactiveById.get(id);
    if (e) blocks.push(e);
  }

  for (const id of s.toolOrder) {
    const e = s.toolById.get(id);
    if (!e) continue;
    blocks.push({
      type: "tool-call",
      toolCallId: e.id,
      toolName: e.toolName ?? "tool",
      argsText: e.input != null ? JSON.stringify(e.input, null, 2) : undefined,
      result: formatToolStreamOutput(e.output, e.error, e.phase),
      phase: e.phase === "result" ? "result" : e.phase === "error" ? "error" : "call",
    });
  }

  if (includeTail) {
    const tail = liveTextTail(s);
    if (tail.trim()) blocks.push({ type: "text", text: tail });
    // Always include at least one block while running so assistant-ui renders a row.
    if (blocks.length === 0) blocks.push({ type: "text", text: "" });
  }

  if (extraText?.trim()) {
    blocks.push({ type: "text", text: extraText });
  }

  return blocks;
}

// ---------------------------------------------------------------------------
// Public view functions
// ---------------------------------------------------------------------------

/**
 * Build the synthetic live assistant message rendered while a run is in progress.
 * Uses the stable id "__stream__" so assistant-ui treats it as a single updating row.
 */
export function toLiveMessage(s: RunState): ChatMessage {
  return {
    id: "__stream__",
    role: "assistant",
    content: s.liveText,
    ts: Date.now(),
    runId: s.runId,
    contentBlocks: buildBlocks(s, true),
  };
}

/**
 * Build the final ChatMessage to persist in chat history after a run completes.
 * Returns null when there is nothing to persist (e.g. run was aborted with no output).
 */
export function toFinalMessage(s: RunState): ChatMessage | null {
  const stitchedPlain = committedTextPrefix(s.committedBlocks).trim();
  const finalPlain = s.finalText?.trim() ?? "";
  const liveRemainder = s.liveText.trim();

  const hasContent =
    !!finalPlain ||
    !!stitchedPlain ||
    !!liveRemainder ||
    s.toolOrder.length > 0 ||
    s.interactiveOrder.length > 0;

  if (!hasContent) return null;

  // Avoid duplicating the assistant body when chat.final repeats the streamed text already in committed blocks.
  let extraText: string | undefined = finalPlain || undefined;
  if (extraText && extraText === stitchedPlain) {
    extraText = undefined;
  }

  const blocks = buildBlocks(s, false, extraText);

  const contentField = finalPlain || stitchedPlain || liveRemainder;

  return {
    id: crypto.randomUUID(),
    role: "assistant",
    content: contentField,
    ts: Date.now(),
    runId: s.runId,
    contentBlocks: blocks.length > 0 ? blocks : undefined,
  };
}
