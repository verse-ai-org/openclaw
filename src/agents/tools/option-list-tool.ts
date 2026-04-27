/**
 * option_list — Control UI single-step option picker tool.
 *
 * The LLM provides the option list config as parameters, the tool validates
 * against the canonical schema, returns an `interaction-pending` result, and
 * the Control UI renders an interactive option card.
 *
 * When the user confirms their selection, their structured answer arrives
 * in the next user message's metadata.interaction field.
 */
import { OPTION_LIST_MANIFEST } from "@openclaw/interactions";
import { Type } from "@sinclair/typebox";
import { type AnyAgentTool, ToolInputError, interactionPendingResult } from "./common.js";

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
        "When the user confirms, their structured answer arrives in the next " +
        "user message's metadata.interaction field.",
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
      "The user selects option(s) and confirms; their structured answer arrives in the next " +
      "user message's metadata.interaction field. " +
      "After calling this tool, STOP and wait for the user's response — do not continue. " +
      "Only available in Control UI sessions (sender label: openclaw-control-ui).",
    parameters: ParametersSchema,
    execute: async (_toolCallId, args) => {
      const parsed = OPTION_LIST_MANIFEST.requestSchema.safeParse(args);
      if (!parsed.success) {
        throw new ToolInputError(
          `option_list schema validation failed: ${parsed.error.issues
            .map((issue) => `${issue.path.join(".") || "$"} ${issue.message}`)
            .join("; ")}`,
        );
      }
      return interactionPendingResult("option_list", parsed.data);
    },
  };
}
