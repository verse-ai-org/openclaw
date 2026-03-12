import { create } from "zustand";

// ---------------------------------------------------------------------------
// History reload callback — injected from SessionSelector / GatewayChatRuntimeProvider
// to avoid circular imports. Called when a chat.final event arrives without
// an inline message, so the UI fetches the latest history from the gateway.
// ---------------------------------------------------------------------------
type HistoryReloadFn = (sessionKey: string) => void;
let _reloadHistory: HistoryReloadFn | null = null;

export function registerHistoryReload(fn: HistoryReloadFn) {
  _reloadHistory = fn;
}
export function unregisterHistoryReload() {
  _reloadHistory = null;
}
export function triggerHistoryReload(sessionKey: string) {
  _reloadHistory?.(sessionKey);
}

// ---------------------------------------------------------------------------
// Chat message types (minimal for Phase 1)
// ---------------------------------------------------------------------------
export type ChatMessageRole = "user" | "assistant" | "tool";

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

export interface ToolStreamEntry {
  id: string;
  toolName?: string;
  phase: ToolStreamPhase;
  input?: unknown;
  output?: unknown;
  error?: string;
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
    };

export interface ChatMessage {
  id: string;
  role: ChatMessageRole;
  content: string;
  ts: number;
  runId?: string;
  sessionKey?: string;
  // Optional tool-call id — set when role=="tool" and this message carries a tool result
  toolCallId?: string;
  /** Tool calls embedded in this message (assistant messages with tool use) */
  toolCalls?: ToolCallPart[];
  /**
   * Ordered content blocks (text + tool-call) preserving the original
   * interleaved structure from the Gateway. When present, used by
   * GatewayChatRuntimeProvider instead of the flat content+toolCalls pair.
   */
  contentBlocks?: ContentBlock[];
}

export interface ChatStreamSegment {
  text: string;
  ts: number;
}

interface ChatState {
  // History (loaded from gateway)
  messages: ChatMessage[];
  messagesLoading: boolean;

  // Live streaming
  stream: string | null;
  streamStartedAt: number | null;
  streamSegments: ChatStreamSegment[];
  runId: string | null;

  // Tool call streaming
  toolStreamById: Map<string, ToolStreamEntry>;
  toolStreamOrder: string[];

  // Input
  message: string;
  sending: boolean;

  // Queue (messages waiting while sending)
  queue: Array<{ id: string; text: string }>;

  // Active session key
  sessionKey: string | null;

  // Actions
  setMessage: (msg: string) => void;
  setSending: (v: boolean) => void;
  setMessages: (msgs: ChatMessage[]) => void;
  setMessagesLoading: (v: boolean) => void;
  clearMessages: () => void;
  setSessionKey: (key: string | null) => void;
  appendStreamChunk: (text: string) => void;
  setStream: (text: string) => void;
  setRunId: (id: string | null) => void;
  finalizeStream: () => void;
  resetStream: () => void;
  upsertToolStream: (entry: ToolStreamEntry) => void;
  resetToolStream: () => void;
  enqueueMessage: (id: string, text: string) => void;
  dequeueMessage: (id: string) => void;
}

export const useChatStore = create<ChatState>()((set, get) => ({
  messages: [],
  messagesLoading: false,
  stream: null,
  streamStartedAt: null,
  streamSegments: [],
  runId: null,
  toolStreamById: new Map(),
  toolStreamOrder: [],
  message: "",
  sending: false,
  queue: [],
  sessionKey: null,

  setMessage: (msg) => set({ message: msg }),
  setSending: (v) => set({ sending: v }),

  setMessages: (msgs) => set({ messages: msgs }),
  setMessagesLoading: (v) => set({ messagesLoading: v }),
  clearMessages: () =>
    set({
      messages: [],
      stream: null,
      streamStartedAt: null,
      streamSegments: [],
      runId: null,
      toolStreamById: new Map(),
      toolStreamOrder: [],
    }),
  setSessionKey: (key) => set({ sessionKey: key }),

  appendStreamChunk: (text) => {
    const now = Date.now();
    set((state) => ({
      stream: (state.stream ?? "") + text,
      streamSegments: [...state.streamSegments, { text, ts: now }],
      streamStartedAt: state.streamStartedAt ?? now,
    }));
  },

  // Replace the entire stream buffer with a new cumulative value
  setStream: (text) => {
    set((state) => ({
      stream: text,
      streamStartedAt: state.streamStartedAt ?? Date.now(),
    }));
  },

  setRunId: (id) => set({ runId: id }),

  finalizeStream: () => {
    const { stream, runId } = get();
    if (stream !== null) {
      const msg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: stream,
        ts: Date.now(),
        runId: runId ?? undefined,
      };
      set((state) => ({
        messages: [...state.messages, msg],
        stream: null,
        streamStartedAt: null,
        streamSegments: [],
        runId: null,
      }));
    }
  },

  resetStream: () =>
    set({
      stream: null,
      streamStartedAt: null,
      streamSegments: [],
      runId: null,
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

  enqueueMessage: (id, text) => set((state) => ({ queue: [...state.queue, { id, text }] })),

  dequeueMessage: (id) => set((state) => ({ queue: state.queue.filter((m) => m.id !== id) })),
}));
