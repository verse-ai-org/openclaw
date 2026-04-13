import { type FC, useMemo } from "react";
import { useMessage } from "@assistant-ui/react";
import { cn } from "@/lib/utils";
import {
  useChatStore,
  type ChatMessage,
  type InteractiveContentBlock,
  type InteractiveSummaryPair,
} from "@/store/chat.store";
import { useChatSend } from "./ChatSendContext";
import { QuestionFlow } from "@/components/tool-ui/question-flow";
import type {
  SerializableQuestionFlow,
  SerializableReceiptMode,
  SerializableUpfrontMode,
  QuestionFlowStepDefinition,
  QuestionFlowOption,
} from "@/components/tool-ui/question-flow";
import { OptionList } from "@/components/tool-ui/option-list";
import type { OptionListOption, SerializableOptionList } from "@/components/tool-ui/option-list";

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

function buildUpfrontSummary(
  config: SerializableUpfrontMode,
  answers: Record<string, string[]>,
): InteractiveSummaryPair[] {
  return config.steps.map((step: QuestionFlowStepDefinition) => {
    const selected = answers[step.id] ?? [];
    const labels = step.options
      .filter((o: QuestionFlowOption) => selected.includes(o.id))
      .map((o: QuestionFlowOption) => o.label);
    return {
      question: step.title,
      answer: labels.join("、") || "—",
    };
  });
}

function buildQuestionFlowSubmittedSummary(
  config: SerializableQuestionFlow,
  nextUserMessage: ChatMessage | null,
): InteractiveSummaryPair[] | null {
  if (!nextUserMessage) {
    return null;
  }

  if ("steps" in config) {
    const upfrontConfig = config as SerializableUpfrontMode;
    const lines = nextUserMessage.content.split("\n").filter(Boolean);
    return upfrontConfig.steps.map((step: QuestionFlowStepDefinition, i: number) => {
      const line = lines[i] ?? "";
      const colonIdx = line.indexOf("：");
      const answer = colonIdx >= 0 ? line.slice(colonIdx + 1).trim() : line.trim();
      return { question: step.title, answer: answer || "—" };
    });
  }

  if ("title" in config) {
    return [{ question: config.title, answer: nextUserMessage.content || "—" }];
  }

  return null;
}

function buildOptionListSummary(
  config: SerializableOptionList,
  nextUserMessage: ChatMessage | null,
): InteractiveSummaryPair[] | null {
  if (!nextUserMessage) {
    return null;
  }

  return [{ question: config.id, answer: nextUserMessage.content || "—" }];
}

