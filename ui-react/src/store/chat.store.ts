import { create } from "zustand";
import type { SerializableQuestionFlow } from "@/components/tool-ui/question-flow";
import type { SerializableOptionList } from "@/components/tool-ui/option-list";

// ---------------------------------------------------------------------------
// History reload via Zustand state — set a pending key to trigger reload.
// useSessionManager watches pendingHistoryReloadKey and calls loadHistory.
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
export function toolStreamEntryToResultText(entry: ToolStreamEntry): string | undefined {
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
  if (entry.phase === "error" && typeof entry.error === "string" && entry.error.trim()) {
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
    };

export type InteractiveContentBlock = Extract<ContentBlock, { type: "interactive" }>;

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

  // Interactive input streaming
  interactiveStreamById: Map<string, InteractiveContentBlock>;
  interactiveStreamOrder: string[];
  interactiveSummaryById: Record<string, InteractiveSummaryPair[]>;

  // Input state
  sending: boolean;

  // Active session key
  sessionKey: string | null;

  // Pending history reload: set to a session key to request a silent reload.
  // useSessionManager watches this and calls loadHistory when non-null.
  pendingHistoryReloadKey: string | null;

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
  finalizeStream: () => void;
  upsertToolStream: (entry: ToolStreamEntry) => void;
  resetToolStream: () => void;
  upsertInteractiveStream: (entry: InteractiveContentBlock) => void;
  resetInteractiveStream: () => void;
  setInteractiveSummary: (interactiveId: string, pairs: InteractiveSummaryPair[]) => void;
  clearInteractiveSummary: (interactiveId: string) => void;
  setPendingHistoryReloadKey: (key: string | null) => void;
  setLastError: (msg: string | null) => void;
  truncateMessagesAfter: (parentId: string | null) => void;
  markSessionGenerating: (sessionKey: string, runId?: string | null) => void;
  clearSessionGenerating: (sessionKey: string) => void;
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
  sending: false,
  sessionKey: null,
  pendingHistoryReloadKey: null,
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

  finalizeStream: () => {
    const {
      stream,
      runId,
      committedBlocks,
      toolStreamById,
      toolStreamOrder,
      interactiveStreamById,
      interactiveStreamOrder,
    } = get();

    // Build ordered content blocks: committed text segments + current stream text + interactive inputs + tool calls
    const contentBlocks: ContentBlock[] = [...committedBlocks];

    if (stream && stream.trim()) {
      contentBlocks.push({ type: "text", text: stream });
    }

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
        argsText: entry.input != null ? JSON.stringify(entry.input, null, 2) : undefined,
        result: toolStreamEntryToResultText(entry),
        phase: entry.phase === "result" ? "result" : entry.phase === "error" ? "error" : "call",
      });
    }

    // Only persist if there is something to save
    if (contentBlocks.length === 0 && !stream) {
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
      runId: runId ?? undefined,
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

  resetToolStream: () => set({ toolStreamById: new Map(), toolStreamOrder: [] }),

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
      const { [interactiveId]: _removed, ...rest } = state.interactiveSummaryById;
      return { interactiveSummaryById: rest };
    }),

  setPendingHistoryReloadKey: (key) => set({ pendingHistoryReloadKey: key }),

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
