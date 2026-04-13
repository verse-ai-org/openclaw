import {
  AssistantRuntimeProvider,
  useExternalStoreRuntime,
  type ThreadMessageLike,
  type AppendMessage,
  type CompleteAttachment,
} from "@assistant-ui/react";
import type { MessageAttachment } from "@/store/chat.store";
import { createGatewayCompositeAttachmentAdapter } from "./gateway-attachment-adapter";
import { type ReactNode, useCallback, useMemo } from "react";
import { normalizeRole } from "@/hooks/chat-event-bridge";
import {
  useChatStore,
  toolStreamEntryToResultText,
  type ChatMessage,
  type ContentBlock,
} from "@/store/chat.store";
import { useGatewayStore } from "@/store/gateway.store";
import { useSettingsStore } from "@/store/settings.store";
import { ChatSendContext } from "./ChatSendContext";

// ---------------------------------------------------------------------------
// Strip agent instruction wrapper tags (e.g. <final>) from display text.
// These tags are used by agent SKILL prompts as structural markers and
// should never be shown to users in the chat UI.
// Handles both:
//   - Complete wrapping: <final>content</final>  → content
//   - Partial (streaming): <final>\ncontent...   → content...  (open tag not yet closed)
// ---------------------------------------------------------------------------
const AGENT_COMPLETE_TAG_RE = /^\s*<(final|plan)>([\s\S]*?)<\/\1>\s*$/i;
const AGENT_OPEN_TAG_RE = /^\s*<(?:final|plan)>\n?/i;
const AGENT_CLOSE_TAG_RE = /\n?<\/(?:final|plan)>\s*$/i;

/**
 * Maps assistant-ui composer output to Gateway `chat.send` payloads and optimistic rows.
 *
 * Important: `BaseComposerRuntimeCore.send` puts the user's typed text in `message.content`
 * as `{ type: "text" }` parts only. Completed files live under **`message.attachments`**
 * (`CompleteAttachment[]` with `content` parts from `AttachmentAdapter.send`), not inline
 * in `message.content`. Parsing only `content` misses PDFs/images — see
 * `@assistant-ui/core` `base-composer-runtime-core.js` (`attachments: await attachments`).
 */
function parseGatewaySendPayload(message: AppendMessage): {
  text: string;
  gatewayAttachments: { content: string; mimeType: string; fileName: string }[];
  displayAttachments: MessageAttachment[];
} {
  const textChunks: string[] = [];
  const gatewayAttachments: { content: string; mimeType: string; fileName: string }[] = [];
  const displayAttachments: MessageAttachment[] = [];

  const consumePart = (
    part:
      | { type: "text"; text: string }
      | { type: "image"; image: string; filename?: string }
      | { type: "file"; data: string; mimeType: string; filename?: string },
    meta?: Pick<CompleteAttachment, "name" | "contentType" | "file">,
  ) => {
    if (part.type === "text") {
      textChunks.push(part.text);
      return;
    }
    if (part.type === "image") {
      const image = part.image;
      const base64 = image.includes(",") ? image.slice(image.indexOf(",") + 1) : image;
      const mimeMatch = image.match(/^data:([^;]+);/);
      const mimeType = mimeMatch?.[1] ?? "image/png";
      const fileName = part.filename ?? meta?.name ?? "image";
      gatewayAttachments.push({ content: base64, mimeType, fileName });
      displayAttachments.push({
        fileName,
        mimeType,
        size: meta?.file?.size ?? 0,
      });
      return;
    }
    if (part.type === "file") {
      const fileName = part.filename ?? meta?.name ?? "file";
      const mimeType = part.mimeType || meta?.contentType || "application/octet-stream";
      gatewayAttachments.push({
        content: part.data,
        mimeType,
        fileName,
      });
      displayAttachments.push({
        fileName,
        mimeType,
        size: meta?.file?.size ?? 0,
      });
    }
  };

  const raw = message.content;
  const contentParts = typeof raw === "string" ? [{ type: "text" as const, text: raw }] : [...raw];
  for (const part of contentParts) {
    if (part.type === "text" || part.type === "image" || part.type === "file") {
      consumePart(part, undefined);
    }
  }

  const threadAttachments = (
    message as AppendMessage & { attachments?: readonly CompleteAttachment[] }
  ).attachments;
  if (threadAttachments && threadAttachments.length > 0) {
    for (const att of threadAttachments) {
      if (att.status.type !== "complete") {
        continue;
      }
      const meta = {
        name: att.name,
        contentType: att.contentType,
        file: att.file,
      };
      for (const part of att.content) {
        if (part.type === "text" || part.type === "image" || part.type === "file") {
          consumePart(part, meta);
        }
      }
    }
  }

  return {
    text: textChunks.join("\n"),
    gatewayAttachments,
    displayAttachments,
  };
}

