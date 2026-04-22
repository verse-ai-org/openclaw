import { type FC, useMemo } from "react";
import { useMessage } from "@assistant-ui/react";
import type {
  OptionListRequest,
  QuestionFlowRequest,
} from "@openclaw/interactions";
import { cn } from "@/lib/utils";
import { logChatDebug } from "@/lib/chat-debug";
import {
  useChatStore,
  type ChatMessage,
  type InteractionState,
  type InteractiveSummaryPair,
} from "@/store/chat.store";
import { useChatSend } from "./ChatSendContext";
import { QuestionFlow } from "@/components/tool-ui/question-flow";
import { OptionList } from "@/components/tool-ui/option-list";

/**
 * InteractiveParts
 *
 * Registry dispatcher for first-class `<ask>`-driven interactions. Given an
 * assistant message id (implicit via `useMessage()`), walks its
 * `{type: "interaction"}` content parts, resolves each to an
 * `InteractionState` from the Zustand store, and renders the correct
 * component via the `INTERACTION_RENDERERS` map. User submissions go through
 * `respondInteraction(...)` (`chat.interactionRespond` RPC), never through
 * `sendMessage(text)`.
 */

const STREAM_MESSAGE_ID = "__stream__";

// ---------------------------------------------------------------------------
// Shared summary UI
// ---------------------------------------------------------------------------

const QASummary: FC<{ pairs: InteractiveSummaryPair[] }> = ({ pairs }) => (
  <div className="flex flex-col rounded-xl border bg-card/60 px-4 py-3 text-sm">
    {pairs.map(({ question, answer }, i) => (
      <div
        key={i}
        className={cn("flex flex-col gap-0.5 py-2.5", i > 0 && "border-t")}
      >
        <span className="text-xs text-muted-foreground">Q: {question}</span>
        <span className="font-medium text-foreground">A: {answer}</span>
      </div>
    ))}
  </div>
);

// ---------------------------------------------------------------------------
// Renderers
// ---------------------------------------------------------------------------

interface InteractionRendererContext {
  state: InteractionState;
  respond: (args: {
    data: unknown;
    status?: "submitted" | "cancelled";
  }) => Promise<void>;
}

function renderQuestionFlowInteraction(
  ctx: InteractionRendererContext,
): React.ReactNode {
  const { state, respond } = ctx;
  const req = state.payload as QuestionFlowRequest;
  if (state.status !== "pending") {
    const answers = (state.response as { answers?: Record<string, string[]> })
      ?.answers;
    if (!answers) {
      return (
        <div className="rounded-xl border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          Interaction {state.status}.
        </div>
      );
    }
    const pairs: InteractiveSummaryPair[] = req.steps.map((step) => {
      const picked = answers[step.id] ?? [];
      const labels = step.options
        .filter((o) => picked.includes(o.id))
        .map((o) => o.label);
      return { question: step.title, answer: labels.join("、") || "—" };
    });
    return <QASummary pairs={pairs} />;
  }
  return (
    <QuestionFlow
      id={req.id}
      steps={req.steps}
      onComplete={async (answers) => {
        await respond({ data: { answers } });
      }}
    />
  );
}

function renderOptionListInteraction(
  ctx: InteractionRendererContext,
): React.ReactNode {
  const { state, respond } = ctx;
  const req = state.payload as OptionListRequest;
  if (state.status !== "pending") {
    const selected =
      (state.response as { selected?: string[] })?.selected ?? [];
    const labels = req.options
      .filter((o) => selected.includes(o.id))
      .map((o) => o.label);
    return (
      <QASummary
        pairs={[
          {
            question: req.title ?? req.id,
            answer: labels.join("、") || "—",
          },
        ]}
      />
    );
  }
  return (
    <OptionList
      id={req.id}
      options={req.options}
      selectionMode={req.selectionMode ?? "single"}
      onAction={async (actionId, selection) => {
        if (actionId !== "confirm" || selection == null) return;
        const selected =
          typeof selection === "string"
            ? [selection]
            : Array.isArray(selection)
              ? selection
              : [];
        await respond({ data: { selected } });
      }}
    />
  );
}

export const INTERACTION_RENDERERS: Record<
  string,
  (ctx: InteractionRendererContext) => React.ReactNode
