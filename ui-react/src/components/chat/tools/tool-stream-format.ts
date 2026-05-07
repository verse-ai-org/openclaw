import type { ToolStreamPhase } from "@/components/chat/types";

/**
 * Serialize tool output / error for tool-call cards (streaming row + history).
 */
export function formatToolStreamOutput(
  output: unknown,
  error: string | undefined,
  phase: ToolStreamPhase,
): string | undefined {
  if (typeof output === "string") {
    return output;
  }
  if (output != null) {
    try {
      return JSON.stringify(output, null, 2);
    } catch {
      return String(output);
    }
  }
  if (phase === "error" && typeof error === "string" && error.trim()) {
    return error;
  }
  return undefined;
}
