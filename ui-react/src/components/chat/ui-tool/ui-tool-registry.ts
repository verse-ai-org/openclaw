import { safeParseSerializableQuestionFlow } from "@/components/tool-ui/question-flow/schema";
import { safeParseSerializableOptionList } from "@/components/tool-ui/option-list/schema";
import { safeParseSerializableApprovalCard } from "@/components/tool-ui/approval-card/schema";
import { safeParseSerializableChart } from "@/components/tool-ui/chart/schema";
import { safeParseSerializableStatsDisplay } from "@/components/tool-ui/stats-display/schema";
import { safeParseSerializableLinkPreview } from "@/components/tool-ui/link-preview/schema";
import { safeParseSerializableTerminal } from "@/components/tool-ui/terminal/schema";
import { safeParseSerializableCodeBlock } from "@/components/tool-ui/code-block/schema";
import { safeParseSerializableItemCarousel } from "@/components/tool-ui/item-carousel/schema";
import { safeParseSerializableGeoMap } from "@/components/tool-ui/geo-map/schema";
import type { ToolUiComponent, UiToolContentBlock } from "@/components/chat/types";
import { UI_TOOL_MANIFEST } from "./ui-tool-manifest";

const TOOL_NAME_TO_COMPONENT = new Map<string, ToolUiComponent>(
  Object.entries(UI_TOOL_MANIFEST).flatMap(([component, { toolNames }]) =>
    toolNames.map((toolName) => [toolName, component as ToolUiComponent] as const),
  ),
);

export function resolveToolUiComponent(
  toolName: string | undefined,
): ToolUiComponent | null {
  if (!toolName) return null;
  return TOOL_NAME_TO_COMPONENT.get(toolName) ?? null;
}

function parseJsonish(input: unknown): unknown | null {
  if (typeof input !== "string") return input;
  try {
    return JSON.parse(input) as unknown;
  } catch {
    return null;
  }
}

export function safeParseToolUiPayload(
  component: ToolUiComponent | null,
  payload: unknown,
): unknown | null {
  if (!component) return null;
  const parsed = parseJsonish(payload);
  if (parsed == null) return null;

  // Phase B: seed parsers with legacy interactive tools.
  if (component === "question_flow") return safeParseSerializableQuestionFlow(parsed);
  if (component === "option_list") return safeParseSerializableOptionList(parsed);
  if (component === "approval_card") return safeParseSerializableApprovalCard(parsed);

  // Phase C/D: additional Tool UI surfaces (non-interactive).
  if (component === "chart") return safeParseSerializableChart(parsed);
  if (component === "stats_display") return safeParseSerializableStatsDisplay(parsed);
  if (component === "link_preview") return safeParseSerializableLinkPreview(parsed);
  if (component === "terminal") return safeParseSerializableTerminal(parsed);
  if (component === "code_block") return safeParseSerializableCodeBlock(parsed);
  if (component === "item_carousel") return safeParseSerializableItemCarousel(parsed);
  if (component === "geo_map") return safeParseSerializableGeoMap(parsed);

  return null;
}

/**
 * Best-effort builder for a `ContentBlock(type="ui")` from a tool result payload.
 *
 * This is not used by the UI yet; it's a shared adapter helper for later phases.
 */
export function tryCreateUiToolBlock(args: {
  uiId: string;
  toolName: string | undefined;
  payload: unknown;
}): UiToolContentBlock | null {
  const component = resolveToolUiComponent(args.toolName);
  if (!component) return null;
  const parsed = safeParseToolUiPayload(component, args.payload);
  if (!parsed) return null;
  return {
    type: "ui",
    uiId: args.uiId,
    component,
    payload: parsed,
  };
}
