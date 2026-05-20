import {
  AssistantRuntimeProvider,
  useExternalStoreRuntime,
  type AppendMessage,
} from "@assistant-ui/react";
import { type ReactNode, useCallback, useMemo } from "react";
import { toast } from "sonner";
import type { ChatMessage, ChatMessageMetadata, MessageAttachment } from "@/components/chat/types";
import { buildAttachmentRefsFromMessage, createGatewayCompositeAttachmentAdapter, MAX_ATTACHMENT_COUNT, type ChatAttachmentRef, parseGatewaySendPayload } from "./send";
import { useChatStore } from "@/store/chat.store";
import { useConversationStore } from "@/store/conversation.store";
import { useGatewayStore } from "@/store/gateway.store";
import { useSettingsStore } from "@/store/settings.store";
import { resolveActiveChatSessionKey } from "../../session/active-session";
import { useGatewayThreadRuntime } from "./use-gateway-thread-runtime";
import { ChatSendContext } from "@/components/chat/ChatSendContext";
import { toAssistantUiThreadMessage } from "../../adapters/assistant-ui";
import { selectActiveRunId } from "@/store/conversation-selectors";

type SendMessageOptions = {
  attachments?: { content: string; mimeType: string; fileName: string }[];
  attachmentRefs?: ChatAttachmentRef[];
  displayAttachments?: MessageAttachment[];
  metadata?: ChatMessageMetadata;
};

interface Props {
  children: ReactNode;
}

