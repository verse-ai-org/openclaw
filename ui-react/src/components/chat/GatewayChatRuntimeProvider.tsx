import {
  AssistantRuntimeProvider,
  useExternalStoreRuntime,
  type ThreadMessageLike,
  type AppendMessage,
} from "@assistant-ui/react";
import { type ReactNode, useCallback, useMemo } from "react";
import { normalizeRole } from "@/hooks/useChatEventBridge";
import {
  useChatStore,
  toolStreamEntryToResultText,
  type ChatMessage,
  type ContentBlock,
} from "@/store/chat.store";
import { useGatewayStore } from "@/store/gateway.store";
import { useSettingsStore } from "@/store/settings.store";

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

  if (msg.contentBlocks && msg.contentBlocks.length > 0) {
    // Ordered interleaved blocks — preserves original text/tool order
    for (const block of msg.contentBlocks) {
      if (block.type === "text") {
        parts.push({ type: "text", text: block.text });
      } else {
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
      parts.push({ type: "text", text: msg.content });
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

  // Ensure there's always at least one part
  if (parts.length === 0) {
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

  const client = useGatewayStore((s) => s.client);
  const settings = useSettingsStore((s) => s.settings);

  // isRunning: true while waiting for a response or streaming
  const isRunning = sending || stream !== null;

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
        runId: runId ?? undefined,
        toolCalls: liveToolCalls.length > 0 ? liveToolCalls : undefined,
        contentBlocks: contentBlocks.length > 0 ? contentBlocks : undefined,
      },
    ];
  }, [chatMessages, stream, runId, isRunning, committedBlocks, toolStreamById, toolStreamOrder]);

  // Handler: user sends a new message
  const onNew = useCallback(
    async (message: AppendMessage) => {
      const textPart = message.content.find((p) => p.type === "text");
      const text = textPart?.type === "text" ? textPart.text : "";
      if (!text.trim() && message.content.length === 0) {
        return;
      }

      // Build attachments from pendingAttachments in the store
      const pendingAttachments = useChatStore.getState().pendingAttachments;
      const attachments = pendingAttachments.map((att) => ({
        content: att.base64,
        mimeType: att.mimeType,
        fileName: att.fileName,
      }));

      // Clear any previous error when user sends a new message
      useChatStore.getState().setLastError(null);
      // Drop leftover stream + tool state from the prior turn so the placeholder row
      // cannot reuse previous tool cards.
      useChatStore.getState().resetStream();

      // Optimistically append the user message immediately so it shows in the thread
      const userMsg = {
        id: crypto.randomUUID(),
        role: "user" as const,
        content: text,
        ts: Date.now(),
        attachments:
          pendingAttachments.length > 0
            ? pendingAttachments.map((a) => ({
                fileName: a.fileName,
                mimeType: a.mimeType,
                size: a.size,
              }))
            : undefined,
      };
      useChatStore.getState().setMessages([...useChatStore.getState().messages, userMsg]);
      useChatStore.getState().setSending(true);

      // Clear pending attachments after building
      useChatStore.getState().clearPendingAttachments();

      const activeSession = sessionKey ?? settings.sessionKey ?? undefined;

      try {
        await client?.request("chat.send", {
          message: text,
          sessionKey: activeSession,
          idempotencyKey: crypto.randomUUID(),
          attachments: attachments.length > 0 ? attachments : undefined,
        });
      } catch (err) {
        console.error("[chat] send failed:", err);
        useChatStore.getState().setSending(false);
      }
      // Note: setSending(false) is called by the chat.stream.end event handler
      // in useChatEventBridge, ensuring proper timing.
    },
    [client, sessionKey, settings.sessionKey],
  );

  // Handler: cancel ongoing generation
  const onCancel = useCallback(async () => {
    const currentRunId = useChatStore.getState().runId;
    const activeSession =
      useChatStore.getState().sessionKey ?? settings.sessionKey ?? "main";
    try {
      await client?.request("chat.abort", {
        sessionKey: activeSession,
        ...(currentRunId ? { runId: currentRunId } : {}),
      });
    } catch (err) {
      console.error("[chat] abort failed:", err);
    }
    useChatStore.getState().resetStream();
    useChatStore.getState().setSending(false);
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
      try {
        await client?.request("chat.send", {
          message: text,
          sessionKey: activeSession,
          idempotencyKey: crypto.randomUUID(),
        });
      } catch (err) {
        console.error("[chat] edit send failed:", err);
        useChatStore.getState().setSending(false);
      }
    },
    [client, sessionKey, settings.sessionKey],
  );

  const runtime = useExternalStoreRuntime<ChatMessage>({
    isRunning,
    messages,
    convertMessage,
    onNew,
    onEdit,
    onCancel,
  });

  return <AssistantRuntimeProvider runtime={runtime}>{children}</AssistantRuntimeProvider>;
}
