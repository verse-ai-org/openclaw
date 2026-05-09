import type { ToolUiComponent } from "@/components/chat/types";

/**
 * Mapping of gateway tool names → chat UI components.
 *
 * This is intentionally "pure data" so both adapters and renderers can share it.
 */
export const UI_TOOL_MANIFEST: Record<ToolUiComponent, { toolNames: string[] }> = {
  // Phase B: seed with legacy interactive tools.
  question_flow: { toolNames: ["question_flow"] },
  option_list: { toolNames: ["option_list"] },
  approval_card: { toolNames: ["approval_card"] },

  // Phase C/D: additional Tool UI surfaces (non-interactive).
  chart: { toolNames: ["chart"] },
  stats_display: { toolNames: ["stats_display"] },
  link_preview: { toolNames: ["link_preview"] },
  terminal: { toolNames: ["terminal"] },
  code_block: { toolNames: ["code_block"] },
  item_carousel: { toolNames: ["item_carousel"] },
  geo_map: { toolNames: ["geo_map"] },
};

