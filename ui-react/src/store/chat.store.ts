import { create } from "zustand";
import { useRunProjectionStore } from "@/run-projection/store";
import { useRunStatusStore } from "@/run-status/store";
import type { SerializableQuestionFlow } from "@/components/tool-ui/question-flow";
import type { SerializableOptionList } from "@/components/tool-ui/option-list";
import type { SerializableApprovalCard } from "@/components/tool-ui/approval-card/schema";

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
export type InteractiveKind = "question_flow" | "option_list" | "approval_card";

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
      payload: SerializableQuestionFlow | SerializableOptionList | SerializableApprovalCard;
    };

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

export interface InteractionMessageMetadata {
  id: string;
  component: string;
  schemaVersion: number;
  status: "submitted";
  payload: unknown;
  submittedAt: number;
}

export interface ChatMessageMetadata {
  interaction?: InteractionMessageMetadata;
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
  /** Optional structured metadata attached to this message. */
  metadata?: ChatMessageMetadata;
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

  /** Gateway run id for the active send (live row metadata). */
  runId: string | null;

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

  // Actions
  setSending: (v: boolean) => void;
  setMessages: (msgs: ChatMessage[]) => void;
  setMessagesLoading: (v: boolean) => void;
  clearMessages: () => void;
  setSessionKey: (key: string | null) => void;
  setPendingDraftMessage: (msg: string | null) => void;
  setRunId: (id: string | null) => void;
  /** Appends a finalized assistant message; caller resets `useRunProjectionStore` when needed. */
  commitStreamAsMessage: (msg: ChatMessage) => void;
  setPendingHistoryReloadKey: (key: string | null) => void;
  triggerSessionsReload: () => void;
  setLastError: (msg: string | null) => void;
  truncateMessagesAfter: (parentId: string | null) => void;
}

export const useChatStore = create<ChatState>()((set) => ({
  messages: [],
  messagesLoading: false,
  runId: null,
  sending: false,
  sessionKey: null,
  pendingHistoryReloadKey: null,
  pendingSessionsReloadSeq: 0,
  lastError: null,
  pendingDraftMessage: null,

  setSending: (v) => set({ sending: v }),

  setMessages: (msgs) => set({ messages: msgs }),
  setMessagesLoading: (v) => set({ messagesLoading: v }),
  clearMessages: () => {
    useRunProjectionStore.getState().reset();
    useRunStatusStore.getState().reset();
    set({
      messages: [],
      runId: null,
    });
  },
  setSessionKey: (key) => set({ sessionKey: key }),
  setPendingDraftMessage: (msg) => set({ pendingDraftMessage: msg }),

  setRunId: (id) => set({ runId: id }),

  commitStreamAsMessage: (msg) =>
    set((state) => ({
      messages: [...state.messages, msg],
    })),

  setPendingHistoryReloadKey: (key) => set({ pendingHistoryReloadKey: key }),
  triggerSessionsReload: () =>
    set((state) => ({
      pendingSessionsReloadSeq: state.pendingSessionsReloadSeq + 1,
    })),

  setLastError: (msg) => set({ lastError: msg }),

  truncateMessagesAfter: (parentId) => {
    useRunProjectionStore.getState().reset();
    useRunStatusStore.getState().reset();
    set((state) => {
      if (parentId === null) {
        return {
          messages: [],
          runId: null,
        };
      }
      const idx = state.messages.findIndex((m) => m.id === parentId);
      if (idx === -1) {
        return {};
      }
      return {
        messages: state.messages.slice(0, idx + 1),
        runId: null,
      };
    });
  },
}));
