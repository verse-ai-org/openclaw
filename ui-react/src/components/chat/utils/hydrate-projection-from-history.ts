import type {
  ChatMessage,
  ContentBlock,
  InteractiveContentBlock,
  ToolStreamEntry,
} from "@/components/chat/types";

/**
 * Merges persisted tool-call stream state from chat history with the in-memory
 * run-projection maps for the same active run.
 *
 * After a page refresh, `chat.history` may already contain partial assistant
 * content for the ongoing `runId`, while WebSocket events repopulate
 * `run-projection`. We need one combined view: history provides ordering and
 * baseline entries; live projection wins for any `toolCallId` that appears in
 * both (fresher phase, args, or results).
 */
export function mergeHydratedToolStreams(params: {
  hydratedById: Map<string, ToolStreamEntry>;
  hydratedOrder: string[];
  liveById: Map<string, ToolStreamEntry>;
  liveOrder: string[];
}): { byId: Map<string, ToolStreamEntry>; order: string[] } {
  const byId = new Map(params.hydratedById);
  for (const [id, entry] of params.liveById) {
    byId.set(id, entry);
  }
  const order = [...params.hydratedOrder];
  for (const id of params.liveOrder) {
    if (!order.includes(id)) {
      order.push(id);
    }
  }
  return { byId, order };
}

/**
 * Same merge strategy as {@link mergeHydratedToolStreams}, for interactive
 * content blocks persisted on the historical assistant message vs. blocks
 * arriving on the live stream.
 */
export function mergeHydratedInteractiveStreams(params: {
  hydratedById: Map<string, InteractiveContentBlock>;
  hydratedOrder: string[];
  liveById: Map<string, InteractiveContentBlock>;
  liveOrder: string[];
}): { byId: Map<string, InteractiveContentBlock>; order: string[] } {
  const byId = new Map(params.hydratedById);
  for (const [id, entry] of params.liveById) {
    byId.set(id, entry);
  }
  const order = [...params.hydratedOrder];
  for (const id of params.liveOrder) {
    if (!order.includes(id)) {
      order.push(id);
    }
  }
  return { byId, order };
}

export type HydrateProjectionFromHistoryResult = {
  /** Chat transcript with the matching historical assistant turn removed (see below). */
  baseChatMessages: ChatMessage[];
  /** Text blocks already committed in history; prepended before projection `committedBlocks`. */
  committedBlocks: ContentBlock[];
  toolStreamById: Map<string, ToolStreamEntry>;
  toolStreamOrder: string[];
  interactiveStreamById: Map<string, InteractiveContentBlock>;
  interactiveStreamOrder: string[];
};

/**
 * When a run is still active after reload, `chat.history` often includes an
 * assistant message tagged with the same `runId` as the in-flight turn. The
 * thread renderer also builds a synthetic `__stream__` row from run-projection.
 * Without deduplication, users see two copies of the same tools and text.
 *
 * This helper finds the **last** historical assistant message whose `runId`
 * matches `effectiveRunId`, converts its `contentBlocks` (or legacy `content`)
 * into the same shapes used by run-projection (`committedBlocks`, tool maps,
 * interactive maps), and returns a message list with that row **removed**. The
 * caller merges these structures with live projection and passes the result to
 * `selectThreadMessages`, so a single combined stream row is shown.
 *
 * Pass an optional `runIdIndex` (Map of runId → last message index) to avoid
 * O(n) linear scan on every render during streaming. Build it once inside the
 * caller's `useMemo` and reuse across calls.
 *
 * @returns `null` if no matching historical assistant message exists.
 */
export function hydrateProjectionFromHistoryRun(args: {
  chatMessages: ChatMessage[];
  effectiveRunId: string;
  /** Pre-built index from runId to the last assistant message index with that runId. */
  runIdIndex?: Map<string, number>;
}): HydrateProjectionFromHistoryResult | null {
  const { chatMessages, effectiveRunId, runIdIndex } = args;
  const idx = runIdIndex
    ? (runIdIndex.get(effectiveRunId) ?? -1)
    : chatMessages.findLastIndex(
        (m) => m.role === "assistant" && typeof m.runId === "string" && m.runId === effectiveRunId,
      );
  if (idx < 0) {
    return null;
  }

  const msg = chatMessages[idx];
  const committedBlocks: ContentBlock[] = [];
  const toolStreamById = new Map<string, ToolStreamEntry>();
  const toolStreamOrder: string[] = [];
  const interactiveStreamById = new Map<string, InteractiveContentBlock>();
  const interactiveStreamOrder: string[] = [];

  const blocks = msg.contentBlocks ?? [];
  if (blocks.length > 0) {
    for (const block of blocks) {
      if (block.type === "text") {
        committedBlocks.push(block);
        continue;
      }
      if (block.type === "tool-call") {
        let input: unknown = undefined;
        if (block.argsText) {
          try {
            input = JSON.parse(block.argsText) as unknown;
          } catch {
            input = block.argsText;
          }
        }
        const phase: ToolStreamEntry["phase"] =
          block.phase === "result" ? "result" : block.phase === "error" ? "error" : "start";
        const entry: ToolStreamEntry = {
          id: block.toolCallId,
          toolName: block.toolName,
          phase,
          input,
          output: block.result,
          error: block.phase === "error" ? block.result : undefined,
        };
        toolStreamById.set(entry.id, entry);
        toolStreamOrder.push(entry.id);
        continue;
      }
      if (block.type === "interactive") {
        interactiveStreamById.set(block.interactiveId, block);
        interactiveStreamOrder.push(block.interactiveId);
      }
    }
  } else if (msg.content.trim()) {
    committedBlocks.push({ type: "text", text: msg.content });
  }

  const baseChatMessages = [...chatMessages.slice(0, idx), ...chatMessages.slice(idx + 1)];
  return {
    baseChatMessages,
    committedBlocks,
    toolStreamById,
    toolStreamOrder,
    interactiveStreamById,
    interactiveStreamOrder,
  };
}
