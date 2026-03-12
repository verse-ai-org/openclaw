import {
  AssistantRuntimeProvider,
  useExternalStoreRuntime,
  type ThreadMessageLike,
  type AppendMessage,
} from "@assistant-ui/react";
import { type ReactNode, useCallback, useMemo } from "react";
import { normalizeRole } from "@/hooks/useChatEventBridge";
import { useChatStore, type ChatMessage } from "@/store/chat.store";
import { useGatewayStore } from "@/store/gateway.store";
import { useSettingsStore } from "@/store/settings.store";

// ---------------------------------------------------------------------------
// Message conversion: ChatMessage → ThreadMessageLike
// ---------------------------------------------------------------------------
function convertMessage(msg: ChatMessage): ThreadMessageLike {
  // normalizeRole maps "tool", "toolResult", etc. → "assistant".
  // Cast to satisfy ThreadMessageLike's "user" | "assistant" | "system" constraint;
  // normalizeRole guarantees "tool" never survives, but TS doesn't know ChatMessageRole
  // is narrowed here.
  const role = normalizeRole(msg.role) as "user" | "assistant" | "system";

  // Build content parts.
  // When the message has ordered contentBlocks (from history with interleaved
  // text + tool-call segments), use them directly so the UI renders:
  //   text → tool card → text → tool card …
  // Otherwise fall back to the flat content+toolCalls pair.
  type ContentPart =
    | { type: "text"; text: string }
    | {
        type: "tool-call";
        toolCallId: string;
        toolName: string;
        args: Record<string, unknown>;
        result?: string;
      };
  const parts: ContentPart[] = [];

  if (msg.contentBlocks && msg.contentBlocks.length > 0) {
    // Ordered interleaved blocks — preserves original text/tool order
    for (const block of msg.contentBlocks) {
      if (block.type === "text") {
        parts.push({ type: "text", text: block.text });
      } else {
        // tool-call block
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
        });
      }
    }
  }

  // Ensure there's always at least one part
  if (parts.length === 0) {
    parts.push({ type: "text", text: "" });
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
  const toolStreamById = useChatStore((s) => s.toolStreamById);
  const toolStreamOrder = useChatStore((s) => s.toolStreamOrder);

  const client = useGatewayStore((s) => s.client);
  const settings = useSettingsStore((s) => s.settings);

  // isRunning: true while waiting for a response or streaming
  const isRunning = sending || stream !== null;

  // Append streaming assistant placeholder to the message list while active.
  // When sending=true but stream hasn't started yet (waiting for first token),
  // insert an empty assistant placeholder so assistant-ui renders the loading indicator.
  // Also inject any in-flight tool calls from toolStreamById into the placeholder.
  const messages: ChatMessage[] = useMemo(() => {
    if (!isRunning) {
      return chatMessages;
    }
    // Build toolCalls from live tool stream entries (for in-progress tool calls)
    const liveToolCalls = toolStreamOrder
      .map((id) => toolStreamById.get(id))
      .filter(Boolean)
      .map((entry) => ({
        toolCallId: entry!.id,
        toolName: entry!.toolName ?? "tool",
        argsText: entry!.input != null ? JSON.stringify(entry!.input, null, 2) : undefined,
        result:
          typeof entry!.output === "string"
            ? entry!.output
            : entry!.output != null
              ? JSON.stringify(entry!.output, null, 2)
              : undefined,
        error: entry!.error,
        phase: entry!.phase === "result" ? "result" : entry!.phase === "error" ? "error" : "call",
      }));
    const streamContent = stream ?? "";
    return [
      ...chatMessages,
      {
        id: "__stream__",
        role: "assistant" as const,
        content: streamContent,
        ts: Date.now(),
        runId: runId ?? undefined,
        toolCalls: liveToolCalls.length > 0 ? liveToolCalls : undefined,
      },
    ];
  }, [chatMessages, stream, runId, isRunning, toolStreamById, toolStreamOrder]);

  // Handler: user sends a new message
  const onNew = useCallback(
    async (message: AppendMessage) => {
      const textPart = message.content.find((p) => p.type === "text");
      const text = textPart?.type === "text" ? textPart.text : "";
      if (!text.trim() && message.content.length === 0) {
        return;
      }

      // Optimistically append the user message immediately so it shows in the thread
      const userMsg = {
        id: crypto.randomUUID(),
        role: "user" as const,
        content: text,
        ts: Date.now(),
      };
      useChatStore.getState().setMessages([...useChatStore.getState().messages, userMsg]);
      useChatStore.getState().setSending(true);

      // Build attachments from image content parts if present
      const attachments = message.content
        .filter((p) => p.type === "image")
        .map((p) => {
          if (p.type === "image") {
            return { dataUrl: p.image, mimeType: "image/png" };
          }
          return null;
        })
        .filter(Boolean);

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
    try {
      await client?.request("chat.abort", { runId: currentRunId });
    } catch (err) {
      console.error("[chat] abort failed:", err);
    }
    useChatStore.getState().resetStream();
    useChatStore.getState().setSending(false);
  }, [client]);

  const runtime = useExternalStoreRuntime<ChatMessage>({
    isRunning,
    messages,
    convertMessage,
    onNew,
    onCancel,
  });

  return <AssistantRuntimeProvider runtime={runtime}>{children}</AssistantRuntimeProvider>;
}
