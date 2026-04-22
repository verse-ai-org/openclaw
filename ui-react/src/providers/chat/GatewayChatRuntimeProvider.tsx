import {
  AssistantRuntimeProvider,
  useExternalStoreRuntime,
  type AppendMessage,
} from "@assistant-ui/react";
import { type ReactNode, useCallback, useMemo } from "react";
import type { MessageAttachment } from "@/store/chat.store";
import { createGatewayCompositeAttachmentAdapter } from "@/providers/chat/adapters/gateway-attachment-adapter";
import {
  useChatStore,
  type ChatMessage,
} from "@/store/chat.store";
import { useGatewayStore } from "@/store/gateway.store";
import { useSettingsStore } from "@/store/settings.store";
import { ChatSendContext } from "@/components/chat/ChatSendContext";
import { convertGatewayChatMessage } from "@/providers/chat/message-convert";
import { parseGatewaySendPayload } from "@/providers/chat/send-payload";
import { buildRuntimeMessages } from "@/providers/chat/stream-assembly";
import { logChatDebug } from "@/lib/chat-debug";
import { clearBridgeTrackedRunForSession } from "@/hooks/chat-event-bridge/run-guard-session";

type SendMessageOptions = {
  attachments?: { content: string; mimeType: string; fileName: string }[];
  displayAttachments?: MessageAttachment[];
};

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
  const interactions = useChatStore((s) => s.interactions);

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
  const isRunning = sending || stream !== null || pendingForActiveSession != null;

  const messages: ChatMessage[] = useMemo(() => {
    return buildRuntimeMessages({
      chatMessages,
      isRunning,
      stream,
      committedBlocks,
      toolStreamById,
      toolStreamOrder,
      interactiveStreamById,
      interactiveStreamOrder,
      interactions,
      effectiveRunId,
    });
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
    interactions,
  ]);

  const sendMessage = useCallback(
    async (
      text: string,
      opts?: SendMessageOptions,
    ) => {
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
    },
    [sendMessage],
  );

  const respondInteraction = useCallback(
    async ({
      interactionId,
      data,
      status,
    }: {
      interactionId: string;
      data: unknown;
      status?: "submitted" | "cancelled";
    }) => {
      const activeSession = sessionKey ?? settings.sessionKey ?? undefined;
      if (!client) {
        console.warn("[chat] respondInteraction called without gateway client");
        return;
      }
      try {
        logChatDebug(
          "debug",
          "respondInteraction: RPC start",
          {
            interactionId,
            status: status ?? "submitted",
            dataKeys:
              data && typeof data === "object" && !Array.isArray(data)
                ? Object.keys(data as Record<string, unknown>)
                : [],
          },
          { channel: "agent.interaction", sessionKey: activeSession ?? undefined },
        );
        if (typeof activeSession === "string" && activeSession.trim()) {
          const sk = activeSession.trim();
          // Continuation can emit `agent` tool events before `lifecycle:start`
          // and before this RPC promise resolves. If `activeRunBySession` still
          // holds the *previous* run id, `shouldAcceptRunEvent` drops progress for
          // the new run — tools only appear after history reload. Clear eagerly.
          clearBridgeTrackedRunForSession(sk);
          useChatStore.getState().markSessionGenerating(sk);
        }
        // Optimistically mark the interaction as submitted locally so the UI
        // switches from the input widget to the Q/A summary immediately.
        // If the RPC fails we roll back to `pending`.
        const prev =
          useChatStore.getState().interactions[interactionId]?.status;
        useChatStore.getState().setInteractionResponse(interactionId, {
          status: status === "cancelled" ? "cancelled" : "submitted",
          response: data,
        });
        await client.request("chat.interactionRespond", {
          sessionKey: activeSession,
          interactionId,
          data,
          status: status ?? "submitted",
        });
        if (typeof activeSession === "string" && activeSession.trim()) {
          clearBridgeTrackedRunForSession(activeSession.trim());
        }
        logChatDebug(
          "debug",
          "respondInteraction: RPC ok (continuation run starts on gateway)",
          { interactionId },
          { channel: "agent.interaction", sessionKey: activeSession ?? undefined },
        );
        if (prev && status !== "cancelled") {
          // Server-side confirmation arrives through the interaction-response
          // agent event; no follow-up needed here.
        }
      } catch (err) {
        console.error("[chat] interaction respond failed:", err);
        if (typeof activeSession === "string" && activeSession.trim()) {
          useChatStore.getState().clearSessionGenerating(activeSession.trim());
        }
        // Roll back — flip back to pending so the widget re-renders.
        const state = useChatStore.getState().interactions[interactionId];
        if (state) {
          useChatStore.getState().upsertInteraction({
            interactionId,
            component: state.component,
            payload: state.payload,
            schemaVersion: state.schemaVersion,
            cancellable: state.cancellable,
            messageId: state.messageId,
            status: "pending",
          });
        }
      }
    },
    [client, sessionKey, settings.sessionKey],
  );

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

  const onEdit = useCallback(
    async (message: AppendMessage) => {
      const textPart = message.content.find((p) => p.type === "text");
      const text = textPart?.type === "text" ? textPart.text : "";
      if (!text.trim()) {
        return;
      }

      useChatStore.getState().truncateMessagesAfter(message.parentId ?? null);
      useChatStore.getState().setLastError(null);
      useChatStore.getState().resetStream();

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

  const attachmentAdapter = useMemo(() => createGatewayCompositeAttachmentAdapter(), []);
  const externalStoreAdapter = useMemo(
    () => ({
      isRunning,
      messages,
      convertMessage: convertGatewayChatMessage,
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
      <ChatSendContext.Provider value={{ sendMessage, respondInteraction }}>
        {children}
      </ChatSendContext.Provider>
    </AssistantRuntimeProvider>
  );
}
