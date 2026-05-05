import {
  MessagePrimitive,
  useAuiState,
} from "@assistant-ui/react";
import { type FC, useMemo } from "react";
import {
  AssistantMarkdownPart
} from "../assistant-ui/markdown-text.tsx";
import {
  AssistantToolGroup,
  PromotedToolResult,
} from "../assistant-ui/assistant-tool-group.tsx";
import { InteractiveParts } from "./interactive";
import { useChatStore } from "@/store/chat.store";
import { useSettingsStore } from "@/store/settings.store";
import { AgentAvatar } from "../assistant-ui/agent-avatar.tsx";
import { splitAssistantContentParts } from "@/components/chat/utils/assistant-content";
import { isFirstAssistantInTurn } from "@/components/chat/utils/turn-boundaries";

// ---------------------------------------------------------------------------
// AssistantMessage
// ---------------------------------------------------------------------------
export const AssistantMessage: FC = () => {
  const messageId = useAuiState((s) => s.message.id);
  const rawContent = useAuiState((s) => s.message.content as unknown);
  const sessionKey = useChatStore((s) => s.sessionKey);
  const settingsSessionKey = useSettingsStore((s) => s.settings.sessionKey);
  const activeSessionKey = (sessionKey ?? settingsSessionKey ?? "main") || "main";
  const isSessionRunning = useChatStore(
    (s) => activeSessionKey in s.pendingGenerationBySession,
  );
  const isFirstInTurn = useChatStore((s) =>
    isFirstAssistantInTurn({
      historyMessages: s.messages,
      assistantMessageId: messageId,
    }),
  );

  const { textParts, toolParts, textContent } = useMemo(
    () => splitAssistantContentParts(rawContent),
    [rawContent],
  );

  return (
    <MessagePrimitive.Root
      className="flex mx-auto w-full max-w-3xl data-[role=assistant]:animate-in data-[role=assistant]:fade-in data-[role=assistant]:slide-in-from-bottom-1"
      data-role="assistant"
    >
      {/* Avatar row — loading state is handled inside AgentAvatar (spinning ring) */}
      <div className="flex gap-3 items-self-start">
        <div className="shrink-0">
          {isFirstInTurn ? <AgentAvatar showLoading={isSessionRunning} /> : <div className="w-8"/>}
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
