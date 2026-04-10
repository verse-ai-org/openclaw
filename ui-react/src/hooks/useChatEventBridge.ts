import { useEffect } from "react";
import {
  useChatStore,
  type ToolStreamEntry,
  type ChatMessage,
  type ChatMessageRole,
  type ToolCallPart,
  type ContentBlock,
  type MessageAttachment,
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

/**
 * For user messages from chat.history: strip the appended file-content blocks
 * that the gateway injects (starting with "以下是上传文件的内容："),
 * and extract file names from "[文件: filename]" markers.
 *
 * Returns the clean prompt text and a list of attachment display metadata.
 */
export function stripAttachmentContent(raw: string): {
  prompt: string;
  attachments: MessageAttachment[];
} {
  // Gateway appends: "\n\n以下是上传文件的内容：\n\n[文件: name]\ncontent..."
  const SEPARATOR = "\n\n以下是上传文件的内容：";
  const idx = raw.indexOf(SEPARATOR);
  if (idx === -1) {
    return { prompt: raw, attachments: [] };
  }

  const prompt = raw.slice(0, idx);
  const attachmentBlock = raw.slice(idx + SEPARATOR.length);

  // Extract file names from "[文件: filename]" markers
  const fileNameRegex = /\[文件:\s*([^\]]+?)(?:\s*\([^)]*\))?\s*\]/g;
  const attachments: MessageAttachment[] = [];
  const seen = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = fileNameRegex.exec(attachmentBlock)) !== null) {
    const fileName = match[1].trim();
    if (fileName && !seen.has(fileName)) {
      seen.add(fileName);
      // Infer a rough mimeType from extension for icon display
      const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
      const mimeType = ext === "pdf" ? "application/pdf"
        : ext === "docx" || ext === "doc" ? "application/msword"
        : ext === "xlsx" || ext === "xls" ? "application/vnd.ms-excel"
        : ext === "png" || ext === "jpg" || ext === "jpeg" || ext === "gif" || ext === "webp" ? `image/${ext}`
        : "text/plain";
      attachments.push({ fileName, mimeType, size: 0 });
    }
  }

  return { prompt, attachments };
}

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
 * Normalize a raw Gateway message role to one of the two roles
 * that assistant-ui supports: "user" | "assistant".
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
 * Merge consecutive tool-call-only assistant ChatMessages into one.
 *
 * History returns each agent tool-use turn as a separate message:
 *   [assistantMsg{contentBlocks:[tool-call]}, assistantMsg{contentBlocks:[tool-call]}, ...]
 *
 * Consolidating them lets MessagePrimitive.Parts see N consecutive tool-call
 * parts in a single message, which triggers ToolGroup wrapping.
 * Messages that contain text (or have no contentBlocks) are left unchanged.
 */
export function consolidateToolMessages(messages: ChatMessage[]): ChatMessage[] {
  const result: ChatMessage[] = [];
  let i = 0;

  while (i < messages.length) {
    const msg = messages[i];

    if (msg.role !== "assistant") {
      result.push(msg);
      i++;
      continue;
    }

    const blocks = msg.contentBlocks;
    const isToolOnly = blocks && blocks.length > 0 && blocks.every((b) => b.type === "tool-call");

    if (!isToolOnly) {
      result.push(msg);
      i++;
      continue;
    }

    // Absorb consecutive tool-only assistant messages into one
    const groupBlocks: ContentBlock[] = [...blocks];
    let j = i + 1;
    while (j < messages.length) {
      const next = messages[j];
      if (next.role !== "assistant") {
        break;
      }
      const nb = next.contentBlocks;
      if (!nb || nb.length === 0 || !nb.every((b) => b.type === "tool-call")) {
        break;
      }
      groupBlocks.push(...nb);
      j++;
    }

    result.push({ ...msg, contentBlocks: groupBlocks });
    i = j;
  }

  return result;
}

function extractTextFromToolResultBlock(block: Record<string, unknown>): string | undefined {
  if (typeof block.text === "string") {
    return block.text;
  }
  if (typeof block.content === "string") {
    return block.content;
  }
  if (Array.isArray(block.content)) {
    return (block.content as Array<Record<string, unknown>>)
      .filter((b) => (b.type as string) === "text" && typeof b.text === "string")
      .map((b) => b.text as string)
      .join("");
  }
  return undefined;
}

/** Error UI follows server/toolResult `isError` only — no client-side inference. */
function resolveToolResultPhase(block: Record<string, unknown>): "result" | "error" {
  return block.isError === true ? "error" : "result";
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
      for (let i = out.length - 1; i >= 0; i--) {
        const prev = out[i];
        const prevRole = ((prev.role as string) ?? "").toLowerCase().replace(/_/g, "");
        if (prevRole === "toolresult" || prevRole === "tool") {
          continue;
        }
        const prevContent = Array.isArray(prev.content)
          ? (prev.content as Array<Record<string, unknown>>)
          : [];
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
        if (typeof msg.isError === "boolean") {
          resultBlock.isError = msg.isError;
        }

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
    const resultText = extractTextFromToolResultBlock(block);
    const resPhase = resolveToolResultPhase(block);

    const existing = toolCallId ? parts.find((p) => p.toolCallId === toolCallId) : null;
    if (existing) {
      existing.result = resultText;
      existing.phase = resPhase;
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
        phase: resPhase,
      });
    }
  }

  return parts;
}