function stripAgentWrapperTags(text: string): string {
  let result = text;
  // Strip complete <tag>...</tag> wrappers (post-stream or history)
  let match: RegExpMatchArray | null;
  // eslint-disable-next-line no-cond-assign
  while ((match = result.match(AGENT_COMPLETE_TAG_RE))) {
    result = match[2] ?? "";
  }
  // Strip partial open tag at start (during streaming, close tag not yet arrived)
  result = result.replace(AGENT_OPEN_TAG_RE, "");
  // Strip partial close tag at end (edge case)
  result = result.replace(AGENT_CLOSE_TAG_RE, "");
  // Half-written </final> or </plan> at EOF while streaming (e.g. "</" before "final>" arrives)
  if (!/<\/(?:final|plan)>\s*$/iu.test(result)) {
    result = result.replace(/<\/(?:final|plan)?$/iu, "");
  }
  return result;
}

// ---------------------------------------------------------------------------
// Message conversion: ChatMessage → ThreadMessageLike
// ---------------------------------------------------------------------------
function convertMessage(msg: ChatMessage): ThreadMessageLike {
  // normalizeRole maps "tool", "toolResult", etc. → "assistant".
  const role = normalizeRole(msg.role) as "user" | "assistant" | "system";

  type ContentPart =
    | { type: "text"; text: string }
    | {
        type: "tool-call";
        toolCallId: string;
        toolName: string;
        args: Record<string, unknown>;
        result?: string;
        isError?: boolean;
      };
  const parts: ContentPart[] = [];
  const hasInteractiveBlocks = msg.contentBlocks?.some((block) => block.type === "interactive") ?? false;

  if (msg.contentBlocks && msg.contentBlocks.length > 0) {
    // Ordered interleaved blocks — preserves original text/tool order
    for (const block of msg.contentBlocks) {
      if (block.type === "text") {
        parts.push({ type: "text", text: stripAgentWrapperTags(block.text) });
      } else if (block.type === "tool-call") {
        let parsedArgs: Record<string, unknown> = {};
        if (block.argsText) {
          try {
            parsedArgs = JSON.parse(block.argsText) as Record<string, unknown>;
          } catch {
            /* ignore — leave as empty object */
          }
        }
        parts.push({
          type: "tool-call",
          toolCallId: block.toolCallId,
          toolName: block.toolName,
          args: parsedArgs,
          result: block.result,
          isError: block.phase === "error",
        });
      }
    }
  } else {
    // Flat fallback: text first, then tool calls
    if (msg.content.trim()) {
      parts.push({ type: "text", text: stripAgentWrapperTags(msg.content) });
    }
    if (msg.toolCalls && msg.toolCalls.length > 0) {
      for (const tc of msg.toolCalls) {
        let parsedArgs: Record<string, unknown> = {};
        if (tc.argsText) {
          try {
            parsedArgs = JSON.parse(tc.argsText) as Record<string, unknown>;
          } catch {
            /* ignore */
          }
        }
        parts.push({
          type: "tool-call",
          toolCallId: tc.toolCallId,
          toolName: tc.toolName,
          args: parsedArgs,
          result: tc.result,
          isError: tc.phase === "error",
        });
      }
    }
  }

  // Ensure there's always at least one part for assistant-ui, except when this row is interactive-only.
  if (parts.length === 0 && !hasInteractiveBlocks) {
    parts.push({ type: "text", text: "" });
  }

  if (import.meta.env.DEV && parts.filter((p) => p.type === "tool-call").length > 1) {
    console.log(
      `[convertMessage] msg ${msg.id} has ${parts.length} parts:`,
      parts.map((p) =>
        p.type === "tool-call" ? `tool:${p.toolName}` : `text:${p.text.slice(0, 20)}`,
      ),
    );
  }

  return {
    id: msg.id,
    role,
    content: parts as ThreadMessageLike["content"],
    createdAt: new Date(msg.ts),
  };
}

// ---------------------------------------------------------------------------
// GatewayChatRuntimeProvider
//
// Bridges the Zustand chat store + Gateway WebSocket client into an
// ExternalStoreRuntime that assistant-ui's Thread component can consume.
// ---------------------------------------------------------------------------
interface Props {
  children: ReactNode;
}

