/**
 * option_list — Control UI single-step option picker tool.
 *
 * Passthrough tool: the LLM provides the option list config as parameters,
 * the tool returns it as JSON, and the Control UI renders an interactive
 * option card (InteractiveCardArea).
 *
 * When the user confirms their selection, it arrives as a new chat message
 * with the selected option labels joined by "、".
 */
import { Type } from "@sinclair/typebox";
import { type AnyAgentTool, jsonResult } from "./common.js";

const OptionSchema = Type.Object({
  id: Type.String({ description: "Option value key (e.g. 'search', 'xhs')." }),
  label: Type.String({ description: "Option display label shown to the user." }),
  description: Type.Optional(Type.String({ description: "Optional subtext below the label." })),
  disabled: Type.Optional(Type.Boolean({ description: "Set true to make the option unselectable." })),
});

const ParametersSchema = Type.Object({
  id: Type.String({
    description:
      "Unique stable ID for this option list instance (e.g. 'route-platform-choice'). " +
      "Used to identify the picker in the conversation.",
  }),
  options: Type.Array(OptionSchema, {
    description: "Selectable choices. The user picks one (or more if selectionMode=multi).",
    minItems: 1,
  }),
  selectionMode: Type.Optional(
    Type.String({
      description:
        "'single' (default) — user picks exactly one option. " +
        "'multi' — user picks one or more options. " +
        "When the user confirms, their answer arrives as a new chat message " +
        "with selected labels joined by '、'.",
    }),
  ),
});

export function createOptionListTool(): AnyAgentTool {
  return {
    label: "Option List",
    name: "option_list",
    description:
      "Render an interactive single-step option picker card in the Control UI. " +
      "Use this instead of plain text when you need the user to choose from a short list " +
      "(e.g. select platform, confirm route). " +
      "The user selects option(s) and confirms; their answer arrives as a new chat message " +
      "with the selected labels joined by '、'. " +
      "Only available in Control UI sessions (sender label: openclaw-control-ui).",
    parameters: ParametersSchema,
    // Passthrough: return the config as JSON; the frontend maps tool name → UI component.
    execute: async (_toolCallId, args) => jsonResult(args),
  };
}
