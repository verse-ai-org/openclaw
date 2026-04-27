/**
 * question_flow — Control UI structured questionnaire tool.
 *
 * The LLM provides the question flow config as parameters, the tool validates
 * against the canonical schema, returns an `interaction-pending` result, and
 * the Control UI frontend renders it as an interactive multi-step form.
 *
 * When the user completes the form, their answers arrive as a new chat
 * message with structured metadata in `metadata.interaction`.
 */
import { QUESTION_FLOW_MANIFEST } from "@openclaw/interactions";
import { Type } from "@sinclair/typebox";
import { type AnyAgentTool, ToolInputError, interactionPendingResult } from "./common.js";

const OptionSchema = Type.Object({
  id: Type.String({ description: "Option value key (e.g. 'economy', 'mid-range')." }),
  label: Type.String({ description: "Option display label shown to the user." }),
  description: Type.Optional(Type.String({ description: "Optional subtext below the label." })),
  disabled: Type.Optional(Type.Boolean({ description: "Set true to make the option unselectable." })),
});

const StepSchema = Type.Object({
  id: Type.String({ description: "Step ID, unique within the flow (e.g. 'budget', 'pace')." }),
  title: Type.String({ description: "Step heading shown to the user." }),
  description: Type.Optional(Type.String({ description: "Optional subtext below the heading." })),
  options: Type.Array(OptionSchema, { description: "Selectable choices for this step.", minItems: 1 }),
  selectionMode: Type.Optional(
    Type.String({ description: "'single' (default) or 'multi' to allow multiple selections." }),
  ),
});

const ParametersSchema = Type.Object({
  id: Type.String({
    description:
      "Unique stable ID for this question flow instance (e.g. 'travel-preference-intake'). " +
      "Used to identify the form across re-renders.",
  }),
  steps: Type.Array(StepSchema, {
    description:
      "All steps shown upfront. Each step is one selection question. " +
      "The user completes all steps before submitting. " +
      "Answers arrive as a new message: 'step.title：selected.label' per line.",
    minItems: 1,
  }),
});

export function createQuestionFlowTool(): AnyAgentTool {
  return {
    label: "Question Flow",
    name: "question_flow",
    description:
      "Render an interactive multi-step questionnaire card in the Control UI. " +
      "Use this instead of asking questions in plain text when you need to collect " +
      "multiple structured answers (e.g. preference intake, onboarding). " +
      "The user sees a form with all steps upfront, selects options, and submits. " +
      "Their structured answers arrive in the next user message's metadata.interaction field. " +
      "After calling this tool, STOP and wait for the user's response — do not continue. " +
      "Only available in Control UI sessions (sender label: openclaw-control-ui).",
    parameters: ParametersSchema,
    execute: async (_toolCallId, args) => {
      const parsed = QUESTION_FLOW_MANIFEST.requestSchema.safeParse(args);
      if (!parsed.success) {
        throw new ToolInputError(
          `question_flow schema validation failed: ${parsed.error.issues
            .map((issue) => `${issue.path.join(".") || "$"} ${issue.message}`)
            .join("; ")}`,
        );
      }
      return interactionPendingResult("question_flow", parsed.data);
    },
  };
}
