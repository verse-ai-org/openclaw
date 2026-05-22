import {
  MessagePrimitive,
  useAuiState,
} from "@assistant-ui/react";
import { type FC, useMemo } from "react";
import type { CanonicalRun } from "@/components/chat/conversation";
import type { TurnUsageMeta } from "@/components/chat/usage/turn-usage-meta";
import { AssistantMarkdownTextBlock } from "../assistant-ui/markdown-text.tsx";
import { AssistantToolGroup } from "../assistant-ui/assistant-tool-group.tsx";
import { useChatStore } from "@/store/chat.store";
import { useConversationStore } from "@/store/conversation.store";
import { useSettingsStore } from "@/store/settings.store";
import { AgentAvatar } from "../assistant-ui/agent-avatar.tsx";
import { splitAssistantContentParts } from "@/components/chat/adapters/assistant-ui";
import { isFirstAssistantInTurn } from "@/components/chat/utils/turn-boundaries";
import { selectChatMessages } from "@/store/conversation-selectors";
import { UiToolParts } from "@/components/chat/ui-tool/ui-tool-parts.tsx";
import type { ToolCallGroupRunDuration } from "@/components/chat/ToolCallGroup";

function completedWholeRunDurationMs(
  run: CanonicalRun | undefined,
): number | undefined {
  if (!run) return undefined;
  if (run.status === "running") return undefined;
  if (typeof run.finishedAt !== "number") return undefined;
  return Math.max(0, run.finishedAt - run.startedAt);
}

function resolveRunIdForMessage(
  conversation: { messagesById: Map<string, { runId?: string }> } | undefined,
  messageId: string,
): string | undefined {
  if (!conversation) return undefined;
  const canonical = conversation.messagesById.get(messageId);
  return canonical?.runId ?? (messageId.startsWith("run:") ? messageId.slice("run:".length) : undefined);
}

// ---------------------------------------------------------------------------
// AssistantMessage
// ---------------------------------------------------------------------------
export const AssistantMessage: FC = () => {
  const messageId = useAuiState((s) => s.message.id);
  const rawContent = useAuiState((s) => s.message.content);
  const messageIsRunning = useAuiState((s) => s.message.status?.type === "running");
  const sessionKey = useChatStore((s) => s.sessionKey);
  const settingsSessionKey = useSettingsStore((s) => s.settings.sessionKey);
  const activeSessionKey = (sessionKey ?? settingsSessionKey ?? "main") || "main";
  const conversation = useConversationStore((s) => s.byThread[activeSessionKey]);
  const isFirstInTurn = useMemo(() => {
    const historyMessages = conversation ? selectChatMessages(conversation) : [];
    return isFirstAssistantInTurn({
      historyMessages,
      assistantMessageId: messageId,
    });
  }, [conversation, messageId]);

  // Narrow selectors: extract only the run fields we care about so that unrelated
  // conversation state changes (e.g. other messages) don't trigger re-renders here.
  const runId = useMemo(
    () => resolveRunIdForMessage(conversation, messageId),
    [conversation, messageId],
  );

  const run: CanonicalRun | undefined = useConversationStore((s) => {
    const conv = s.byThread[activeSessionKey];
    return runId ? conv?.runsById.get(runId) : undefined;
  });

  const runWallDuration: ToolCallGroupRunDuration | undefined = useMemo(() => {
    if (!run) return undefined;
    if (run.status === "running" && typeof run.startedAt === "number") {
      return { kind: "live", startedAt: run.startedAt };
    }
    const ms = completedWholeRunDurationMs(run);
    return ms != null ? { kind: "done", ms } : undefined;
  }, [run]);

  const runUsageMeta: TurnUsageMeta | undefined = run?.usageMeta;
  // console.log("rawContent", rawContent);

  const { textParts, toolParts, uiParts } = useMemo(
    () => splitAssistantContentParts(rawContent),
    [rawContent],
  );
  
  // Only this message's assistant-ui status — do not OR in global `sending`, or every
  // historical assistant row with no tools would flash "Thinking" on each new user send.
  const showThinking = messageIsRunning ?? false;

  return (
    <MessagePrimitive.Root
      className="flex mx-auto w-full max-w-(--thread-max-width) data-[role=assistant]:animate-in data-[role=assistant]:fade-in data-[role=assistant]:slide-in-from-bottom-1"
      data-role="assistant"
    >
      {/* Avatar row */}
      <div className="flex gap-3 items-self-start">
        <div className="shrink-0">
          {isFirstInTurn ? <AgentAvatar /> : <div className="w-8" />}
        </div>
      </div>

      {/* Content column — indented to align with avatar */}
      <div className="pl-2 w-full min-w-0">
        <div className="wrap-break-word text-foreground leading-relaxed">
          <AssistantToolGroup
            toolParts={toolParts}
            showThinking={showThinking}
            runDuration={runWallDuration}
            usageMeta={runUsageMeta}
          />

          <AssistantMarkdownTextBlock textParts={textParts} />

          <UiToolParts parts={uiParts} />
        </div>
      </div>
    </MessagePrimitive.Root>
  );
};
