import { useEffect } from "react";
import { useChatStore, triggerHistoryReload } from "@/store/chat.store";
import type {
  ToolStreamEntry,
  ChatMessage,
  ChatMessageRole,
  ToolCallPart,
  ContentBlock,
} from "@/store/chat.store";
import { registerChatDispatch, unregisterChatDispatch } from "@/store/gateway.store";

// ---------------------------------------------------------------------------
// useChatEventBridge
//
// Registers a chat event dispatch handler into the gateway store.
// Translates raw gateway events into chat store actions, keeping the two
// stores decoupled (no cross-import in the stores themselves).
// ---------------------------------------------------------------------------

type RawMessage = {
  id?: string;
  role?: string;
  // content can be a plain string or an array of content blocks (e.g. [{type:"text",text:"..."}])
  content?: unknown;
  text?: string;
  ts?: number;
  timestamp?: number;
  runId?: string;
  sessionKey?: string;
};

/** Normalize a raw message content field to a plain string. */
export function normalizeContent(raw: unknown): string {
  if (typeof raw === "string") {
    return raw;
  }
  if (Array.isArray(raw)) {
    // Extract text blocks, join them
    return raw
      .map((block) => {
        if (!block || typeof block !== "object") {
          return "";
        }
        const b = block as Record<string, unknown>;
        if (b.type === "text" && typeof b.text === "string") {
          return b.text;
        }
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

/**
 * Normalize a raw Gateway message role to one of the three roles
 * that assistant-ui supports: "user" | "assistant" | "system".
 *
 * Gateway can return: "user", "assistant", "tool", "toolResult",
 * "tool_result", "toolresult", "function", "node", and others.
 * Any tool-related role is mapped to "assistant" so the message still
 * shows in the thread. Unknown roles also fall back to "assistant".
 */
export function normalizeRole(raw: string | undefined): ChatMessageRole {
  const lower = (raw ?? "").toLowerCase().replace(/_/g, "");
  switch (lower) {
    case "user":
      return "user";
    default:
      // assistant, tool, toolresult, tooluse, function, system, node, unknown -> assistant
      return "assistant";
  }
}

/**
 * Pre-process a raw Gateway history message array:
 * merge standalone toolResult messages into the preceding assistant message's
 * content array, then filter out the toolResult messages.
 *
 * Gateway returns history as separate messages:
 *   [{role:"assistant", content:[{type:"toolCall", id:"x"}]},
 *    {role:"toolResult", content:[{type:"toolResult", toolCallId:"x", text:"..."}]}]
 *
 * After merging the toolResult is appended into the assistant message's content
 * so extractContentBlocks can correlate it.
 */
export function mergeToolResults(rawMessages: unknown[]): unknown[] {
  const out: Record<string, unknown>[] = [];

  for (const raw of rawMessages) {
    const msg = raw as Record<string, unknown>;
    const roleStr = ((msg.role as string) ?? "").toLowerCase().replace(/_/g, "");

    if (roleStr === "toolresult" || roleStr === "tool") {
      // Find the last preceding non-toolResult assistant message and append result blocks.
      // Gateway sends toolResult as a separate message whose content is [{type:"text", text:"..."}].
      // We need to wrap those text blocks as {type:"toolresult", toolCallId, text} so
      // extractContentBlocks can match them to their toolCall block by id.
      for (let i = out.length - 1; i >= 0; i--) {
        const prev = out[i];
        const prevRole = ((prev.role as string) ?? "").toLowerCase().replace(/_/g, "");
        if (prevRole === "toolresult" || prevRole === "tool") {
          continue;
        }
        // Find the first unmatched toolCall in prev.content to get its id
        const prevContent = Array.isArray(prev.content)
          ? (prev.content as Array<Record<string, unknown>>)
          : [];
        // Collect toolCall ids already paired with a toolresult block
        const pairedIds = new Set(
          prevContent
            .filter((b) => (b.type as string) === "toolresult")
            .map((b) => b.toolCallId as string)
            .filter(Boolean),
        );
        const unpaired = prevContent.find(
          (b) =>
            (b.type as string) === "toolCall" && typeof b.id === "string" && !pairedIds.has(b.id),
        );
        const toolCallId = unpaired?.id as string | undefined;

        // Build wrapped toolresult blocks from the incoming text blocks
        const rawContent = Array.isArray(msg.content)
          ? (msg.content as Array<Record<string, unknown>>)
          : [];
        const resultText = rawContent
          .filter((b) => (b.type as string) === "text" && typeof b.text === "string")
          .map((b) => b.text as string)
          .join("");
        const resultBlock: Record<string, unknown> = {
          type: "toolresult",
          text: resultText,
          ...(toolCallId ? { toolCallId } : {}),
        };

        out[i] = { ...prev, content: [...prevContent, resultBlock] };
        break;
      }
      // toolResult message itself is NOT pushed to out (filtered away)
    } else {
      out.push({ ...msg });
    }
  }

  return out;
}

/** Extract plain text from a Gateway message object (content string or content block array). */
function extractMessageText(message: unknown): string {
  if (!message || typeof message !== "object") {
    return "";
  }
  const m = message as Record<string, unknown>;
  // Prefer top-level `text` field (delta messages)
  if (typeof m.text === "string") {
    return m.text;
  }
  // Otherwise extract from content
  return normalizeContent(m.content);
}

/**
 * Extract tool call parts from a raw message's content array.
 * Handles assistant messages that contain toolCall/toolUse blocks,
 * and correlates them with any toolResult blocks in the same message.
 */
export function extractToolCallParts(rawContent: unknown): ToolCallPart[] {
  if (!Array.isArray(rawContent)) {
    return [];
  }

  const blocks = rawContent as Array<Record<string, unknown>>;
  const parts: ToolCallPart[] = [];

  // First pass: collect toolCall / toolUse blocks
  for (const block of blocks) {
    if (!block || typeof block !== "object") {
      continue;
    }
    const kind = (typeof block.type === "string" ? block.type : "").toLowerCase().replace(/_/g, "");
    const isToolCall =
      kind === "toolcall" ||
      kind === "tooluse" ||
      (typeof block.name === "string" && block.arguments != null);
    if (!isToolCall) {
      continue;
    }

    const toolCallId =
      (typeof block.id === "string" ? block.id : undefined) ??
      (typeof block.toolCallId === "string" ? block.toolCallId : undefined) ??
      crypto.randomUUID();
    const toolName = (typeof block.name === "string" ? block.name : undefined) ?? "tool";
    const argsRaw = block.arguments ?? block.args;
    let argsText: string | undefined;
    if (typeof argsRaw === "string") {
      argsText = argsRaw;
    } else if (argsRaw != null) {
      try {
        argsText = JSON.stringify(argsRaw, null, 2);
      } catch {
        argsText = undefined;
      }
    }
    parts.push({ toolCallId, toolName, argsText, phase: "call" });
  }

  // Second pass: find matching toolResult blocks and merge result/error
  for (const block of blocks) {
    if (!block || typeof block !== "object") {
      continue;
    }
    const kind = (typeof block.type === "string" ? block.type : "").toLowerCase().replace(/_/g, "");
    if (kind !== "toolresult") {
      continue;
    }

    const toolCallId =
      (typeof block.toolCallId === "string" ? block.toolCallId : undefined) ??
      (typeof block.id === "string" ? block.id : undefined);
    const resultText =
      typeof block.text === "string"
        ? block.text
        : typeof block.content === "string"
          ? block.content
          : undefined;

    const existing = toolCallId ? parts.find((p) => p.toolCallId === toolCallId) : null;
    if (existing) {
      existing.result = resultText;
      existing.phase = "result";
    } else {
      // Standalone result (no matching call in this message)
      const toolName =
        (typeof block.name === "string" ? block.name : undefined) ??
        (typeof block.toolName === "string" ? block.toolName : undefined) ??
        "tool";
      parts.push({
        toolCallId: toolCallId ?? crypto.randomUUID(),
        toolName,
        result: resultText,
        phase: "result",
      });
    }
  }

  return parts;
}

/**
 * Extract ordered ContentBlocks (text + tool-call) from a raw message content
 * array, preserving the original interleaved order so the UI can render
 * them as: text → tool card → text → tool card …
 *
 * Handles:
 * - plain string content (returns a single text block)
 * - array of blocks with type "text", "tool_call"/"tool_use"/"toolCall"/"toolUse"
 * - merges matching toolResult blocks into the corresponding tool-call block
 */
export function extractContentBlocks(rawContent: unknown): ContentBlock[] | undefined {
  if (!Array.isArray(rawContent)) {
    // Plain string — no interleaving needed; caller can fall back to text-only path
    return undefined;
  }

  const blocks = rawContent as Array<Record<string, unknown>>;

  // Debug: log raw blocks in dev to inspect field names
  if (process.env.NODE_ENV === "development") {
    // eslint-disable-next-line no-console
    console.log("[extractContentBlocks] blocks:", JSON.stringify(blocks.slice(0, 10), null, 2));
  }

  // Build a map of toolCallId -> result/error for the second pass
  const resultMap = new Map<string, { result?: string; phase: "result" | "error" }>();
  for (const block of blocks) {
    if (!block || typeof block !== "object") {
      continue;
    }
    const kind = (typeof block.type === "string" ? block.type : "").toLowerCase().replace(/_/g, "");
    if (kind !== "toolresult") {
      continue;
    }
    const id =
      (typeof block.toolCallId === "string" ? block.toolCallId : undefined) ??
      (typeof block.id === "string" ? block.id : undefined);
    if (!id) {
      continue;
    }
    const resultText =
      typeof block.text === "string"
        ? block.text
        : typeof block.content === "string"
          ? block.content
          : undefined;
    resultMap.set(id, { result: resultText, phase: "result" });
  }

  const out: ContentBlock[] = [];
  for (const block of blocks) {
    if (!block || typeof block !== "object") {
      continue;
    }
    const kind = (typeof block.type === "string" ? block.type : "").toLowerCase().replace(/_/g, "");

    if (kind === "text" && typeof block.text === "string" && block.text.trim()) {
      out.push({ type: "text", text: block.text });
      continue;
    }

    const isToolCall =
      kind === "toolcall" ||
      kind === "tooluse" ||
      (typeof block.name === "string" && block.arguments != null);
    if (!isToolCall) {
      // skip toolResult blocks (already merged above) and unknown block types
      continue;
    }

    const toolCallId =
      (typeof block.id === "string" ? block.id : undefined) ??
      (typeof block.toolCallId === "string" ? block.toolCallId : undefined) ??
      crypto.randomUUID();
    const toolName = (typeof block.name === "string" ? block.name : undefined) ?? "tool";
    const argsRaw = block.arguments ?? block.args;
    let argsText: string | undefined;
    if (typeof argsRaw === "string") {
      argsText = argsRaw;
    } else if (argsRaw != null) {
      try {
        argsText = JSON.stringify(argsRaw, null, 2);
      } catch {
        argsText = undefined;
      }
    }

    const resolved = resultMap.get(toolCallId);
    out.push({
      type: "tool-call",
      toolCallId,
      toolName,
      argsText,
      result: resolved?.result,
      phase: resolved?.phase ?? "call",
    });
  }

  return out.length > 0 ? out : undefined;
}

export function useChatEventBridge() {
  useEffect(() => {
    const dispatch = (event: string, payload: unknown) => {
      const p = payload as Record<string, unknown> | undefined;

      switch (event) {
        // ----------------------------------------------------------------
        // Main chat event: state=delta (streaming) | final | aborted | error
        // This is the primary event the Gateway emits after chat.send.
        // ----------------------------------------------------------------
        case "chat": {
          const chatPayload = p as
            | {
                runId?: string;
                sessionKey?: string;
                state?: string;
                message?: unknown;
                errorMessage?: string;
              }
            | undefined;
          const state = chatPayload?.state;

          if (state === "delta") {
            // Gateway sends cumulative text on each delta (not incremental chunks).
            // We set the stream to the latest full value rather than appending.
            const text = extractMessageText(chatPayload?.message);
            if (text) {
              useChatStore.getState().setStream(text);
            }
          } else if (state === "final") {
            // Stream complete: message may contain inline content, or gateway
            // sends it via chat.history separately. Handle both.
            const text = extractMessageText(chatPayload?.message);
            if (text) {
              // Inline message — add directly, clear stream
              useChatStore.getState().resetStream();
              const finalMsg: ChatMessage = {
                id: crypto.randomUUID(),
                role: "assistant",
                content: text,
                ts: Date.now(),
                runId: chatPayload?.runId,
              };
              useChatStore.getState().setMessages([...useChatStore.getState().messages, finalMsg]);
            } else if (useChatStore.getState().stream) {
              // We accumulated stream chunks — finalize them
              useChatStore.getState().finalizeStream();
            } else {
              // No inline message and no stream buffer — reload history from gateway
              useChatStore.getState().resetStream();
              const rawKey =
                typeof chatPayload?.sessionKey === "string"
                  ? chatPayload.sessionKey
                  : (useChatStore.getState().sessionKey ?? "main");
              // Strip agent session prefix: "agent:main:main" -> "main"
              const cleanKey = rawKey.replace(/^agent:[^:]+:/, "");
              triggerHistoryReload(cleanKey);
            }
            useChatStore.getState().setSending(false);
            useChatStore.getState().setRunId(null);
          } else if (state === "aborted" || state === "error") {
            useChatStore.getState().resetStream();
            useChatStore.getState().setSending(false);
            useChatStore.getState().setRunId(null);
          }
          break;
        }

        // ----------------------------------------------------------------
        // History: full message list loaded (e.g. on session switch)
        // ----------------------------------------------------------------
        case "chat.history": {
          const msgs = (p?.messages ?? []) as RawMessage[];
          // Merge standalone toolResult messages into their preceding assistant
          // message's content array so extractContentBlocks can populate block.result.
          const mergedMsgs = mergeToolResults(msgs) as RawMessage[];
          const normalized: ChatMessage[] = mergedMsgs.map((m) => ({
            id: m.id ?? crypto.randomUUID(),
            role: normalizeRole(m.role),
            content: normalizeContent(m.content ?? m.text ?? ""),
            ts: m.ts ?? m.timestamp ?? Date.now(),
            runId: m.runId,
            sessionKey: m.sessionKey,
            // Extract embedded tool calls from content blocks (assistant messages)
            toolCalls: extractToolCallParts(m.content),
            // Preserve original block order for interleaved text + tool rendering
            contentBlocks: extractContentBlocks(m.content),
          }));
          useChatStore.getState().setMessages(normalized);
          useChatStore.getState().setMessagesLoading(false);
          break;
        }

        // ----------------------------------------------------------------
        // Stream lifecycle
        // ----------------------------------------------------------------
        case "chat.stream.start": {
          const runId = typeof p?.runId === "string" ? p.runId : null;
          useChatStore.getState().resetStream();
          useChatStore.getState().resetToolStream();
          useChatStore.getState().setRunId(runId);
          // NOTE: user message is added optimistically in GatewayChatRuntimeProvider.onNew;
          // skip re-adding here to avoid duplicates. If Gateway provides userMessage for
          // sessions started elsewhere (e.g. other clients), add it only when no recent
          // user message exists in the store.
          if (p?.userMessage) {
            const um = p.userMessage as RawMessage;
            const msgs = useChatStore.getState().messages;
            const lastMsg = msgs[msgs.length - 1];
            const alreadyAdded =
              lastMsg?.role === "user" &&
              normalizeContent(um.content ?? um.text ?? "") === lastMsg.content;
            if (!alreadyAdded) {
              const userMsg: ChatMessage = {
                id: um.id ?? crypto.randomUUID(),
                role: "user",
                content: normalizeContent(um.content ?? um.text ?? ""),
                ts: um.ts ?? um.timestamp ?? Date.now(),
                runId: runId ?? undefined,
              };
              useChatStore.getState().setMessages([...msgs, userMsg]);
            }
          }
          break;
        }

        case "chat.stream.chunk": {
          const text = typeof p?.text === "string" ? p.text : "";
          if (text) {
            useChatStore.getState().appendStreamChunk(text);
          }
          break;
        }

        case "chat.stream.end": {
          useChatStore.getState().finalizeStream();
          useChatStore.getState().setSending(false);
          break;
        }

        case "chat.stream.abort":
        case "chat.stream.error": {
          useChatStore.getState().resetStream();
          useChatStore.getState().setSending(false);
          break;
        }

        // ----------------------------------------------------------------
        // Tool call lifecycle
        // ----------------------------------------------------------------
        case "tool.start": {
          console.log("[tool.start] Tool starting:", p?.toolName, "ID:", p?.toolCallId);
          // Commit any in-progress streaming text as a segment so it renders
          // above the tool card instead of below it (matches old UI behavior).
          useChatStore.getState().commitStreamSegment();

          const entry: ToolStreamEntry = {
            id: (p?.toolCallId as string) ?? crypto.randomUUID(),
            toolName: p?.toolName as string | undefined,
            phase: "start",
            input: p?.input,
          };
          useChatStore.getState().upsertToolStream(entry);
          console.log(
            "[tool.start] ✅ Tool added to stream, total tools:",
            useChatStore.getState().toolStreamOrder.length,
          );
          break;
        }

        case "tool.running": {
          const existing = useChatStore.getState().toolStreamById.get(p?.toolCallId as string);
          if (existing) {
            useChatStore.getState().upsertToolStream({ ...existing, phase: "running" });
          }
          break;
        }

        case "tool.result": {
          const existing = useChatStore.getState().toolStreamById.get(p?.toolCallId as string);
          if (existing) {
            useChatStore
              .getState()
              .upsertToolStream({ ...existing, phase: "result", output: p?.output });
          }
          break;
        }

        case "tool.error": {
          const existing = useChatStore.getState().toolStreamById.get(p?.toolCallId as string);
          if (existing) {
            useChatStore.getState().upsertToolStream({
              ...existing,
              phase: "error",
              error: (p?.error as string) ?? "unknown error",
            });
          }
          break;
        }

        default:
          break;
      }
    };

    registerChatDispatch(dispatch);
    return () => {
      unregisterChatDispatch();
    };
  }, []);
}
