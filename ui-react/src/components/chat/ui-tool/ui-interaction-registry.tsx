import type { ReactNode } from "react";
import { QuestionFlow } from "@/components/tool-ui/question-flow";
import type {
  QuestionFlowOption,
  QuestionFlowStepDefinition,
  SerializableQuestionFlow,
  SerializableReceiptMode,
  SerializableUpfrontMode,
} from "@/components/tool-ui/question-flow";
import { OptionList } from "@/components/tool-ui/option-list";
import type { OptionListOption, SerializableOptionList } from "@/components/tool-ui/option-list";
import { ApprovalCard } from "@/components/tool-ui/approval-card";
import type { SerializableApprovalCard } from "@/components/tool-ui/approval-card";
import type {
  ChatMessage,
  ChatMessageMetadata,
  InteractiveSummaryPair,
} from "@/components/chat/types";
import { formatQaDisplayText, parseQaPairsFromMessage } from "./ui-qa-format";
import { buildInteractionMetadata, resolveInteractionId } from "./ui-interaction-metadata";

export type SendMessageFn = (
  text: string,
  options?: { metadata?: ChatMessageMetadata },
) => Promise<void>;

type HandlerContext<TPayload> = {
  interactiveId: string;
  payload: TPayload;
  sendMessage: SendMessageFn;
  setInteractiveSummary: (pairs: InteractiveSummaryPair[], payload?: unknown) => void;
};

export interface UiInteractionHandler<TPayload = unknown> {
  kind: "question_flow" | "option_list" | "approval_card";
  buildStaticSummary?: (payload: TPayload) => InteractiveSummaryPair[] | null;
  buildSubmittedSummary: (
    payload: TPayload,
    nextUserMessage: ChatMessage | null,
  ) => InteractiveSummaryPair[] | null;
  renderPending: (args: HandlerContext<TPayload>) => ReactNode;
}

type ErasedUiInteractionHandler = {
  kind: UiInteractionHandler["kind"];
  buildStaticSummary?: (payload: unknown) => InteractiveSummaryPair[] | null;
  buildSubmittedSummary: (
    payload: unknown,
    nextUserMessage: ChatMessage | null,
  ) => InteractiveSummaryPair[] | null;
  renderPending: (args: HandlerContext<unknown>) => ReactNode;
};

function eraseHandler<TPayload>(
  handler: UiInteractionHandler<TPayload>,
): ErasedUiInteractionHandler {
  return handler as unknown as ErasedUiInteractionHandler;
}

