import type { InteractionStatus } from "@openclaw/interactions";
import { create } from "zustand";
import type { SerializableQuestionFlow } from "@/components/tool-ui/question-flow";
import type { SerializableOptionList } from "@/components/tool-ui/option-list";
import { logChatDebug } from "@/lib/chat-debug";

// ---------------------------------------------------------------------------
// History reload via Zustand state — set a pending key to trigger reload.
// session-manager watches pendingHistoryReloadKey and calls loadHistory.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Chat message types
// ---------------------------------------------------------------------------
export type ChatMessageRole = "user" | "assistant";

/** A tool call extracted from a message content block (assistant role). */
export interface ToolCallPart {
  toolCallId: string;
  toolName: string;
  /** Parsed or raw args object */
  argsText?: string;
  /** Result text, set when the corresponding toolResult block exists */
  result?: string;
  /** Error text, set when the tool failed */
  error?: string;
  /** Phase: call = invoked, result = completed, error = failed */
  phase: "call" | "result" | "error";
}

export type ToolStreamPhase = "start" | "running" | "result" | "error";
export type InteractiveKind = "question_flow" | "option_list";

export interface ToolStreamEntry {
  id: string;
  toolName?: string;
  phase: ToolStreamPhase;
  input?: unknown;
  output?: unknown;
  error?: string;
}

/** Text shown on tool-call cards (streaming finalize + live row). */
export function toolStreamEntryToResultText(
  entry: ToolStreamEntry,
): string | undefined {
  if (typeof entry.output === "string") {
    return entry.output;
  }
  if (entry.output != null) {
    try {
      return JSON.stringify(entry.output, null, 2);
    } catch {
      return String(entry.output);
    }
  }
  if (
    entry.phase === "error" &&
    typeof entry.error === "string" &&
    entry.error.trim()
  ) {
    return entry.error;
  }
  return undefined;
}

/**
 * A typed content block within an assistant message.
 * Preserves the original ordering of text and tool-call segments so that the
 * UI can render them interleaved (text → tool → text → tool …) rather than
 * all text first then all tools.
 */
export type ContentBlock =
  | { type: "text"; text: string }
  | {
      type: "tool-call";
      toolCallId: string;
      toolName: string;
      argsText?: string;
      result?: string;
      phase: "call" | "result" | "error";
    }
  | {
      type: "interactive";
      interactiveId: string;
      kind: InteractiveKind;
      payload: SerializableQuestionFlow | SerializableOptionList;
    }
  | {
      /** New first-class interaction content part; renderer is resolved
       *  via the interactions slice + `@openclaw/interactions` registry. */
      type: "interaction";
      interactionId: string;
    };

/**
 * Live state for a single `<ask>`-driven interaction. Keyed by interactionId.
 *
 * `component`, `payload`, `schemaVersion` come from the `interaction request`
 * agent event. Once the user (or channel) answers — reported via the
 * matching `interaction response` event or the `chat.interactionRespond`
 * RPC — `status` + `response` are filled in.
 */
export interface InteractionState {
  interactionId: string;
  component: string;
  payload: unknown;
  schemaVersion: number;
  cancellable?: boolean;
  status: InteractionStatus | "pending";
  response?: unknown;
  responseBy?: { userId?: string; channel?: string };
  /** Message id the interaction first attached to (for ordering). */
  messageId?: string;
  createdAt: number;
  updatedAt: number;
}

export type InteractiveContentBlock = Extract<
  ContentBlock,
  { type: "interactive" }
>;

export interface InteractiveSummaryPair {
  question: string;
  answer: string;
}

/** A sent file attachment stored with the message for display. */
export interface MessageAttachment {
  /** Original file name */
  fileName: string;
  /** MIME type */
  mimeType: string;
  /** File size in bytes */
  size: number;
}

