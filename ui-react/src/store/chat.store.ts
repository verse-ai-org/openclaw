import { create } from "zustand";

// ---------------------------------------------------------------------------
// Chat message types (minimal for Phase 1)
// ---------------------------------------------------------------------------
export type ChatMessageRole = "user" | "assistant" | "tool";

export type ToolStreamPhase = "start" | "running" | "result" | "error";

export interface ToolStreamEntry {
  id: string;
  toolName?: string;
  phase: ToolStreamPhase;
  input?: unknown;
  output?: unknown;
  error?: string;
}

export interface ChatMessage {
  id: string;
  role: ChatMessageRole;
  content: string;
  ts: number;
  runId?: string;
  sessionKey?: string;
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

  // Actions
  setMessage: (msg: string) => void;
  setSending: (v: boolean) => void;
  setMessages: (msgs: ChatMessage[]) => void;
  setMessagesLoading: (v: boolean) => void;
  appendStreamChunk: (text: string) => void;
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

  setMessage: (msg) => set({ message: msg }),
  setSending: (v) => set({ sending: v }),

  setMessages: (msgs) => set({ messages: msgs }),
  setMessagesLoading: (v) => set({ messagesLoading: v }),

  appendStreamChunk: (text) => {
    const now = Date.now();
    set((state) => ({
      stream: (state.stream ?? "") + text,
      streamSegments: [...state.streamSegments, { text, ts: now }],
      streamStartedAt: state.streamStartedAt ?? now,
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
