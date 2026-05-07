import { type FC, useMemo } from "react";
import { useShallow } from "zustand/shallow";
import { cn } from "@/lib/utils";
import { useChatStore } from "@/store/chat.store";
import type { ChatMessage, InteractiveContentBlock, InteractiveSummaryPair } from "@/components/chat/types";
import { useChatSend } from "../ChatSendContext";
import { mergeAssistantRunSegments } from "@/components/chat/utils/merge-assistant-run-segments";
import { parseQaPairsFromMessage } from "./qa-format";
import { INTERACTIVE_COMPONENT_REGISTRY } from "./interactive-registry";

const QASummary: FC<{ pairs: InteractiveSummaryPair[] }> = ({ pairs }) => (
  <div className="flex flex-col rounded-xl border bg-card/60 px-4 py-3 text-sm">
    {pairs.map(({ question, answer }, i) => (
      <div key={i} className={cn("flex flex-col gap-0.5 py-2.5", i > 0 && "border-t")}>
        <span className="text-xs text-muted-foreground">Q: {question}</span>
        <span className="font-medium text-foreground">A: {answer}</span>
      </div>
    ))}
  </div>
);

const STREAM_MESSAGE_ID = "__stream__";

function interactiveBlocksFromLiveState(
  interactiveById: Map<string, InteractiveContentBlock>,
  interactiveOrder: string[],
): InteractiveContentBlock[] {
  const out: InteractiveContentBlock[] = [];
  for (const id of interactiveOrder) {
    const entry = interactiveById.get(id);
    if (entry) out.push(entry);
  }
  return out;
}

function filterInteractiveBlocks(msg: ChatMessage | undefined): InteractiveContentBlock[] {
  return (
    msg?.contentBlocks?.filter(
      (b): b is InteractiveContentBlock => b.type === "interactive",
    ) ?? []
  );
}

function isSubmittedInteractionResponse(args: {
  nextUserMessage: ChatMessage | null;
  interactiveId: string;
  component: string;
}): boolean {
  const interaction = args.nextUserMessage?.metadata?.interaction;
  if (!interaction) {
    return false;
  }
  return (
    interaction.id === args.interactiveId &&
    interaction.component === args.component &&
    interaction.status === "submitted"
  );
}

function hasQaSummaryText(nextUserMessage: ChatMessage | null): boolean {
  if (!nextUserMessage?.content?.trim()) {
    return false;
  }
  return parseQaPairsFromMessage(nextUserMessage.content).length > 0;
}

type InteractivePartsProps = {
  messageId: string;
};

/** Resolves interactive blocks for the synthetic live row (`__stream__`) or persisted history. */
export function resolveInteractiveRenderContext(params: {
  messageId: string;
  messages: ChatMessage[];
  liveInteractiveById?: Map<string, InteractiveContentBlock>;
  liveInteractiveOrder?: string[];
}): {
  interactiveBlocks: InteractiveContentBlock[];
  nextUserMessage: ChatMessage | null;
} {
  const { messageId, messages, liveInteractiveById, liveInteractiveOrder } = params;

  if (messageId === STREAM_MESSAGE_ID) {
    const byId = liveInteractiveById ?? new Map<string, InteractiveContentBlock>();
    const order = liveInteractiveOrder ?? [];
    return {
      interactiveBlocks: interactiveBlocksFromLiveState(byId, order),
      nextUserMessage: null,
    };
  }

  const mergedMessages = mergeAssistantRunSegments(messages);
  const idx = mergedMessages.findIndex((m) => m.id === messageId);
  if (idx < 0) {
    return { interactiveBlocks: [], nextUserMessage: null };
  }

  let left = idx;
  while (left > 0 && mergedMessages[left - 1]!.role === "assistant") {
    left--;
  }
  let right = idx;
  while (right < mergedMessages.length - 1 && mergedMessages[right + 1]!.role === "assistant") {
    right++;
  }

  const isLastAssistantInRun = idx === right;

  let sourceBlocks: InteractiveContentBlock[] = [];
  for (let i = left; i <= right; i++) {
    const m = mergedMessages[i]!;
    if (m.role !== "assistant") continue;
    const ib = filterInteractiveBlocks(m);
    if (ib.length > 0) {
      sourceBlocks = ib;
      break;
    }
  }

  const nextUserMessage: ChatMessage | null =
    right < mergedMessages.length - 1 && mergedMessages[right + 1]!.role === "user"
      ? mergedMessages[right + 1]!
      : null;

  if (sourceBlocks.length === 0 || !isLastAssistantInRun) {
    return {
      interactiveBlocks: [],
      nextUserMessage,
    };
  }

  return {
    interactiveBlocks: sourceBlocks,
    nextUserMessage,
  };
}

export const InteractiveParts: FC<InteractivePartsProps> = ({ messageId }) => {
  const { sendMessage } = useChatSend();

  const { messages, interactiveSummaryById, activeRunState } = useChatStore(
    useShallow((s) => ({
      messages: s.messages,
      interactiveSummaryById: s.interactiveSummaryById,
      activeRunState: s.activeRunState,
    })),
  );
  const liveInteractiveById = activeRunState?.interactiveById;
  const liveInteractiveOrder = activeRunState?.interactiveOrder;

  const { interactiveBlocks, nextUserMessage } = useMemo(
    () =>
      resolveInteractiveRenderContext({
        messageId,
        messages,
        liveInteractiveById,
        liveInteractiveOrder,
      }),
    [messages, messageId, liveInteractiveById, liveInteractiveOrder],
  );

  if (interactiveBlocks.length === 0) {
    return null;
  }

  return (
    <div className="mt-3 flex flex-col items-end gap-4">
      {interactiveBlocks.map((block) => {
        const interactiveId = block.interactiveId;
        const storedSummary = interactiveSummaryById[interactiveId];
        const handler = INTERACTIVE_COMPONENT_REGISTRY[block.kind];
        if (!handler) {
          return null;
        }

        if (
          isSubmittedInteractionResponse({
            nextUserMessage,
            interactiveId,
            component: block.kind,
          }) &&
          hasQaSummaryText(nextUserMessage)
        ) {
          return null;
        }

        if (storedSummary) {
          return <QASummary key={interactiveId} pairs={storedSummary} />;
        }

        const staticSummary = handler.buildStaticSummary?.(block.payload);
        if (staticSummary) {
          return <QASummary key={interactiveId} pairs={staticSummary} />;
        }

        const submittedSummary = handler.buildSubmittedSummary(
          block.payload,
          nextUserMessage,
        );
        if (submittedSummary) {
          return <QASummary key={interactiveId} pairs={submittedSummary} />;
        }

        return handler.renderPending({
          interactiveId,
          payload: block.payload,
          sendMessage,
          setInteractiveSummary: (pairs) =>
            useChatStore.getState().setInteractiveSummary(interactiveId, pairs),
        });
      })}
    </div>
  );
};
