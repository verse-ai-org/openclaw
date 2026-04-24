import type { QuestionFlowRequest, QuestionFlowResponse } from "./schema.ts";

export interface InteractionDowngradeRender {
  /** Plain-text fallback (for channels without keyboards). */
  text: string;
  /** Optional compact inline-button groups keyed per step. */
  keyboard?: InteractionKeyboardGroup[];
}

export interface InteractionKeyboardGroup {
  title: string;
  buttons: Array<{
    /** Label shown on the button. */
    label: string;
    /** Opaque id encoded into callback_data / custom_id / action value. */
    value: string;
  }>;
}

/**
 * Render a QuestionFlow request into a channel-friendly payload.
 *
 * For multi-step flows each step becomes its own keyboard group; the caller
 * is responsible for sequencing (e.g. only sending the next step after the
 * previous one resolves).
 */
export function renderQuestionFlowDowngrade(
  request: QuestionFlowRequest,
): InteractionDowngradeRender {
  const lines: string[] = [];
  const keyboard: InteractionKeyboardGroup[] = [];

  for (const step of request.steps) {
    lines.push(`${step.title}`);
    if (step.description) lines.push(step.description);
    const buttons = step.options
      .filter((opt) => !opt.disabled)
      .map((opt) => ({
        label: opt.label,
        value: `${step.id}:${opt.id}`,
      }));
    step.options.forEach((opt, idx) => {
      lines.push(`  ${idx + 1}. ${opt.label}${opt.description ? " - " + opt.description : ""}`);
    });
    lines.push("");
    keyboard.push({ title: step.title, buttons });
  }

  return {
    text: lines.join("\n").trimEnd(),
    keyboard,
  };
}

/**
 * Parse an inbound callback value (encoded by `renderQuestionFlowDowngrade`)
 * into a partial response. The channel provider must accumulate partial
 * responses until every required step has an answer, then send the final
 * response via chat.interactionRespond.
 */
export function parseQuestionFlowDowngradeCallback(
  value: string,
): { stepId: string; optionId: string } | null {
  const idx = value.indexOf(":");
  if (idx <= 0) return null;
  return {
    stepId: value.slice(0, idx),
    optionId: value.slice(idx + 1),
  };
}

export function summarizeQuestionFlow(
  request: QuestionFlowRequest,
  response: QuestionFlowResponse,
): string {
  const parts: string[] = [];
  for (const step of request.steps) {
    const picked = response.answers[step.id] ?? [];
    const labels = picked
      .map((id) => step.options.find((o) => o.id === id)?.label ?? id)
      .join(", ");
    parts.push(`${step.title}: ${labels || "(no answer)"}`);
  }
  return parts.join(" · ");
}
