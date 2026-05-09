import { type FC, useMemo } from "react";
import type { AssistantUiToolPart } from "@/components/chat/types";
import { UI_INTERACTION_REGISTRY } from "@/components/chat/ui-tool/ui-interaction-registry";
import { useAuiState } from "@assistant-ui/react";
import { useChatSend } from "@/components/chat/ChatSendContext";
import { useInteractionStore } from "@/store/interaction.store";
import { useConversationStore } from "@/store/conversation.store";
import { useChatStore } from "@/store/chat.store";
import { useSettingsStore } from "@/store/settings.store";
import { resolveActiveChatSessionKey } from "@/components/chat/session/active-session";
import { safeParseToolUiPayload } from "@/components/chat/ui-tool/ui-tool-registry";
import { Chart } from "@/components/tool-ui/chart";
import { toast } from "sonner";
import type { SerializableChart } from "@/components/tool-ui/chart/schema";
import { StatsDisplay } from "@/components/tool-ui/stats-display";
import type { SerializableStatsDisplay } from "@/components/tool-ui/stats-display/schema";
import { LinkPreview } from "@/components/tool-ui/link-preview";
import type { SerializableLinkPreview } from "@/components/tool-ui/link-preview/schema";
import { Terminal } from "@/components/tool-ui/terminal";
import type { SerializableTerminal } from "@/components/tool-ui/terminal/schema";
import { CodeBlock } from "@/components/tool-ui/code-block";
import type { SerializableCodeBlock } from "@/components/tool-ui/code-block/schema";
import { ItemCarousel } from "@/components/tool-ui/item-carousel";
import type { SerializableItemCarousel } from "@/components/tool-ui/item-carousel/schema";
import { GeoMap } from "@/components/tool-ui/geo-map";
import type { SerializableGeoMap } from "@/components/tool-ui/geo-map/schema";
import { OptionList, type OptionListSelection, type SerializableOptionList } from "@/components/tool-ui/option-list";
import { ApprovalCard, type ApprovalDecision, type SerializableApprovalCard } from "@/components/tool-ui/approval-card";
import {
  QuestionFlow,
  type QuestionFlowChoice,
  type QuestionFlowSummaryItem,
  type SerializableQuestionFlow,
  type SerializableUpfrontMode,
} from "@/components/tool-ui/question-flow";
import { Pencil, X } from "lucide-react";

type UiToolPartsProps = {
  parts: AssistantUiToolPart[];
};

type UiToolPartRowProps = {
  part: AssistantUiToolPart;
};

const ReceiptHeader: FC<{ onEdit?: () => void }> = ({ onEdit }) =>
  onEdit ? (
    <div className="mb-1 flex justify-end">
      <button
        type="button"
        className="text-xs text-muted-foreground underline hover:text-foreground"
        onClick={onEdit}
      >
        <Pencil className="size-3.5" />
      </button>
    </div>
  ) : null;

function toOptionListChoice(payload: unknown): OptionListSelection | undefined {
  const selected = (payload as { selected?: unknown } | undefined)?.selected;
  if (selected == null) return undefined;
  if (typeof selected === "string") return selected;
  if (Array.isArray(selected) && selected.every((x) => typeof x === "string")) return selected as string[];
  return undefined;
}

function toApprovalChoice(payload: unknown): ApprovalDecision | undefined {
  const decision = (payload as { decision?: unknown } | undefined)?.decision;
  if (decision === "approved" || decision === "denied") return decision;
  return undefined;
}

function buildQuestionFlowReceipt(args: {
  original: SerializableQuestionFlow;
  lastPayload: unknown;
}): SerializableQuestionFlow | null {
  if ("choice" in args.original && args.original.choice) {
    return args.original;
  }

  const answers = (args.lastPayload as { answers?: unknown } | undefined)?.answers;
  if (!answers || typeof answers !== "object") return null;

  // Upfront mode: steps[]
  if ("steps" in args.original) {
    const upfront = args.original as SerializableUpfrontMode;
    const summary: QuestionFlowSummaryItem[] = upfront.steps.map((step) => {
      const raw = (answers as Record<string, unknown>)[step.id];
      const ids = Array.isArray(raw) ? raw.filter((x) => typeof x === "string") : [];
      const labels = step.options
        .filter((o) => ids.includes(o.id))
        .map((o) => o.label);
      return { label: step.title, value: labels.join("、") || "—" };
    });
    const choice: QuestionFlowChoice = { title: "Submitted", summary };
    return { id: upfront.id, choice };
  }

  // Progressive mode: step + title + options
  if ("step" in args.original && typeof args.original.step === "number" && "title" in args.original) {
    const stepKey = String(args.original.step);
    const raw = (answers as Record<string, unknown>)[stepKey];
    const ids = Array.isArray(raw) ? raw.filter((x) => typeof x === "string") : [];
    const options = "options" in args.original && Array.isArray(args.original.options) ? args.original.options : [];
    const labels = (options as Array<{ id: string; label: string }>).filter((o) => ids.includes(o.id)).map((o) => o.label);
    const choice: QuestionFlowChoice = {
      title: typeof args.original.title === "string" ? args.original.title : "Submitted",
      summary: [{ label: "Answer", value: labels.join("、") || "—" }],
    };
    return { id: (args.original as { id: string }).id, choice };
  }

  return null;
}

/**
 * Renders chat-embedded UI tool parts in the message body.
 *
 * Phase C:
 * - "interactive" style components (question_flow / option_list / approval_card) reuse the existing
 *   interactive registry so they can send follow-up messages.
 * - Non-interactive tool-ui surfaces render directly from `components/tool-ui/*`.
 */
