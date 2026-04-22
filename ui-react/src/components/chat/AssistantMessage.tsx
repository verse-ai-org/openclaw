import {
  MessagePrimitive,
  useMessage,
} from "@assistant-ui/react";
import { type FC, useMemo } from "react";
import {
  AssistantMarkdownPart
} from "../assistant-ui/markdown-text.tsx";
import {
  AssistantToolGroup,
  PromotedToolResult,
  type AssistantToolPart,
} from "../assistant-ui/assistant-tool-group.tsx";
import { InteractiveParts } from "./InteractiveParts";
import { useChatStore } from "@/store/chat.store";
import { useSettingsStore } from "@/store/settings.store";
import { AgentAvatar } from "../assistant-ui/agent-avatar.tsx";

type AssistantContentPart =
  | { type: "text"; text: string }
  | ({ type: "tool-call" } & AssistantToolPart);

// ---------------------------------------------------------------------------
// AssistantMessage
// ---------------------------------------------------------------------------
export const AssistantMessage: FC = () => {
  const message = useMessage();
  // Capture message id during render to avoid stale proxy access inside selectors.
  const messageId = message.id;

  // Determine if this assistant message is the first in its turn (preceded by a
  // user message or at the start of the thread). Only show the avatar in this case.
  const messages = useChatStore((s) => s.messages);
  const sessionKey = useChatStore((s) => s.sessionKey);
  const settingsSessionKey = useSettingsStore((s) => s.settings.sessionKey);
  const activeSessionKey = (sessionKey ?? settingsSessionKey ?? "main") || "main";
  const isSessionRunning = useChatStore(
    (s) => activeSessionKey in s.pendingGenerationBySession,
  );

  const isFirstInTurn = useMemo(() => {
    const idx = messages.findIndex((m) => m.id === messageId);
    if (idx < 0) {
      // Streaming placeholder (__stream__) not in store yet — treat as first in turn
      // if the last stored message is a user message.
      const last = messages.at(-1);
      return !last || last.role === "user";
    }
    // Walk backward: if the previous message is a user message (or there is none),
    // this is the first assistant message of this turn.
    const prev = messages[idx - 1];
    return !prev || prev.role === "user";
  }, [messages, messageId]);

  // Show loading indicator only on the last assistant message of the thread.
  // messageId === "__stream__" means it's the live streaming placeholder;
  // otherwise check if it's the last stored message.
  const isLastMessage = useMemo(() => {
    if (messageId === "__stream__") { return true; }
    const last = messages.filter((m) => m.role === "assistant").at(-1);
    return last?.id === messageId;
  }, [messages, messageId]);

  const showLoading = isSessionRunning && isLastMessage;
  const shouldShowAvatar = isFirstInTurn || showLoading;

  const content = ((message as unknown as { content?: AssistantContentPart[] }).content ?? []) as
    | AssistantContentPart[]
    | undefined;
  const textParts = useMemo(
    () =>
      (content ?? []).filter(
        (part): part is Extract<AssistantContentPart, { type: "text" }> =>
          part.type === "text",
      ),
    [content],
  );
  const toolParts = useMemo(
    () =>
      (content ?? []).filter(
        (part): part is Extract<AssistantContentPart, { type: "tool-call" }> =>
          part.type === "tool-call",
      ),
    [content],
  );

  const textContent = useMemo(
    () => textParts.map((part) => part.text).join("\n\n").trim(),
    [textParts],
  );

  return (
    <MessagePrimitive.Root
      className="flex mx-auto w-full max-w-3xl data-[role=assistant]:animate-in data-[role=assistant]:fade-in data-[role=assistant]:slide-in-from-bottom-1"
      data-role="assistant"
    >
      {/* Avatar row — loading state is handled inside AgentAvatar (spinning ring) */}
      <div className="flex gap-3 self-start">
        <div className="shrink-0">
          {shouldShowAvatar ? <AgentAvatar showLoading={showLoading} /> : <div className="w-8" />}
        </div>
      </div>

      {/* Content column — indented to align with avatar */}
      <div className="pl-2 w-full min-w-0">
        <div className="wrap-break-word text-foreground leading-relaxed">
          <AssistantToolGroup toolParts={toolParts} />

          {textParts.map((part, index) => (
            <AssistantMarkdownPart key={`text-${index}`} text={part.text} />
          ))}

          <PromotedToolResult toolParts={toolParts} textContent={textContent} />

          <InteractiveParts messageId={messageId} />
        </div>
      </div>
    </MessagePrimitive.Root>
  );
};
