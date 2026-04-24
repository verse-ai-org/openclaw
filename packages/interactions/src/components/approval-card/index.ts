import type { InteractionComponentManifest } from "../../types.ts";
import { APPROVAL_CARD_DESCRIPTION } from "./description.ts";
import {
  renderApprovalCardDowngrade,
  summarizeApprovalCard,
  parseApprovalCardDowngradeCallback,
} from "./downgrade.ts";
import {
  ApprovalCardRequestSchema,
  ApprovalCardResponseSchema,
  type ApprovalCardRequest,
  type ApprovalCardResponse,
} from "./schema.ts";

export const APPROVAL_CARD_MANIFEST: InteractionComponentManifest<
  ApprovalCardRequest,
  ApprovalCardResponse
> = {
  name: "approval_card",
  schemaVersion: 1,
  requestSchema: ApprovalCardRequestSchema,
  responseSchema: ApprovalCardResponseSchema,
  description: APPROVAL_CARD_DESCRIPTION,
  summarize: summarizeApprovalCard,
  exampleRequest: {
    id: "approval-delete-workflow",
    title: "Delete current workflow?",
    description: "This action removes deployment history and cannot be undone.",
    variant: "destructive",
    confirmLabel: "Delete",
    cancelLabel: "Keep",
  },
  exampleResponse: { decision: "approved" },
};

export {
  APPROVAL_CARD_DESCRIPTION,
  renderApprovalCardDowngrade,
  parseApprovalCardDowngradeCallback,
  summarizeApprovalCard,
};
export { ApprovalCardRequestSchema, ApprovalCardResponseSchema } from "./schema.ts";
export type { ApprovalCardRequest, ApprovalCardResponse } from "./schema.ts";