export const UiToolParts: FC<UiToolPartsProps> = ({ parts }) => {
  if (parts.length === 0) {
    return null;
  }

  return (
    <div className="mt-3 flex flex-col items-end gap-4">
      {parts.map((part) => (
        <UiToolPartRow
          key={`${part.component}:${part.uiId}`}
          part={part}
        />
      ))}
    </div>
  );
};

const UiToolPartRow: FC<UiToolPartRowProps> = ({ part }) => {
  const { sendMessage } = useChatSend();
  const messageId = useAuiState((s) => s.message.id);
  const sessionKey = useChatStore((s) => s.sessionKey);
  const settingsSessionKey = useSettingsStore((s) => s.settings.sessionKey);
  const activeSessionKey = resolveActiveChatSessionKey(sessionKey, settingsSessionKey);
  const truncateAfter = useConversationStore((s) => s.truncateAfter);

  const uiStateById = useInteractionStore((s) => s.uiStateById);
  const setSubmitted = useInteractionStore((s) => s.setSubmitted);
  const setEditing = useInteractionStore((s) => s.setEditing);
  const cancelEditing = useInteractionStore((s) => s.cancelEditing);

  const uiId = part.uiId;
  const component = part.component;
  const parsedPayload = useMemo(
    () => safeParseToolUiPayload(component, part.payload),
    [component, part.payload],
  );
  if (!parsedPayload) return null;

  const handler = (
    UI_INTERACTION_REGISTRY as Record<
      string,
      typeof UI_INTERACTION_REGISTRY[keyof typeof UI_INTERACTION_REGISTRY]
    >
  )[component];
  if (handler) {
    const state = uiStateById[uiId];
    if (state?.status === "submitted") {
      const onEdit = () => setEditing(uiId);
      if (component === "option_list") {
        const choice = toOptionListChoice(state.lastPayload);
        return (
          <div className="w-full">
            <ReceiptHeader onEdit={onEdit} />
            <OptionList {...(parsedPayload as SerializableOptionList)} choice={choice} />
          </div>
        );
      }
      if (component === "approval_card") {
        const choice = toApprovalChoice(state.lastPayload);
        return (
          <div className="w-full">
            <ReceiptHeader onEdit={onEdit} />
            <ApprovalCard {...(parsedPayload as SerializableApprovalCard)} choice={choice} />
          </div>
        );
      }
      if (component === "question_flow") {
        const receipt = buildQuestionFlowReceipt({
          original: parsedPayload as SerializableQuestionFlow,
          lastPayload: state.lastPayload,
        });
        if (receipt) {
          return (
            <div className="w-full">
              <ReceiptHeader onEdit={onEdit} />
              <QuestionFlow {...receipt} />
            </div>
          );
        }
      }
    }

    const payloadForRender =
      state?.status === "editing" && state.lastPayload
        ? component === "option_list"
          ? {
              ...(parsedPayload as Record<string, unknown>),
              defaultValue:
                typeof (state.lastPayload as { selected?: unknown }).selected === "string"
                  ? (state.lastPayload as { selected: string }).selected
                  : Array.isArray((state.lastPayload as { selected?: unknown }).selected)
                    ? (state.lastPayload as { selected: string[] }).selected
                    : undefined,
            }
          : component === "question_flow" &&
              typeof (parsedPayload as { step?: unknown }).step === "number"
            ? (() => {
                const stepKey = String((parsedPayload as { step: number }).step);
                const answers = (state.lastPayload as { answers?: unknown }).answers;
                const defaultValue =
                  answers && typeof answers === "object"
                    ? ((answers as Record<string, unknown>)[stepKey] as unknown)
                    : undefined;
                return {
                  ...(parsedPayload as Record<string, unknown>),
                  defaultValue,
                };
              })()
            : parsedPayload
        : parsedPayload;

    const pendingNode = handler.renderPending({
      interactiveId: uiId,
      payload: payloadForRender,
      sendMessage,
      setInteractiveSummary: (pairs, payload) => {
        // Defer truncation until the user actually re-submits.
        if (state?.status === "editing") {
          truncateAfter(activeSessionKey, messageId);
          toast.message("Updated choice. Regenerating later messages...");
        }
        setSubmitted(uiId, { summary: pairs, payload });
      },
    });

    if (state?.status !== "editing") {
      return pendingNode;
    }

    return (
      <div className="flex w-full flex-col items-end gap-2">
        <button
          type="button"
          className="text-xs text-muted-foreground underline hover:text-foreground"
          onClick={() => cancelEditing(uiId)}
        >
          <X className="size-3.5" />
        </button>
        {pendingNode}
      </div>
    );
  }

  if (component === "chart") {
    return <Chart {...(parsedPayload as SerializableChart)} />;
  }
  if (component === "stats_display") {
    return <StatsDisplay {...(parsedPayload as SerializableStatsDisplay)} />;
  }
  if (component === "link_preview") {
    return <LinkPreview {...(parsedPayload as SerializableLinkPreview)} />;
  }
  if (component === "terminal") {
    return <Terminal {...(parsedPayload as SerializableTerminal)} />;
  }
  if (component === "code_block") {
    return <CodeBlock {...(parsedPayload as SerializableCodeBlock)} />;
  }
  if (component === "item_carousel") {
    return <ItemCarousel {...(parsedPayload as SerializableItemCarousel)} />;
  }
  if (component === "geo_map") {
    return <GeoMap {...(parsedPayload as SerializableGeoMap)} />;
  }

  return null;
};