> = {
  question_flow: renderQuestionFlowInteraction,
  option_list: renderOptionListInteraction,
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function extractInteractionIds(msg: ChatMessage | undefined): string[] {
  return (
    msg?.contentBlocks
      ?.filter(
        (b): b is Extract<typeof b, { type: "interaction" }> =>
          b.type === "interaction",
      )
      .map((b) => b.interactionId) ?? []
  );
}

/**
 * Aggregate `{type:"interaction"}` block ids across every store message that
 * belongs to the same assistant "run" bubble. Needed because
 * `mergeAssistantRunMessages` (in `buildRuntimeMessages`) collapses all
 * assistant ChatMessages sharing a `runId` into a single merged bubble in
 * the runtime — the merged bubble keeps the FIRST message's id. The store
 * still holds the un-merged rows, so an `<ask>` that originated on a later
 * row would otherwise be invisible to `InteractiveParts`.
 */
export function extractInteractionIdsForRun(
  messages: ChatMessage[],
  messageId: string,
): string[] {
  const anchor = messages.find((m) => m.id === messageId);
  if (!anchor) {
    return [];
  }
  if (anchor.role !== "assistant" || !anchor.runId) {
    return extractInteractionIds(anchor);
  }
  const ids: string[] = [];
  for (const m of messages) {
    if (m.role !== "assistant" || m.runId !== anchor.runId) {
      continue;
    }
    ids.push(...extractInteractionIds(m));
  }
  return ids;
}

type InteractivePartsProps = { messageId?: string };

/**
 * Core renderer — no `useMessage()` call. Receives a resolved `messageId`
 * so it can be used from both the hook-based and prop-based entry points.
 */
const InteractivePartsContent: FC<{ messageId: string }> = ({ messageId }) => {
  const { sendMessage, respondInteraction } = useChatSend();

  const messages = useChatStore((s) => s.messages);
  const interactions = useChatStore((s) => s.interactions);

  const interactionIds = useMemo(() => {
    if (messageId === STREAM_MESSAGE_ID) {
      // Streaming placeholder — show pending interactions not yet bound to a
      // persisted message.
      return Object.values(interactions)
        .filter((i) => !i.messageId)
        .sort((a, b) => a.createdAt - b.createdAt)
        .map((i) => i.interactionId);
    }
    const ids = extractInteractionIdsForRun(messages, messageId);
    if (ids.length > 0) {
      logChatDebug(
        "debug",
        "InteractiveParts: run bubble interaction ids",
        {
          messageId,
          ids,
          resolved: ids.map((id) => ({
            id,
            state: interactions[id] ? "present" : "MISSING",
          })),
        },
        { channel: "agent.interaction" },
      );
    }
    return ids;
  }, [messages, messageId, interactions]);

  if (interactionIds.length === 0) {
    return null;
  }

  return (
    <div className="mt-3 flex flex-col gap-4">
      {interactionIds.map((interactionId) => {
        const state = interactions[interactionId];
        if (!state) return null;
        const renderer = INTERACTION_RENDERERS[state.component];
        if (!renderer) {
          return (
            <div
              key={interactionId}
              className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
            >
              Unknown interaction component: {state.component}
            </div>
          );
        }
        return (
          <div key={interactionId}>
            {renderer({
              state,
              respond: async ({ data, status }) => {
                if (!respondInteraction) {
                  // Defensive fallback: runtime didn't wire the RPC. Send
                  // the response as user text so we're never a dead end.
                  await sendMessage(JSON.stringify(data));
                  return;
                }
                await respondInteraction({
                  interactionId,
                  data,
                  status: status ?? "submitted",
                });
              },
            })}
          </div>
        );
      })}
    </div>
  );
};

/**
 * Thin wrapper that calls `useMessage()` to resolve `messageId` when no
 * explicit `messageId` prop is provided. By keeping `useMessage()` in this
 * separate component, consumers that already have the id (e.g. AssistantMessage)
 * can pass it as a prop and avoid the hook entirely — preventing the
 * `tapClientLookup: Index N out of bounds` crash that occurs when the
 * `__stream__` placeholder is removed from the thread before React finishes
 * reconciling the component tree.
 */
const InteractivePartsWithHook: FC = () => {
  const message = useMessage();
  return <InteractivePartsContent messageId={message.id} />;
};

export const InteractiveParts: FC<InteractivePartsProps> = ({ messageId }) => {
  if (messageId !== undefined) {
    return <InteractivePartsContent messageId={messageId} />;
  }
  return <InteractivePartsWithHook />;
};