function humanizeInteractionId(id: string): string {
  const normalized = id
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) {
    return "Your choice";
  }
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function resolveOptionListQuestion(payload: SerializableOptionList): string {
  const title = payload.title?.trim();
  if (title) {
    return title;
  }
  const description = payload.description?.trim();
  if (description) {
    return description;
  }
  return humanizeInteractionId(payload.id);
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

const questionFlowHandler: UiInteractionHandler<SerializableQuestionFlow> = {
  kind: "question_flow",
  buildStaticSummary: (config) => {
    if ("choice" in config && config.choice && "summary" in config.choice) {
      const receipt = config.choice as SerializableReceiptMode["choice"];
      return receipt.summary.map((item: { label: string; value: string }) => ({
        question: item.label,
        answer: item.value,
      }));
    }
    return null;
  },
  buildSubmittedSummary: (config, nextUserMessage) => {
    if (!nextUserMessage) {
      return null;
    }
    if ("steps" in config) {
      const upfrontConfig = config as SerializableUpfrontMode;
      const qaPairs = parseQaPairsFromMessage(nextUserMessage.content);
      if (qaPairs.length > 0) {
        return upfrontConfig.steps.map((step: QuestionFlowStepDefinition, i: number) => ({
          question: step.title,
          answer: qaPairs[i]?.answer || "—",
        }));
      }
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
  },
  renderPending: ({ interactiveId, payload, sendMessage, setInteractiveSummary }) => {
    if ("steps" in payload) {
      const upfrontConfig = payload as SerializableUpfrontMode;
      return (
        <QuestionFlow
          key={interactiveId}
          id={upfrontConfig.id}
          steps={upfrontConfig.steps}
          onComplete={async (answers) => {
            const pairs = buildUpfrontSummary(upfrontConfig, answers);
            setInteractiveSummary(pairs, { answers });
            await sendMessage(formatQaDisplayText(pairs), {
              metadata: buildInteractionMetadata({
                interactionId: resolveInteractionId(upfrontConfig, interactiveId),
                component: "question_flow",
                payload: { answers },
              }),
            });
          }}
        />
      );
    }

    if ("step" in payload) {
      return (
        <QuestionFlow
          key={interactiveId}
          id={payload.id}
          step={payload.step}
          title={payload.title}
          options={payload.options}
          description={payload.description}
          selectionMode={payload.selectionMode}
          onSelect={async (optionIds) => {
            const labels = (payload.options as QuestionFlowOption[])
              .filter((o: QuestionFlowOption) => optionIds.includes(o.id))
              .map((o: QuestionFlowOption) => o.label);
            const answer = labels.join("、") || "—";
            const pairs: InteractiveSummaryPair[] = [{ question: payload.title, answer }];
            setInteractiveSummary(pairs, { answers: { [payload.step]: optionIds } });
            await sendMessage(formatQaDisplayText(pairs), {
              metadata: buildInteractionMetadata({
                interactionId: resolveInteractionId(payload, interactiveId),
                component: "question_flow",
                payload: { answers: { [payload.step]: optionIds } },
              }),
            });
          }}
        />
      );
    }

    return null;
  },
};

const optionListHandler: UiInteractionHandler<SerializableOptionList> = {
  kind: "option_list",
  buildSubmittedSummary: (config, nextUserMessage) => {
    const question = resolveOptionListQuestion(config);
    if (!nextUserMessage) {
      return null;
    }
    const qaPairs = parseQaPairsFromMessage(nextUserMessage.content);
    if (qaPairs.length > 0) {
      return [{ question, answer: qaPairs[0]?.answer || "—" }];
    }
    return [{ question, answer: nextUserMessage.content || "—" }];
  },
  renderPending: ({ interactiveId, payload, sendMessage, setInteractiveSummary }) => (
    <OptionList
      key={interactiveId}
      {...payload}
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
        const labels = (payload.options as OptionListOption[])
          .filter((o: OptionListOption) => ids.includes(o.id))
          .map((o: OptionListOption) => o.label);
        const answer = labels.join("、") || "—";
        const pairs: InteractiveSummaryPair[] = [
          { question: resolveOptionListQuestion(payload), answer },
        ];
        setInteractiveSummary(pairs, { selected: ids });
        await sendMessage(formatQaDisplayText(pairs), {
          metadata: buildInteractionMetadata({
            interactionId: resolveInteractionId(payload, interactiveId),
            component: "option_list",
            payload: { selected: ids },
          }),
        });
      }}
    />
  ),
};

const approvalCardHandler: UiInteractionHandler<SerializableApprovalCard> = {
  kind: "approval_card",
  buildSubmittedSummary: (config, nextUserMessage) => {
    if (!nextUserMessage) {
      return null;
    }
    const qaPairs = parseQaPairsFromMessage(nextUserMessage.content);
    if (qaPairs.length > 0) {
      return [{ question: config.title, answer: qaPairs[0]?.answer || "—" }];
    }
    return [{ question: config.title, answer: nextUserMessage.content || "—" }];
  },
  renderPending: ({ interactiveId, payload, sendMessage, setInteractiveSummary }) => (
    <ApprovalCard
      key={interactiveId}
      {...payload}
      onConfirm={async () => {
        const pairs: InteractiveSummaryPair[] = [{ question: payload.title, answer: "Approved" }];
        setInteractiveSummary(pairs, { decision: "approved" });
        await sendMessage(formatQaDisplayText(pairs), {
          metadata: buildInteractionMetadata({
            interactionId: resolveInteractionId(payload, interactiveId),
            component: "approval_card",
            payload: { decision: "approved" },
          }),
        });
      }}
      onCancel={async () => {
        const pairs: InteractiveSummaryPair[] = [{ question: payload.title, answer: "Denied" }];
        setInteractiveSummary(pairs, { decision: "denied" });
        await sendMessage(formatQaDisplayText(pairs), {
          metadata: buildInteractionMetadata({
            interactionId: resolveInteractionId(payload, interactiveId),
            component: "approval_card",
            payload: { decision: "denied" },
          }),
        });
      }}
    />
  ),
};

export const UI_INTERACTION_REGISTRY: Record<
  UiInteractionHandler["kind"],
  ErasedUiInteractionHandler
> = {
  question_flow: eraseHandler(questionFlowHandler),
  option_list: eraseHandler(optionListHandler),
  approval_card: eraseHandler(approvalCardHandler),
};

