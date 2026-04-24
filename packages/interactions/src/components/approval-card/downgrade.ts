import type { InteractionDowngradeRender } from "../question-flow/downgrade.ts";
import type { ApprovalCardRequest, ApprovalCardResponse } from "./schema.ts";

export function renderApprovalCardDowngrade(
  request: ApprovalCardRequest,
): InteractionDowngradeRender {
  const lines: string[] = [request.title];
  if (request.description) {
    lines.push(request.description);
  }
  if (request.metadata && request.metadata.length > 0) {
    lines.push("");
    for (const item of request.metadata) {
      lines.push(`- ${item.key}: ${item.value}`);
    }
  }
  lines.push("");
  lines.push(`1. ${request.confirmLabel ?? "Approve"}`);
  lines.push(`2. ${request.cancelLabel ?? "Deny"}`);

  return {
    text: lines.join("\n"),
    keyboard: [
      {
        title: request.title,
        buttons: [
          { label: request.confirmLabel ?? "Approve", value: "approved" },
          { label: request.cancelLabel ?? "Deny", value: "denied" },
        ],
      },
    ],
  };
}

export function parseApprovalCardDowngradeCallback(
  value: string,
): ApprovalCardResponse["decision"] | null {
  if (value === "approved" || value === "denied") {
    return value;
  }
  return null;
}

export function summarizeApprovalCard(
  request: ApprovalCardRequest,
  response: ApprovalCardResponse,
): string {
  const decision = response.decision === "approved" ? "approved" : "denied";
  return `${request.title}: ${decision}`;
}