export const InteractiveParts: FC = () => {
  const message = useMessage();
  const { sendMessage } = useChatSend();

  const messages = useChatStore((s) => s.messages);
  const interactiveStreamById = useChatStore((s) => s.interactiveStreamById);
  const interactiveStreamOrder = useChatStore((s) => s.interactiveStreamOrder);
  const interactiveSummaryById = useChatStore((s) => s.interactiveSummaryById);

  const { interactiveBlocks, nextUserMessage } = useMemo(() => {
    const mid = message.id;

    if (mid === STREAM_MESSAGE_ID) {
      return {
        interactiveBlocks: interactiveBlocksFromLiveState(
          interactiveStreamById,
          interactiveStreamOrder,
        ),
        nextUserMessage: null as ChatMessage | null,
      };
    }

    const idx = messages.findIndex((m) => m.id === mid);
    if (idx < 0) {
      return {
        interactiveBlocks: [] as InteractiveContentBlock[],
        nextUserMessage: null as ChatMessage | null,
      };
    }

    let left = idx;
    while (left > 0 && messages[left - 1]!.role === "assistant") {
      left--;
    }
    let right = idx;
    while (right < messages.length - 1 && messages[right + 1]!.role === "assistant") {
      right++;
    }

    const isLastAssistantInRun = idx === right;

    let sourceBlocks: InteractiveContentBlock[] = [];
    for (let i = left; i <= right; i++) {
      const m = messages[i]!;
      if (m.role !== "assistant") {
        continue;
      }
      const ib = filterInteractiveBlocks(m);
      if (ib.length > 0) {
        sourceBlocks = ib;
        break;
      }
    }

    const nextUserMessage: ChatMessage | null =
      right < messages.length - 1 && messages[right + 1]!.role === "user"
        ? messages[right + 1]!
        : null;

    if (sourceBlocks.length === 0 || !isLastAssistantInRun) {
      return { interactiveBlocks: [] as InteractiveContentBlock[], nextUserMessage };
    }

    return { interactiveBlocks: sourceBlocks, nextUserMessage };
  }, [messages, message.id, interactiveStreamById, interactiveStreamOrder]);

  if (interactiveBlocks.length === 0) {
    return null;
  }

  return (
    <div className="mt-3 flex flex-col gap-4">
      {interactiveBlocks.map((block) => {
        const interactiveId = block.interactiveId;
        const storedSummary = interactiveSummaryById[interactiveId];

        if (block.kind === "question_flow") {
          const config = block.payload as SerializableQuestionFlow;

          if (storedSummary) {
            return <QASummary key={interactiveId} pairs={storedSummary} />;
          }

          const submittedSummary = buildQuestionFlowSubmittedSummary(config, nextUserMessage);
          if (submittedSummary) {
            return <QASummary key={interactiveId} pairs={submittedSummary} />;
          }

          if ("steps" in config) {
            const upfrontConfig = config as SerializableUpfrontMode;
            return (
              <QuestionFlow
                key={interactiveId}
                id={upfrontConfig.id}
                steps={upfrontConfig.steps}
                onComplete={async (answers) => {
                  const pairs = buildUpfrontSummary(upfrontConfig, answers);
                  useChatStore.getState().setInteractiveSummary(interactiveId, pairs);
                  const text = pairs.map((p) => `${p.question}：${p.answer}`).join("\n");
                  await sendMessage(text);
                }}
              />
            );
          }

          if ("step" in config) {
            return (
              <QuestionFlow
                key={interactiveId}
                id={config.id}
                step={config.step}
                title={config.title}
                options={config.options}
                description={config.description}
                selectionMode={config.selectionMode}
                onSelect={async (optionIds) => {
                  const labels = (config.options as QuestionFlowOption[])
                    .filter((o: QuestionFlowOption) => optionIds.includes(o.id))
                    .map((o: QuestionFlowOption) => o.label);
                  const answer = labels.join("、") || "—";
                  const pairs: InteractiveSummaryPair[] = [{ question: config.title, answer }];
                  useChatStore.getState().setInteractiveSummary(interactiveId, pairs);
                  await sendMessage(answer);
                }}
              />
            );
          }

          if ("choice" in config && config.choice && "summary" in config.choice) {
            const receipt = config.choice as SerializableReceiptMode["choice"];
            return (
              <QASummary
                key={interactiveId}
                pairs={receipt.summary.map((item: { label: string; value: string }) => ({
                  question: item.label,
                  answer: item.value,
                }))}
              />
            );
          }

          return null;
        }

        const config = block.payload as SerializableOptionList;

        if (storedSummary) {
          return <QASummary key={interactiveId} pairs={storedSummary} />;
        }

        const submittedSummary = buildOptionListSummary(config, nextUserMessage);
        if (submittedSummary) {
          return <QASummary key={interactiveId} pairs={submittedSummary} />;
        }

        return (
          <OptionList
            key={interactiveId}
            {...config}
            onAction={async (actionId, selection) => {
              if (actionId !== "confirm" || selection == null) {
                return;
              }
              const ids =
                typeof selection === "string"
                  ? [selection]
                  : Array.isArray(selection)
                    ? selection
                    : [];
              const labels = (config.options as OptionListOption[])
                .filter((o: OptionListOption) => ids.includes(o.id))
                .map((o: OptionListOption) => o.label);
              const answer = labels.join("、") || "—";
              useChatStore.getState().setInteractiveSummary(interactiveId, [{
                question: config.id,
                answer,
              }]);
              await sendMessage(answer);
            }}
          />
        );
      })}
    </div>
  );
};
