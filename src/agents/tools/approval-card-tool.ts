/**
 * approval_card — Control UI explicit approval/deny card.
 */
import { APPROVAL_CARD_MANIFEST } from "@openclaw/interactions";
import { Type } from "@sinclair/typebox";
import { stringEnum } from "../schema/typebox.js";
import { type AnyAgentTool, ToolInputError, interactionPendingResult } from "./common.js";

const ParametersSchema = Type.Object({
  id: Type.String({
    description:
      "Unique stable ID for this approval card instance (e.g. 'approve-delete-workflow').",
  }),
  title: Type.String({
    description: "Approval title shown to the user.",
  }),
  description: Type.Optional(Type.String({ description: "Optional details/context." })),
  icon: Type.Optional(Type.String({ description: "Optional icon hint string." })),
  metadata: Type.Optional(
    Type.Array(
      Type.Object({
        key: Type.String(),
        value: Type.String(),
      }),
      { minItems: 1 },
    ),
  ),
  variant: Type.Optional(
    stringEnum(["default", "destructive"] as const),
  ),
  confirmLabel: Type.Optional(Type.String({ description: "Approve button label." })),
  cancelLabel: Type.Optional(Type.String({ description: "Deny button label." })),
});

export function createApprovalCardTool(): AnyAgentTool {
  return {
    label: "Approval Card",
    name: "approval_card",
    description:
      "Render an explicit approve/deny confirmation card in Control UI. " +
      "Use when user confirmation is required before a sensitive action. " +
      "The user's decision (approved/denied) arrives in the next user message's " +
      "metadata.interaction field. " +
      "After calling this tool, STOP and wait for the user's response — do not continue.",
    parameters: ParametersSchema,
    execute: async (_toolCallId, args) => {
      const parsed = APPROVAL_CARD_MANIFEST.requestSchema.safeParse(args);
      if (!parsed.success) {
        throw new ToolInputError(
          `approval_card schema validation failed: ${parsed.error.issues
            .map((issue) => `${issue.path.join(".") || "$"} ${issue.message}`)
            .join("; ")}`,
        );
      }
      return interactionPendingResult("approval_card", parsed.data);
    },
  };
}