/**
 * Extract ordered ContentBlocks (text + tool-call) from a raw message content
 * array, preserving the original interleaved order so the UI can render
 * them as: text → tool card → text → tool card …
 */
export function extractContentBlocks(rawContent: unknown): ContentBlock[] | undefined {
  if (!Array.isArray(rawContent)) {
    return undefined;
  }

  const blocks = rawContent as Array<Record<string, unknown>>;

  // if (import.meta.env.DEV) {
  //   console.log("[extractContentBlocks] blocks:", JSON.stringify(blocks.slice(0, 10), null, 2));
  // }

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
    const resultText = extractTextFromToolResultBlock(block);
    const phase = resolveToolResultPhase(block);
    resultMap.set(id, { result: resultText, phase });
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
            const text = extractMessageText(chatPayload?.message);
            if (text) {
              useChatStore.getState().setStream(text);
            }
          } else if (state === "final") {
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
            } else if (
              useChatStore.getState().stream !== null ||
              useChatStore.getState().committedBlocks.length > 0
            ) {
              // We accumulated stream chunks — finalize them (preserves tool calls)
              useChatStore.getState().finalizeStream();
            } else {
              // No inline message and no stream buffer — reload history from gateway
              useChatStore.getState().resetStream();
              const rawKey =
                typeof chatPayload?.sessionKey === "string"
                  ? chatPayload.sessionKey
                  : (useChatStore.getState().sessionKey ?? "main");
              // Use the raw session key as-is; do not strip agent prefix
              useChatStore.getState().setPendingHistoryReloadKey(rawKey);
            }
            useChatStore.getState().setSending(false);
            useChatStore.getState().setRunId(null);
          } else if (state === "aborted" || state === "error") {
            useChatStore.getState().resetStream();
            useChatStore.getState().setSending(false);
            useChatStore.getState().setRunId(null);
            if (state === "error") {
              const errMsg = chatPayload?.errorMessage ?? "Generation failed. Please try again.";
              useChatStore
                .getState()
                .setLastError(
                  typeof errMsg === "string" ? errMsg : "Generation failed. Please try again.",
                );
            }
          }
          break;
        }

        // ----------------------------------------------------------------
        // Agent streaming events: tool calls and lifecycle
        // ----------------------------------------------------------------
        case "agent": {
          const agentPayload = p;
          const stream = agentPayload?.stream as string | undefined;
          const data = agentPayload?.data as Record<string, unknown> | undefined;

          if (stream === "tool" && data) {
            const phase = data.phase as string | undefined;
            const toolCallId = data.toolCallId as string | undefined;
            const toolName = data.name as string | undefined;

            if (phase === "start") {
              // Freeze any in-progress streaming text as a committed block
              // so it stays visible while the tool call card renders below it
              useChatStore.getState().commitCurrentText();

              const entry: ToolStreamEntry = {
                id: toolCallId ?? crypto.randomUUID(),
                toolName: toolName,
                phase: "start",
                input: data.args,
              };
              useChatStore.getState().upsertToolStream(entry);
            } else if (phase === "result") {
              const existing = useChatStore.getState().toolStreamById.get(toolCallId ?? "");
              if (existing) {
                const isError = Boolean(data.isError);
                if (isError) {
                  // Pi emits phase "result" with isError:true on tool failure (not a separate "error" phase).
                  useChatStore.getState().upsertToolStream({
                    ...existing,
                    phase: "error",
                    error: typeof data.error === "string" ? data.error : undefined,
                    output: data.meta ?? data.result ?? undefined,
                  });
                } else {
                  useChatStore.getState().upsertToolStream({
                    ...existing,
                    phase: "result",
                    // Use meta if available; undefined means the drawer shows no result
                    // until history reloads with the real output
                    output: data.meta ?? undefined,
                  });
                }
              }
            } else if (phase === "error") {
              const existing = useChatStore.getState().toolStreamById.get(toolCallId ?? "");
              if (existing) {
                useChatStore.getState().upsertToolStream({
                  ...existing,
                  phase: "error",
                  error: (data.error as string) ?? "unknown error",
                });
              }
            }
          }
          break;
        }

        // ----------------------------------------------------------------
        // History: full message list loaded (e.g. on session switch)
        // ----------------------------------------------------------------
        case "chat.history": {
          const msgs = (p?.messages ?? []) as RawMessage[];

          if (import.meta.env.DEV) {
            console.group("[chat.history] raw messages");
            console.log(`total: ${msgs.length}`);
            msgs.slice(0, 20).forEach((m, i) => {
              const role = m.role ?? "?";
              const content = m.content;
              const preview = Array.isArray(content)
                ? (content as Array<Record<string, unknown>>)
                    .map(
                      (b) =>
                        `${b.type}${b.name ? `:${b.name}` : b.toolCallId ? `:${String(b.toolCallId).slice(0, 8)}` : ""}`,
                    )
                    .join(", ")
                : String(content ?? "").slice(0, 60);
              console.log(`  [${i}] role=${role} content=[${preview}]`);
            });
            console.groupEnd();
          }

          // Step 1: merge standalone toolResult messages into their preceding
          // assistant message so extractContentBlocks can correlate results.
          const mergedMsgs = mergeToolResults(msgs) as RawMessage[];

          if (import.meta.env.DEV) {
            console.group("[chat.history] after mergeToolResults");
            console.log(`total: ${mergedMsgs.length}`);
            mergedMsgs.slice(0, 20).forEach((m, i) => {
              const role = m.role ?? "?";
              const content = m.content;
              const preview = Array.isArray(content)
                ? (content as Array<Record<string, unknown>>)
                    .map(
                      (b) =>
                        `${b.type}${b.name ? `:${b.name}` : b.toolCallId ? `:${String(b.toolCallId).slice(0, 8)}` : ""}`,
                    )
                    .join(", ")
                : String(content ?? "").slice(0, 60);
              console.log(`  [${i}] role=${role} content=[${preview}]`);
            });
            console.groupEnd();
          }

          const normalized: ChatMessage[] = mergedMsgs.map((m) => {
            const role = normalizeRole(m.role);
            const rawContent = normalizeContent(m.content ?? m.text ?? "");

            // For user messages: strip gateway-injected file content blocks,
            // preserving only the user's prompt and extracting file names for display.
            let content = rawContent;
            let attachments: MessageAttachment[] | undefined;
            if (role === "user") {
              const stripped = stripAttachmentContent(rawContent);
              content = stripped.prompt;
              attachments = stripped.attachments.length > 0 ? stripped.attachments : undefined;
            }

            return {
              id: m.id ?? crypto.randomUUID(),
              role,
              content,
              ts: m.ts ?? m.timestamp ?? Date.now(),
              runId: m.runId,
              sessionKey: m.sessionKey,
              attachments,
              toolCalls: extractToolCallParts(m.content),
              contentBlocks: extractContentBlocks(m.content),
            };
          });

          if (import.meta.env.DEV) {
            console.group("[chat.history] after normalize");
            console.log(`total: ${normalized.length}`);
            normalized.slice(0, 20).forEach((m, i) => {
              const blocks = m.contentBlocks;
              const preview = blocks
                ? blocks
                    .map((b) =>
                      b.type === "tool-call" ? `tool:${b.toolName}` : `text:${b.text.slice(0, 20)}`,
                    )
                    .join(", ")
                : `[no blocks] content=${m.content.slice(0, 40)}`;
              console.log(`  [${i}] role=${m.role} blocks=[${preview}]`);
            });
            console.groupEnd();
          }

          // Step 2: merge consecutive tool-call-only assistant messages into one
          // so MessagePrimitive.Parts can group them with ToolGroup.
          const consolidated = consolidateToolMessages(normalized);

          if (import.meta.env.DEV) {
            console.group("[chat.history] after consolidate");
            console.log(`total: ${consolidated.length} (was ${normalized.length})`);
            consolidated.slice(0, 20).forEach((m, i) => {
              const blocks = m.contentBlocks;
              const preview = blocks
                ? blocks
                    .map((b) =>
                      b.type === "tool-call" ? `tool:${b.toolName}` : `text:${b.text.slice(0, 20)}`,
                    )
                    .join(", ")
                : `[no blocks] content=${m.content.slice(0, 40)}`;
              console.log(`  [${i}] role=${m.role} blocks=[${preview}]`);
            });
            console.groupEnd();
          }

          useChatStore.getState().setMessages(consolidated);
          useChatStore.getState().setMessagesLoading(false);
          break;
        }

        // ----------------------------------------------------------------
        // Stream lifecycle
        // ----------------------------------------------------------------
        case "chat.stream.start": {
          const runId = typeof p?.runId === "string" ? p.runId : null;
          useChatStore.getState().resetStream();
          useChatStore.getState().setRunId(runId);
          useChatStore.getState().setLastError(null);

          // Add user message only if not already optimistically added
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

        case "chat.stream.abort": {
          useChatStore.getState().resetStream();
          useChatStore.getState().setSending(false);
          break;
        }

        case "chat.stream.error": {
          useChatStore.getState().resetStream();
          useChatStore.getState().setSending(false);
          useChatStore.getState().setLastError("Generation failed. Please try again.");
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
