/**
 * question_flow — Control UI structured questionnaire tool.
 *
 * This is a passthrough tool: the LLM provides the question flow config
 * as parameters, the tool returns it as JSON, and the Control UI frontend
 * renders it as an interactive multi-step form (InteractiveCardArea).
 *
 * When the user completes the form, their answers arrive as a new chat
 * message in the format: "步骤标题：选中选项标签\n步骤标题：选中选项标签"
 */
import { Type } from "@sinclair/typebox";
import { type AnyAgentTool, jsonResult } from "./common.js";

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
      "Their answers arrive as a new chat message formatted as 'step.title：selected.label' per line. " +
      "Only available in Control UI sessions (sender label: openclaw-control-ui).",
    parameters: ParametersSchema,
    // Passthrough: return the config as JSON; the frontend maps tool name → UI component.
    execute: async (_toolCallId, args) => jsonResult(args),
  };
}
