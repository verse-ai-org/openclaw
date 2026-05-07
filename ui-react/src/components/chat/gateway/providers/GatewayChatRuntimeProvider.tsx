import {
  AssistantRuntimeProvider,
  useExternalStoreRuntime,
  type AppendMessage,
} from "@assistant-ui/react";
import { type ReactNode, useCallback, useMemo } from "react";
import { toast } from "sonner";
import type { ChatMessage, ChatMessageMetadata, MessageAttachment } from "@/components/chat/types";
import {
  type ChatAttachmentRef,
  buildAttachmentRefsFromMessage,
} from "./attachment-ref";
import { createGatewayCompositeAttachmentAdapter } from "./adapters/gateway-attachment-adapter";
import { MAX_ATTACHMENT_COUNT } from "./adapters/gateway-attachment-adapter";
import { useChatStore } from "@/store/chat.store";
import { useGatewayStore } from "@/store/gateway.store";
import { useSettingsStore } from "@/store/settings.store";
import { resolveActiveChatSessionKey } from "../../session/active-session";
import { useGatewayThreadRuntime } from "./use-gateway-thread-runtime";
import { ChatSendContext } from "@/components/chat/ChatSendContext";
import { convertGatewayChatMessage } from "../../utils/assistant-ui/convert-gateway-chat-message";
import { parseGatewaySendPayload } from "../../utils/outbound/parse-gateway-send-payload";

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
      st.setRunId(null);

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
      st.setMessages([...st.messages, userMsg]);

      // Start an optimistic run so isRunning=true before the first WS delta.
      st.startOptimisticRun(activeSession);
      st.markSessionGenerating(activeSession);

      try {
        const resp = await client?.request<{ runId?: string }>("chat.send", {
          message: text,
          sessionKey: activeSession,
          idempotencyKey: crypto.randomUUID(),
          ...(opts?.attachments && opts.attachments.length > 0
            ? { attachments: opts.attachments }
            : {}),
          ...(opts?.attachmentRefs && opts.attachmentRefs.length > 0
            ? { attachmentRefs: opts.attachmentRefs }
            : {}),
          ...(opts?.metadata ? { metadata: opts.metadata } : {}),
        });

        const runId =
          typeof resp?.runId === "string" && resp.runId.trim() ? resp.runId : null;
        if (runId) {
          st.setRunId(runId);
          st.markSessionGenerating(activeSession, runId);
          // Propagate runId into the active run state so the live message carries it.
          const cur = useChatStore.getState().activeRunState;
          if (cur && !cur.runId) {
            useChatStore.setState((s) => ({
              activeRunState: s.activeRunState ? { ...s.activeRunState, runId } : null,
            }));
          }
        }
      } catch (err) {
        console.error("[chat] send failed:", err);
        useChatStore.setState({ activeRunState: null, sending: false });
        st.clearSessionGenerating(activeSession);
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
    const pendingRid = st.pendingGenerationBySession[ak]?.runId;
    const currentRunId = st.runId ?? (typeof pendingRid === "string" ? pendingRid : null);
    try {
      await client?.request("chat.abort", {
        sessionKey: ak,
        ...(currentRunId ? { runId: currentRunId } : {}),
      });
    } catch (err) {
      console.error("[chat] abort failed:", err);
    }
    useChatStore.setState({ activeRunState: null, sending: false });
    st.clearSessionGenerating(ak);
  }, [client, settings.sessionKey]);

  const onEdit = useCallback(
    async (message: AppendMessage) => {
      const textPart = message.content.find((p) => p.type === "text");
      const text = textPart?.type === "text" ? textPart.text : "";
      if (!text.trim()) return;

      const st = useChatStore.getState();
      const activeSession = resolveActiveChatSessionKey(sessionKey, settings.sessionKey);

      st.truncateMessagesAfter(message.parentId ?? null);
      st.setLastError(null);
      st.setRunId(null);

      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: text,
        ts: Date.now(),
      };
      st.setMessages([...useChatStore.getState().messages, userMsg]);
      st.startOptimisticRun(activeSession);
      st.markSessionGenerating(activeSession);

      try {
        const resp = await client?.request<{ runId?: string }>("chat.send", {
          message: text,
          sessionKey: activeSession,
          idempotencyKey: crypto.randomUUID(),
        });
        const runId =
          typeof resp?.runId === "string" && resp.runId.trim() ? resp.runId : null;
        if (runId) {
          st.setRunId(runId);
          st.markSessionGenerating(activeSession, runId);
          const cur = useChatStore.getState().activeRunState;
          if (cur && !cur.runId) {
            useChatStore.setState((s) => ({
              activeRunState: s.activeRunState ? { ...s.activeRunState, runId } : null,
            }));
          }
        }
      } catch (err) {
        console.error("[chat] edit send failed:", err);
        useChatStore.setState({ activeRunState: null, sending: false });
        st.clearSessionGenerating(activeSession);
      }
    },
    [client, sessionKey, settings.sessionKey],
  );

  const attachmentAdapter = useMemo(() => createGatewayCompositeAttachmentAdapter(), []);

  const externalStoreAdapter = useMemo(
    () => ({
      isRunning,
      messages,
      convertMessage: convertGatewayChatMessage,
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
