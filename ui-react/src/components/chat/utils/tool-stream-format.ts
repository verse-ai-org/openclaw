import type { ToolStreamEntry } from "@/components/chat/types";

/** Text shown on tool-call cards (streaming finalize + live row). */
export function toolStreamEntryToResultText(
  entry: ToolStreamEntry,
): string | undefined {
  if (typeof entry.output === "string") {
    return entry.output;
  }
  if (entry.output != null) {
    try {
      return JSON.stringify(entry.output, null, 2);
    } catch {
      return String(entry.output);
    }
  }
  if (
    entry.phase === "error" &&
    typeof entry.error === "string" &&
    entry.error.trim()
  ) {
    return entry.error;
  }
  return undefined;
}
