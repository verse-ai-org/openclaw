import { type FC, useMemo } from "react";
import { cn } from "@/lib/utils";
import {
  useChatStore,
  type ChatMessage,
  type InteractiveContentBlock,
  type InteractiveSummaryPair,
} from "@/store/chat.store";
import { useChatSend } from "../ChatSendContext";
import { mergeAssistantRunMessages } from "@/providers/chat/stream-assembly";
import { formatQaDisplayText, parseQaPairsFromMessage } from "./qa-format";
import {
  extractAskFallbackQuestions,
  formatAskParseErrorReason,
  parseAskTags,
  type AskTagParseErrorReason,
} from "./ask-tag";
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
  interactiveStreamById: Map<string, InteractiveContentBlock>,
  interactiveStreamOrder: string[],
): InteractiveContentBlock[] {
  const out: InteractiveContentBlock[] = [];
  for (const id of interactiveStreamOrder) {
    const entry = interactiveStreamById.get(id);
    if (entry) {
      out.push(entry);
    }
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

export function resolveInteractiveRenderContext(params: {
  messageId: string;
  messages: ChatMessage[];
  interactiveStreamById: Map<string, InteractiveContentBlock>;
  interactiveStreamOrder: string[];
}): {
  interactiveBlocks: InteractiveContentBlock[];
  nextUserMessage: ChatMessage | null;
  askParseFailed: boolean;
  askParseErrorReasons: AskTagParseErrorReason[];
  askFallbackQuestions: string[];
} {
  const { messageId, messages, interactiveStreamById, interactiveStreamOrder } = params;
  const mid = messageId;

  if (mid === STREAM_MESSAGE_ID) {
    return {
      interactiveBlocks: interactiveBlocksFromLiveState(interactiveStreamById, interactiveStreamOrder),
      nextUserMessage: null,
      askParseFailed: false,
      askParseErrorReasons: [],
      askFallbackQuestions: [],
    };
  }

  // Keep message traversal aligned with runtime rendering, where assistant rows
  // are merged by runId into a single visible turn.
  const mergedMessages = mergeAssistantRunMessages(messages);
  const idx = mergedMessages.findIndex((m) => m.id === mid);
  if (idx < 0) {
    return {
      interactiveBlocks: [],
      nextUserMessage: null,
      askParseFailed: false,
      askParseErrorReasons: [],
      askFallbackQuestions: [],
    };
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
  let assistantRunText = "";
  let askParseFailed = false;
  let askParseErrorReasons: AskTagParseErrorReason[] = [];
  let askFallbackQuestions: string[] = [];
  for (let i = left; i <= right; i++) {
    const m = mergedMessages[i]!;
    if (m.role !== "assistant") {
      continue;
    }
    if (m.content) {
      assistantRunText = [assistantRunText, m.content].filter(Boolean).join("\n");
    }
    const ib = filterInteractiveBlocks(m);
    if (ib.length > 0) {
      sourceBlocks = ib;
      break;
    }
  }
  if (sourceBlocks.length === 0 && assistantRunText.trim()) {
    const askParse = parseAskTags(assistantRunText);
    sourceBlocks = askParse.blocks;
    askParseFailed = askParse.errors.length > 0;
    askParseErrorReasons = [...new Set(askParse.errors.map((e) => e.reason))];
    askFallbackQuestions = extractAskFallbackQuestions(assistantRunText);
  }

  const nextUserMessage: ChatMessage | null =
    right < mergedMessages.length - 1 && mergedMessages[right + 1]!.role === "user"
      ? mergedMessages[right + 1]!
      : null;

  if (sourceBlocks.length === 0 || !isLastAssistantInRun) {
    return {
      interactiveBlocks: [],
      nextUserMessage,
      askParseFailed,
      askParseErrorReasons,
      askFallbackQuestions,
    };
  }

  return {
    interactiveBlocks: sourceBlocks,
    nextUserMessage,
    askParseFailed,
    askParseErrorReasons,
    askFallbackQuestions,
  };
}

export const InteractiveParts: FC<InteractivePartsProps> = ({ messageId }) => {
  const { sendMessage } = useChatSend();

  const messages = useChatStore((s) => s.messages);
  const interactiveStreamById = useChatStore((s) => s.interactiveStreamById);
  const interactiveStreamOrder = useChatStore((s) => s.interactiveStreamOrder);
  const interactiveSummaryById = useChatStore((s) => s.interactiveSummaryById);

  const { interactiveBlocks, nextUserMessage, askParseFailed, askParseErrorReasons, askFallbackQuestions } =
    useMemo(() => {
      return resolveInteractiveRenderContext({
        messageId,
        messages,
        interactiveStreamById,
        interactiveStreamOrder,
      });
    }, [messages, messageId, interactiveStreamById, interactiveStreamOrder]);

  if (interactiveBlocks.length === 0 && !askParseFailed) {
    return null;
  }

  if (interactiveBlocks.length === 0 && askParseFailed) {
    return (
      <div className="mt-3 rounded-xl border px-4 py-3 text-sm">
        {askParseErrorReasons.length > 0 ? (
          <div className="whitespace-pre-wrap text-xs text-muted-foreground">
            {askParseErrorReasons
              .map((reason) => `- ${formatAskParseErrorReason(reason)}`)
              .join("\n")}
          </div>
        ) : null}
        {askFallbackQuestions.length > 0 ? (
          <div className="mt-2">
            <div className="text-xs">请按下面问题直接文本回复：</div>
            <div className="mt-1 whitespace-pre-wrap text-xs">
              {formatQaDisplayText(
                askFallbackQuestions.map((q) => ({
                  question: q,
                  answer: "（请填写）",
                })),
              )}
            </div>
          </div>
        ) : null}
        <div className="mt-2 text-xs">请直接用文本回复你的选择。</div>
        <button
          type="button"
          className="mt-3 rounded-md border px-2 py-1 text-xs hover:bg-muted"
          onClick={() => {
            void sendMessage(
              "请重新生成交互卡片，并确保 `<ask>` payload 是严格合法 JSON（不要包含格式错误）。",
            );
          }}
        >
          重新生成交互卡片
        </button>
      </div>
    );
  }

  return (
    <div className="mt-3 flex flex-col gap-4">
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
