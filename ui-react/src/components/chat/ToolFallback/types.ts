import type { ElementType } from "react";

export type ToolStatus = "running" | "complete" | "incomplete";

export interface ToolCategoryConfig {
  Icon: ElementType;
  iconBg: string;
  iconColor: string;
  borderAccent: string;
  actionLabel: string;
}