export interface ChatMessage {
  id: string;
  role: ChatMessageRole;
  content: string;
  ts: number;
  runId?: string;
  sessionKey?: string;
  /** File attachments sent with this user message (for display only) */
  attachments?: MessageAttachment[];
  /** Tool calls embedded in this message (assistant messages with tool use) */
  toolCalls?: ToolCallPart[];
  /**
   * Ordered content blocks (text + tool-call) preserving the original
   * interleaved structure from the Gateway. When present, used by
   * GatewayChatRuntimeProvider instead of the flat content+toolCalls pair.
   */
  contentBlocks?: ContentBlock[];
}

interface ChatState {
  // History (loaded from gateway)
  messages: ChatMessage[];
  messagesLoading: boolean;

  // Live streaming
  stream: string | null;
  runId: string | null;

  /**
   * Frozen content blocks accumulated before the current stream cursor.
   * When a tool call starts mid-stream, the current text is committed here
   * so it stays visible while the tool call card renders below it.
   * Cleared on resetStream / finalizeStream.
   */
  committedBlocks: ContentBlock[];

  // Tool call streaming
  toolStreamById: Map<string, ToolStreamEntry>;
  toolStreamOrder: string[];

  // Interactive input streaming (legacy; slated for removal in Phase E)
  interactiveStreamById: Map<string, InteractiveContentBlock>;
  interactiveStreamOrder: string[];
  interactiveSummaryById: Record<string, InteractiveSummaryPair[]>;

  // New first-class interaction protocol state, keyed by interactionId.
  interactions: Record<string, InteractionState>;

  // Input state
  sending: boolean;

  // Active session key
  sessionKey: string | null;

  // Pending history reload: set to a session key to request a silent reload.
  // session-manager watches this and calls loadHistory when non-null.
  pendingHistoryReloadKey: string | null;

  // Monotonic counter bumped after each completed generation to signal
  // session-manager to re-fetch the session list (so derivedTitle updates).
  pendingSessionsReloadSeq: number;

  // Last error message (shown inline in the thread)
  lastError: string | null;

  /**
   * Pre-filled draft message for the composer — consumed once on mount and cleared.
   * Used by "Create With Chat" on the Scheduled Tasks page to seed the input.
   */
  pendingDraftMessage: string | null;

  /**
   * Sessions with an in-flight gateway generation (user switched away, or multi-tab).
   * Updated from `chat` / `agent` events even when that session is not the active UI tab.
   * Cleared on terminal `chat` (final/error/aborted) for that sessionKey.
   */
  pendingGenerationBySession: Record<string, { runId?: string | null }>;

  // Actions
  setSending: (v: boolean) => void;
  setMessages: (msgs: ChatMessage[]) => void;
  setMessagesLoading: (v: boolean) => void;
  clearMessages: () => void;
  setSessionKey: (key: string | null) => void;
  setPendingDraftMessage: (msg: string | null) => void;
  appendStreamChunk: (text: string) => void;
  setStream: (text: string) => void;
  setRunId: (id: string | null) => void;
  resetStream: () => void;
  commitCurrentText: () => void;
  /**
   * @param eventRunId Gateway run id from the closing `chat.final` / lifecycle
   *   event. Passed through because `finalizeChatRun` clears
   *   `pendingGenerationBySession` before persisting, so the store cannot infer
   *   the run id from pending state alone.
   */
  finalizeStream: (eventRunId?: string) => void;
  commitStreamAsMessage: (msg: ChatMessage) => void;
  upsertToolStream: (entry: ToolStreamEntry) => void;
  resetToolStream: () => void;
  upsertInteractiveStream: (entry: InteractiveContentBlock) => void;
  resetInteractiveStream: () => void;
  setInteractiveSummary: (
    interactiveId: string,
    pairs: InteractiveSummaryPair[],
  ) => void;
  clearInteractiveSummary: (interactiveId: string) => void;
  // Interaction slice actions (new first-class protocol).
  upsertInteraction: (
    entry: Omit<InteractionState, "createdAt" | "updatedAt" | "status"> & {
      status?: InteractionStatus | "pending";
    },
  ) => void;
  setInteractionResponse: (
    interactionId: string,
    update: {
      status: InteractionStatus;
      response?: unknown;
      responseBy?: { userId?: string; channel?: string };
    },
  ) => void;
  cancelInteraction: (interactionId: string, reason?: "cancelled" | "timed_out") => void;
  resetInteractions: () => void;
  setPendingHistoryReloadKey: (key: string | null) => void;
  triggerSessionsReload: () => void;
  setLastError: (msg: string | null) => void;
  truncateMessagesAfter: (parentId: string | null) => void;
  markSessionGenerating: (sessionKey: string, runId?: string | null) => void;
  clearSessionGenerating: (sessionKey: string) => void;
}

