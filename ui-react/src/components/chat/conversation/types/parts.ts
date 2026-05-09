import type { PartId } from "./ids";

export type ToolPartStatus = "running" | "result" | "error";

export type TextPart = { type: "text"; id: PartId; text: string };

export type ToolPart = {
  type: "tool";
  id: PartId;
  toolName: string;
  args?: unknown;
  /**
   * Optional UI presentation for this tool call.
   * When present, the tool should be rendered as an interactive card.
   */
  ui?: { kind: string; payload: unknown };
  status: ToolPartStatus;
  output?: unknown;
  error?: string;
};

export type ChatPart = TextPart | ToolPart;