export function GatewayChatRuntimeProvider({ children }: Props) {
  const chatMessages = useChatStore((s) => s.messages);
  const stream = useChatStore((s) => s.stream);
  const sending = useChatStore((s) => s.sending);
  const runId = useChatStore((s) => s.runId);
  const sessionKey = useChatStore((s) => s.sessionKey);
  const committedBlocks = useChatStore((s) => s.committedBlocks);
  const toolStreamById = useChatStore((s) => s.toolStreamById);
  const toolStreamOrder = useChatStore((s) => s.toolStreamOrder);
  const interactiveStreamById = useChatStore((s) => s.interactiveStreamById);
  const interactiveStreamOrder = useChatStore((s) => s.interactiveStreamOrder);

  const client = useGatewayStore((s) => s.client);
  const settings = useSettingsStore((s) => s.settings);

  const activeSessionKey =
    (typeof sessionKey === "string" && sessionKey.trim()
      ? sessionKey.trim()
      : typeof settings.sessionKey === "string" && settings.sessionKey.trim()
        ? settings.sessionKey.trim()
        : "main") || "main";
  const pendingForActiveSession = useChatStore(
    (s) => s.pendingGenerationBySession[activeSessionKey],
  );
  const effectiveRunId = runId ?? pendingForActiveSession?.runId ?? null;

  // isRunning: local stream/sending, or a generation still running on the gateway for this session
  // (e.g. user switched away and back before the turn finished).
  const isRunning =
    sending || stream !== null || pendingForActiveSession != null;

  // Append streaming assistant placeholder to the message list while active.
  // Builds contentBlocks from:
  //   1. committedBlocks — text segments frozen before tool calls (interleaved with tools)
  //   2. in-flight tool call entries from toolStreamById (in order)
  //   3. current stream text — text being streamed AFTER the last tool call
  // This correctly renders interleaved text → tool → text → tool → text patterns.
  const messages: ChatMessage[] = useMemo(() => {
    if (!isRunning) {
      return chatMessages;
    }

    const contentBlocks: ContentBlock[] = [
      // Already-frozen segments (text before previous tool calls)
      ...committedBlocks,
    ];

    // In-flight interactive inputs come before normal tool cards.
    for (const id of interactiveStreamOrder) {
      const entry = interactiveStreamById.get(id);
      if (!entry) {
        continue;
      }
      contentBlocks.push(entry);
    }

    // In-flight tool calls in arrival order — come AFTER committed text blocks
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

    // Current in-progress stream text — appended AFTER all tool calls
    // so it appears below the tool group rather than pushing tools down
    const streamContent = stream ?? "";
    if (streamContent.trim()) {
      contentBlocks.push({ type: "text", text: streamContent });
    }

    // Resume-after-switch: show an assistant placeholder row while we wait for the next delta.
    if (contentBlocks.length === 0 && isRunning) {
      contentBlocks.push({ type: "text", text: "" });
    }

    // Build flat toolCalls array for the backward-compat field
    const liveToolCalls = toolStreamOrder
      .map((id) => toolStreamById.get(id))
      .filter(Boolean)
      .map((entry) => ({
        toolCallId: entry!.id,
        toolName: entry!.toolName ?? "tool",
        argsText: entry!.input != null ? JSON.stringify(entry!.input, null, 2) : undefined,
        result: toolStreamEntryToResultText(entry!),
        error: entry!.error,
        phase: (entry!.phase === "result"
          ? "result"
          : entry!.phase === "error"
            ? "error"
            : "call") as "call" | "result" | "error",
      }));

    return [
      ...chatMessages,
      {
        id: "__stream__",
        role: "assistant" as const,
        content: streamContent,
        ts: Date.now(),
        runId: effectiveRunId ?? undefined,
        toolCalls: liveToolCalls.length > 0 ? liveToolCalls : undefined,
        contentBlocks: contentBlocks.length > 0 ? contentBlocks : undefined,
      },
    ];
  }, [
    chatMessages,
    stream,
    effectiveRunId,
    isRunning,
    committedBlocks,
    toolStreamById,
    toolStreamOrder,
    interactiveStreamById,
    interactiveStreamOrder,
  ]);

  // Shared plain-text send — used by the composer (onNew) and InteractiveCardArea (HITL answers).
  const sendMessage = useCallback(
    async (text: string, opts?: { attachments?: { content: string; mimeType: string; fileName: string }[]; displayAttachments?: MessageAttachment[] }) => {
      useChatStore.getState().setLastError(null);
      useChatStore.getState().resetStream();

      const userMsg = {
        id: crypto.randomUUID(),
        role: "user" as const,
        content: text,
        ts: Date.now(),
        attachments:
          opts?.displayAttachments && opts.displayAttachments.length > 0
            ? opts.displayAttachments
            : undefined,
      };
      useChatStore.getState().setMessages([...useChatStore.getState().messages, userMsg]);
      useChatStore.getState().setSending(true);

      const activeSession = sessionKey ?? settings.sessionKey ?? undefined;
      if (typeof activeSession === "string" && activeSession.trim()) {
        useChatStore.getState().markSessionGenerating(activeSession.trim());
      }

      try {
        await client?.request("chat.send", {
          message: text,
          sessionKey: activeSession,
          idempotencyKey: crypto.randomUUID(),
          ...(opts?.attachments && opts.attachments.length > 0
            ? { attachments: opts.attachments }
            : {}),
        });
      } catch (err) {
        console.error("[chat] send failed:", err);
        useChatStore.getState().setSending(false);
        if (typeof activeSession === "string" && activeSession.trim()) {
          useChatStore.getState().clearSessionGenerating(activeSession.trim());
        }
      }
    },
    [client, sessionKey, settings.sessionKey],
  );

  // Handler: user sends a new message via the composer
  const onNew = useCallback(
    async (message: AppendMessage) => {
      const { text, gatewayAttachments, displayAttachments } = parseGatewaySendPayload(message);

      if (!text.trim() && gatewayAttachments.length === 0) {
        return;
      }

      await sendMessage(text, {
        attachments: gatewayAttachments,
        displayAttachments,
      });
      // Note: setSending(false) is called by the chat.stream.end event handler
      // in useChatEventBridge, ensuring proper timing.
    },
    [sendMessage],
  );

  // Handler: cancel ongoing generation
  const onCancel = useCallback(async () => {
    const st = useChatStore.getState();
    const activeSession = st.sessionKey ?? settings.sessionKey ?? "main";
    const ak = typeof activeSession === "string" && activeSession.trim() ? activeSession.trim() : "main";
    const pendingRid = st.pendingGenerationBySession[ak]?.runId;
    const currentRunId = st.runId ?? (typeof pendingRid === "string" ? pendingRid : null);
    try {
      await client?.request("chat.abort", {
        sessionKey: activeSession,
        ...(currentRunId ? { runId: currentRunId } : {}),
      });
    } catch (err) {
      console.error("[chat] abort failed:", err);
    }
    st.resetStream();
    st.setSending(false);
    st.clearSessionGenerating(ak);
  }, [client, settings.sessionKey]);

  // Handler: user edits a past message and resubmits.
  // parentId is the last message that should REMAIN in the thread.
  const onEdit = useCallback(
    async (message: AppendMessage) => {
      const textPart = message.content.find((p) => p.type === "text");
      const text = textPart?.type === "text" ? textPart.text : "";
      if (!text.trim()) {
        return;
      }

      // Truncate local history to the parent message, discarding everything
      // after it (including the old user message and any assistant replies).
      useChatStore.getState().truncateMessagesAfter(message.parentId ?? null);
      useChatStore.getState().setLastError(null);
      useChatStore.getState().resetStream();

      // Optimistically append the edited user message
      const userMsg = {
        id: crypto.randomUUID(),
        role: "user" as const,
        content: text,
        ts: Date.now(),
      };
      useChatStore.getState().setMessages([...useChatStore.getState().messages, userMsg]);
      useChatStore.getState().setSending(true);

      const activeSession = sessionKey ?? settings.sessionKey ?? undefined;
      if (typeof activeSession === "string" && activeSession.trim()) {
        useChatStore.getState().markSessionGenerating(activeSession.trim());
      }
      try {
        await client?.request("chat.send", {
          message: text,
          sessionKey: activeSession,
          idempotencyKey: crypto.randomUUID(),
        });
      } catch (err) {
        console.error("[chat] edit send failed:", err);
        useChatStore.getState().setSending(false);
        if (typeof activeSession === "string" && activeSession.trim()) {
          useChatStore.getState().clearSessionGenerating(activeSession.trim());
        }
      }
    },
    [client, sessionKey, settings.sessionKey],
  );

  // assistant-ui's useExternalStoreRuntime runs setAdapter in a useEffect with no
  // dependency array (every commit). A fresh inline adapter object each render makes
  // ExternalStoreThreadRuntimeCore think the store changed and calls _notifySubscribers(),
  // which can cascade into "Maximum update depth exceeded". Keep a stable reference
  // when props are unchanged (same rule as React state deps).
  const attachmentAdapter = useMemo(() => createGatewayCompositeAttachmentAdapter(), []);
  const externalStoreAdapter = useMemo(
    () => ({
      isRunning,
      messages,
      convertMessage,
      onNew,
      onEdit,
      onCancel,
      adapters: {
        attachments: attachmentAdapter,
      },
    }),
    [isRunning, messages, onNew, onEdit, onCancel, attachmentAdapter],
  );

  const runtime = useExternalStoreRuntime<ChatMessage>(externalStoreAdapter);

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ChatSendContext.Provider value={{ sendMessage }}>
        {children}
      </ChatSendContext.Provider>
    </AssistantRuntimeProvider>
  );
}
