import type {
  InteractionDowngradeRender,
  InteractionKeyboardGroup,
} from "../question-flow/downgrade.ts";
import type { OptionListRequest, OptionListResponse } from "./schema.ts";

export function renderOptionListDowngrade(
  request: OptionListRequest,
): InteractionDowngradeRender {
  const lines: string[] = [];
  if (request.title) lines.push(request.title);
  if (request.description) lines.push(request.description);
  const buttons = request.options
    .filter((opt) => !opt.disabled)
    .map((opt) => ({ label: opt.label, value: opt.id }));
  request.options.forEach((opt, idx) => {
    lines.push(
      `${idx + 1}. ${opt.label}${opt.description ? " - " + opt.description : ""}`,
    );
  });
  const group: InteractionKeyboardGroup = {
    title: request.title ?? "Select",
    buttons,
  };
  return { text: lines.join("\n"), keyboard: [group] };
}

export function parseOptionListDowngradeCallback(value: string): string {
  return value;
}

export function summarizeOptionList(
  request: OptionListRequest,
  response: OptionListResponse,
): string {
  const labels = response.selected
    .map((id) => request.options.find((o) => o.id === id)?.label ?? id)
    .join(", ");
  return `${request.title ?? "Selection"}: ${labels || "(none)"}`;
}