export function GatewayChatRuntimeProvider({ children }: Props) {
  const sessionKey = useChatStore((s) => s.sessionKey);
  const settings = useSettingsStore((s) => s.settings);
  const { messages, isRunning } = useGatewayThreadRuntime(
    sessionKey,
    settings.sessionKey,
  );

  const client = useGatewayStore((s) => s.client);

  const sendMessage = useCallback(
    async (text: string, opts?: SendMessageOptions) => {
      const st = useChatStore.getState();
      const activeSession = resolveActiveChatSessionKey(sessionKey, settings.sessionKey);

      st.setLastError(null);

      // Append user message optimistically.
      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: text,
        ts: Date.now(),
        metadata: opts?.metadata,
        attachments:
          opts?.displayAttachments && opts.displayAttachments.length > 0
            ? opts.displayAttachments
            : undefined,
      };
      // Phase 3: also emit canonical user message for conversation reducer.
      useConversationStore.getState().applyEvents(activeSession, [
        {
          type: "message.start",
          threadId: activeSession,
          ts: userMsg.ts,
          message: {
            id: userMsg.id,
            role: "user",
            createdAt: userMsg.ts,
            attachments: userMsg.attachments,
            metadata: userMsg.metadata,
          },
        },
        {
          type: "message.appendText",
          threadId: activeSession,
          ts: userMsg.ts + 1,
          messageId: userMsg.id,
          partId: crypto.randomUUID(),
          text: userMsg.content,
        },
        {
          type: "message.end",
          threadId: activeSession,
          ts: userMsg.ts + 2,
          messageId: userMsg.id,
        },
      ]);

      // Gateway clientRunId === chat.send idempotencyKey; seed run lifecycle before WS events.
      const runId = crypto.randomUUID();
      useConversationStore.getState().beginOutboundRun(activeSession, runId);

      // Start an optimistic run so isRunning=true before the first WS delta.
      st.setSending(true);

      try {
        const resp = await client?.request<{ runId?: string; status?: string }>("chat.send", {
          message: text,
          sessionKey: activeSession,
          idempotencyKey: runId,
          ...(opts?.attachments && opts.attachments.length > 0
            ? { attachments: opts.attachments }
            : {}),
          ...(opts?.attachmentRefs && opts.attachmentRefs.length > 0
            ? { attachmentRefs: opts.attachmentRefs }
            : {}),
          ...(opts?.metadata ? { metadata: opts.metadata } : {}),
        });

        const ackRunId = typeof resp?.runId === "string" && resp.runId.trim() ? resp.runId.trim() : runId;
        if (ackRunId !== runId) {
          useConversationStore.getState().beginOutboundRun(activeSession, ackRunId);
        }
        // Re-fetch sessions.list so the sidebar shows the session (and titles) right after send ack.
        useChatStore.getState().triggerSessionsReload();
      } catch (err) {
        console.error("[chat] send failed:", err);
        useChatStore.setState({ sending: false });
      }
    },
    [client, sessionKey, settings.sessionKey],
  );

  const onNew = useCallback(
    async (message: AppendMessage) => {
      const { text, gatewayAttachments, displayAttachments } =
        parseGatewaySendPayload(message);
      const attachmentCount = (
        (message as AppendMessage & { attachments?: readonly unknown[] }).attachments
          ?.length ?? 0
      );
      if (attachmentCount > MAX_ATTACHMENT_COUNT) {
        toast.error(`Too many files. Maximum is ${MAX_ATTACHMENT_COUNT}.`, { duration: 3000 });
        return;
      }
      const { refs: attachmentRefs, missingPathFiles } =
        await buildAttachmentRefsFromMessage(message);
      if (missingPathFiles.length > 0) {
        toast.error(
          `Cannot resolve local file path: ${missingPathFiles.join(", ")}. Please reattach from local disk.`,
          { duration: 4000 },
        );
        return;
      }
      if (gatewayAttachments.some((att) => att.mimeType.startsWith("image/"))) {
        toast.error("Image uploads are currently disabled.", { duration: 3000 });
        return;
      }
      if (!text.trim() && gatewayAttachments.length === 0 && attachmentRefs.length === 0) {
        return;
      }
      await sendMessage(text, { attachments: gatewayAttachments, attachmentRefs, displayAttachments });
    },
    [sendMessage],
  );

  const onCancel = useCallback(async () => {
    const st = useChatStore.getState();
    const ak = resolveActiveChatSessionKey(st.sessionKey, settings.sessionKey);
    const conversation = useConversationStore.getState().byThread[ak];
    const derivedRunId = conversation ? selectActiveRunId(conversation) : undefined;
    const currentRunId = derivedRunId ?? null;
    try {
      await client?.request("chat.abort", {
        sessionKey: ak,
        ...(currentRunId ? { runId: currentRunId } : {}),
      });
    } catch (err) {
      console.error("[chat] abort failed:", err);
    }
    useChatStore.setState({ sending: false });
    useConversationStore.getState().setActiveRunSnapshot(ak, null, null);
  }, [client, settings.sessionKey]);

  const onEdit = useCallback(
    async (message: AppendMessage) => {
      const textPart = message.content.find((p) => p.type === "text");
      const text = textPart?.type === "text" ? textPart.text : "";
      if (!text.trim()) return;

      const st = useChatStore.getState();
      const activeSession = resolveActiveChatSessionKey(sessionKey, settings.sessionKey);

      useConversationStore.getState().truncateAfter(activeSession, message.parentId ?? null);
      st.setLastError(null);

      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: text,
        ts: Date.now(),
      };
      const runId = crypto.randomUUID();
      useConversationStore.getState().beginOutboundRun(activeSession, runId);
      st.setSending(true);
      // Phase 3: canonical user message emission for edited send.
      useConversationStore.getState().applyEvents(activeSession, [
        {
          type: "message.start",
          threadId: activeSession,
          ts: userMsg.ts,
          message: {
            id: userMsg.id,
            role: "user",
            createdAt: userMsg.ts,
            attachments: userMsg.attachments,
          },
        },
        {
          type: "message.appendText",
          threadId: activeSession,
          ts: userMsg.ts + 1,
          messageId: userMsg.id,
          partId: crypto.randomUUID(),
          text: userMsg.content,
        },
        {
          type: "message.end",
          threadId: activeSession,
          ts: userMsg.ts + 2,
          messageId: userMsg.id,
        },
      ]);

      try {
        const resp = await client?.request<{ runId?: string }>("chat.send", {
          message: text,
          sessionKey: activeSession,
          idempotencyKey: runId,
        });
        const ackRunId = typeof resp?.runId === "string" && resp.runId.trim() ? resp.runId.trim() : runId;
        if (ackRunId !== runId) {
          useConversationStore.getState().beginOutboundRun(activeSession, ackRunId);
        }
        useChatStore.getState().triggerSessionsReload();
      } catch (err) {
        console.error("[chat] edit send failed:", err);
        useChatStore.setState({ sending: false });
      }
    },
    [client, sessionKey, settings.sessionKey],
  );

  const attachmentAdapter = useMemo(() => createGatewayCompositeAttachmentAdapter(), []);

  const externalStoreAdapter = useMemo(
    () => ({
      isRunning,
      messages,
      convertMessage: toAssistantUiThreadMessage,
      onNew,
      onEdit,
      onCancel,
      adapters: { attachments: attachmentAdapter },
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
