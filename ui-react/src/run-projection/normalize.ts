import type {
  InteractiveContentBlock,
  ToolStreamEntry,
} from "@/store/chat.store";
import type { RunProjectionAction } from "./types";

/** Map Gateway `chat` delta text into a projection action. */
export function chatDeltaToAction(text: string): RunProjectionAction {
  return { type: "CHAT_DELTA", text };
}

export function commitCurrentTextAction(): RunProjectionAction {
  return { type: "COMMIT_CURRENT_TEXT" };
}

export function upsertToolStreamAction(entry: ToolStreamEntry): RunProjectionAction {
  return { type: "UPSERT_TOOL_STREAM", entry };
}

export function upsertInteractiveStreamAction(
  entry: InteractiveContentBlock,
): RunProjectionAction {
  return { type: "UPSERT_INTERACTIVE_STREAM", entry };
}