/**
 * Run id used when persisting a streaming turn. The event bridge stores the
 * active gateway run in `pendingGenerationBySession` (via `markSessionGenerating`);
 * the top-level `runId` field is rarely set, so `finalizeStream` must fall back
 * or assistant rows split across two ChatMessages (tools without runId, then
 * `<ask>` with runId) — `mergeAssistantRunMessages` stops collapsing them and
 * assistant-ui can throw `tapClientLookup` when the thread shape churns.
 */
export function resolvePersistRunId(state: {
  runId: string | null;
  sessionKey: string | null | undefined;
  pendingGenerationBySession: Record<string, { runId?: string | null }>;
}): string | undefined {
  if (typeof state.runId === "string" && state.runId.trim()) {
    return state.runId.trim();
  }
  const sk =
    typeof state.sessionKey === "string" && state.sessionKey.trim()
      ? state.sessionKey.trim()
      : "";
  if (!sk) {
    return undefined;
  }
  const pending = state.pendingGenerationBySession[sk]?.runId;
  if (typeof pending === "string" && pending.trim()) {
    return pending.trim();
  }
  return undefined;
}

export const useChatStore = create<ChatState>()((set, get) => ({
  messages: [],
  messagesLoading: false,
  stream: null,
  runId: null,
  committedBlocks: [],
  toolStreamById: new Map(),
  toolStreamOrder: [],
  interactiveStreamById: new Map(),
  interactiveStreamOrder: [],
  interactiveSummaryById: {},
  interactions: {},
  sending: false,
  sessionKey: null,
  pendingHistoryReloadKey: null,
  pendingSessionsReloadSeq: 0,
  lastError: null,
  pendingDraftMessage: null,
  pendingGenerationBySession: {},

  setSending: (v) => set({ sending: v }),

  setMessages: (msgs) => set({ messages: msgs }),
  setMessagesLoading: (v) => set({ messagesLoading: v }),
  clearMessages: () =>
    set({
      messages: [],
      stream: null,
      runId: null,
      committedBlocks: [],
      toolStreamById: new Map(),
      toolStreamOrder: [],
      interactiveStreamById: new Map(),
      interactiveStreamOrder: [],
      interactiveSummaryById: {},
    }),
  setSessionKey: (key) => set({ sessionKey: key }),
  setPendingDraftMessage: (msg) => set({ pendingDraftMessage: msg }),

  appendStreamChunk: (text) => {
    set((state) => ({
      stream: (state.stream ?? "") + text,
    }));
  },

  // Replace the entire stream buffer with a new cumulative value
  setStream: (text) => {
    set({ stream: text });
  },

  setRunId: (id) => set({ runId: id }),

  commitCurrentText: () => {
    const { stream, committedBlocks } = get();
    if (stream && stream.trim().length > 0) {
      set({
        committedBlocks: [...committedBlocks, { type: "text", text: stream }],
        stream: "",
      });
    }
  },

  finalizeStream: (eventRunId?: string) => {
    const state = get();
    const {
      stream,
      committedBlocks,
      toolStreamById,
      toolStreamOrder,
      interactiveStreamById,
      interactiveStreamOrder,
      sessionKey,
    } = state;
    const fromEvent =
      typeof eventRunId === "string" && eventRunId.trim()
        ? eventRunId.trim()
        : undefined;
    const persistRunId = fromEvent ?? resolvePersistRunId(state);

    logChatDebug(
      "debug",
      "finalizeStream: merging stream buffers into assistant message",
      {
        runId: persistRunId,
        storeRunId: state.runId,
        committedTextChunks: committedBlocks.length,
        toolCalls: toolStreamOrder.length,
        legacyInteractive: interactiveStreamOrder.length,
        streamLen: stream?.length ?? 0,
      },
      {
        channel: "chat.store",
        sessionKey: sessionKey ?? undefined,
        runId: persistRunId,
      },
    );

    // Build ordered content blocks: committed text segments + interactive inputs + tool calls + trailing stream text
    // Order matches the `chat final` path in useChatEventBridge for consistent rendering.
    const contentBlocks: ContentBlock[] = [...committedBlocks];

    for (const id of interactiveStreamOrder) {
      const entry = interactiveStreamById.get(id);
      if (!entry) {
        continue;
      }
      contentBlocks.push(entry);
    }

    for (const id of toolStreamOrder) {
      const entry = toolStreamById.get(id);
      if (!entry) {
        continue;
      }
      contentBlocks.push({
        type: "tool-call",
        toolCallId: entry.id,
        toolName: entry.toolName ?? "tool",
        argsText:
          entry.input != null
            ? JSON.stringify(entry.input, null, 2)
            : undefined,
        result: toolStreamEntryToResultText(entry),
        phase:
          entry.phase === "result"
            ? "result"
            : entry.phase === "error"
              ? "error"
              : "call",
      });
    }

    // Trailing text goes last, consistent with chat-final merge order.
    if (stream && stream.trim()) {
      contentBlocks.push({ type: "text", text: stream });
    }

    // Only persist if there is something to save
    if (contentBlocks.length === 0 && !stream) {
      logChatDebug(
        "debug",
        "finalizeStream: nothing to persist; clearing buffers",
        { runId: persistRunId },
        {
          channel: "chat.store",
          sessionKey: sessionKey ?? undefined,
          runId: persistRunId,
        },
      );
      set({
        stream: null,
        runId: null,
        committedBlocks: [],
        toolStreamById: new Map(),
        toolStreamOrder: [],
        interactiveStreamById: new Map(),
        interactiveStreamOrder: [],
      });
      return;
    }

    // Derive flat text content for the content field (backward compat)
    const flatText = contentBlocks
      .filter((b): b is { type: "text"; text: string } => b.type === "text")
      .map((b) => b.text)
      .join("\n");

    const msg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: flatText,
      ts: Date.now(),
      runId: persistRunId,
      contentBlocks: contentBlocks.length > 0 ? contentBlocks : undefined,
    };

    set((state) => ({
      messages: [...state.messages, msg],
      stream: null,
      runId: null,
      committedBlocks: [],
      toolStreamById: new Map(),
      toolStreamOrder: [],
      interactiveStreamById: new Map(),
      interactiveStreamOrder: [],
    }));

    logChatDebug(
      "debug",
      "finalizeStream: appended assistant message",
      {
        msgId: msg.id,
        contentBlockKinds: contentBlocks.map((b) => b.type),
      },
      {
        channel: "chat.store",
        sessionKey: sessionKey ?? undefined,
        runId: persistRunId,
      },
    );
  },

  // Clears streaming buffers and in-flight tool stream state (same turn).
  resetStream: () =>
    set({
      stream: null,
      runId: null,
      committedBlocks: [],
      toolStreamById: new Map(),
      toolStreamOrder: [],
      interactiveStreamById: new Map(),
      interactiveStreamOrder: [],
    }),

  commitStreamAsMessage: (msg) =>
    set((state) => {
      const toolBlocks =
        msg.contentBlocks?.filter((b) => b.type === "tool-call").length ?? 0;
      const interactionBlocks =
        msg.contentBlocks?.filter((b) => b.type === "interaction").length ?? 0;
      logChatDebug(
        "debug",
        "commitStreamAsMessage: persist assistant turn (e.g. chat.final with text)",
        {
          msgId: msg.id,
          runId: msg.runId,
          textLen: msg.content?.length ?? 0,
          toolBlocks,
          interactionBlocks,
          blockKinds: msg.contentBlocks?.map((b) => b.type),
        },
        {
          channel: "chat.store",
          sessionKey: state.sessionKey ?? undefined,
          runId: typeof msg.runId === "string" ? msg.runId : undefined,
        },
      );
      // Bind interactions referenced by this message to its id so they no
      // longer show up on the __stream__ placeholder. We bind by content-block
      // reference so a dangling/orphan interaction (e.g. from an aborted prior
      // turn) isn't accidentally attached to the wrong message.
      const interactionIdsInMsg = new Set(
        (msg.contentBlocks ?? [])
          .filter(
            (b): b is Extract<typeof b, { type: "interaction" }> =>
              b.type === "interaction",
          )
          .map((b) => b.interactionId),
      );
      let nextInteractions = state.interactions;
      if (interactionIdsInMsg.size > 0) {
        nextInteractions = { ...state.interactions };
        for (const id of interactionIdsInMsg) {
          const existing = nextInteractions[id];
          if (existing && !existing.messageId) {
            nextInteractions[id] = { ...existing, messageId: msg.id };
          }
        }
      }
      return {
        messages: [...state.messages, msg],
        stream: null,
        runId: null,
        committedBlocks: [],
        toolStreamById: new Map(),
        toolStreamOrder: [],
        interactiveStreamById: new Map(),
        interactiveStreamOrder: [],
        interactions: nextInteractions,
      };
    }),

  upsertToolStream: (entry) => {
    set((state) => {
      const next = new Map(state.toolStreamById);
      next.set(entry.id, entry);
      const order = state.toolStreamOrder.includes(entry.id)
        ? state.toolStreamOrder
        : [...state.toolStreamOrder, entry.id];
      return { toolStreamById: next, toolStreamOrder: order };
    });
  },

  resetToolStream: () =>
    set({ toolStreamById: new Map(), toolStreamOrder: [] }),

  upsertInteractiveStream: (entry) => {
    set((state) => {
      const next = new Map(state.interactiveStreamById);
      next.set(entry.interactiveId, entry);
      const order = state.interactiveStreamOrder.includes(entry.interactiveId)
        ? state.interactiveStreamOrder
        : [...state.interactiveStreamOrder, entry.interactiveId];
      return { interactiveStreamById: next, interactiveStreamOrder: order };
    });
  },

  resetInteractiveStream: () =>
    set({ interactiveStreamById: new Map(), interactiveStreamOrder: [] }),

  setInteractiveSummary: (interactiveId, pairs) =>
    set((state) => ({
      interactiveSummaryById: {
        ...state.interactiveSummaryById,
        [interactiveId]: pairs,
      },
    })),

  clearInteractiveSummary: (interactiveId) =>
    set((state) => {
      if (!(interactiveId in state.interactiveSummaryById)) {
        return {};
      }
      const { [interactiveId]: _removed, ...rest } =
        state.interactiveSummaryById;
      return { interactiveSummaryById: rest };
    }),

  upsertInteraction: (entry) =>
    set((state) => {
      const existing = state.interactions[entry.interactionId];
      const now = Date.now();
      // If the caller didn't supply a messageId and the runtime already
      // committed a message that references this interaction (ask-tag hoisting
      // in buildFinalAssistantMessage / extractContentBlocks), auto-bind so
      // it doesn't linger on the __stream__ placeholder.
      const inferredMessageId =
        entry.messageId ??
        existing?.messageId ??
        state.messages.find((m) =>
          m.contentBlocks?.some(
            (b) =>
              b.type === "interaction" &&
              b.interactionId === entry.interactionId,
          ),
        )?.id;
      const next: InteractionState = {
        interactionId: entry.interactionId,
        component: entry.component,
        payload: entry.payload,
        schemaVersion: entry.schemaVersion,
        cancellable: entry.cancellable,
        messageId: inferredMessageId,
        response: existing?.response,
        responseBy: existing?.responseBy,
        status: entry.status ?? existing?.status ?? "pending",
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      return {
        interactions: { ...state.interactions, [entry.interactionId]: next },
      };
    }),

  setInteractionResponse: (interactionId, update) =>
    set((state) => {
      const existing = state.interactions[interactionId];
      if (!existing) {
        return {};
      }
      const next: InteractionState = {
        ...existing,
        status: update.status,
        response: update.response ?? existing.response,
        responseBy: update.responseBy ?? existing.responseBy,
        updatedAt: Date.now(),
      };
      return { interactions: { ...state.interactions, [interactionId]: next } };
    }),

  cancelInteraction: (interactionId, reason = "cancelled") =>
    set((state) => {
      const existing = state.interactions[interactionId];
      if (!existing) return {};
      if (existing.status !== "pending") return {};
      const next: InteractionState = {
        ...existing,
        status: reason,
        updatedAt: Date.now(),
      };
      return { interactions: { ...state.interactions, [interactionId]: next } };
    }),

  resetInteractions: () => set({ interactions: {} }),

  setPendingHistoryReloadKey: (key) =>
    set((state) => {
      if (key) {
        logChatDebug(
          "debug",
          "setPendingHistoryReloadKey: will reload transcript from gateway",
          { key },
          { channel: "chat.store", sessionKey: state.sessionKey ?? undefined },
        );
      }
      return { pendingHistoryReloadKey: key };
    }),
  triggerSessionsReload: () =>
    set((state) => {
      const next = state.pendingSessionsReloadSeq + 1;
      logChatDebug(
        "debug",
        "triggerSessionsReload: session list refetch",
        { pendingSessionsReloadSeq: next },
        { channel: "session.list", sessionKey: state.sessionKey ?? undefined },
      );
      return { pendingSessionsReloadSeq: next };
    }),

  setLastError: (msg) => set({ lastError: msg }),

  truncateMessagesAfter: (parentId) => {
    set((state) => {
      if (parentId === null) {
        return {
          messages: [],
          stream: null,
          committedBlocks: [],
          toolStreamById: new Map(),
          toolStreamOrder: [],
          interactiveStreamById: new Map(),
          interactiveStreamOrder: [],
          interactiveSummaryById: {},
        };
      }
      const idx = state.messages.findIndex((m) => m.id === parentId);
      if (idx === -1) {
        // parentId not found — keep all (safety fallback)
        return {};
      }
      return {
        messages: state.messages.slice(0, idx + 1),
        stream: null,
        committedBlocks: [],
        toolStreamById: new Map(),
        toolStreamOrder: [],
        interactiveStreamById: new Map(),
        interactiveStreamOrder: [],
      };
    });
  },

  markSessionGenerating: (sessionKey, runId) => {
    const k = sessionKey.trim();
    if (!k) {
      return;
    }
    set((state) => {
      const prev = state.pendingGenerationBySession[k];
      const nextRunId =
        typeof runId === "string" && runId.trim() ? runId.trim() : prev?.runId;
      return {
        pendingGenerationBySession: {
          ...state.pendingGenerationBySession,
          [k]: { runId: nextRunId },
        },
      };
    });
  },

  clearSessionGenerating: (sessionKey) => {
    const k = sessionKey.trim();
    if (!k) {
      return;
    }
    set((state) => {
      if (!(k in state.pendingGenerationBySession)) {
        return {};
      }
      const { [k]: _removed, ...rest } = state.pendingGenerationBySession;
      return { pendingGenerationBySession: rest };
    });
  },
}));
