import type {
  ContentBlock,
  InteractiveContentBlock,
  InteractiveSummaryPair,
  ToolStreamEntry,
} from "@/store/chat.store";

/** Client-only live run assembly (Gateway `chat` delta + `agent` tool/lifecycle). */
export type RunProjectionState = {
  /** Latest cumulative assistant plain text from `chat` state=delta (same as former `stream`). */
  liveCumulativeText: string | null;
  /** Text segments frozen before tool/interactive cards (same as former `committedBlocks`). */
  committedBlocks: ContentBlock[];
  toolStreamById: Map<string, ToolStreamEntry>;
  toolStreamOrder: string[];
  interactiveStreamById: Map<string, InteractiveContentBlock>;
  interactiveStreamOrder: string[];
  interactiveSummaryById: Record<string, InteractiveSummaryPair[]>;
};

export type RunProjectionAction =
  | { type: "CHAT_DELTA"; text: string }
  | { type: "COMMIT_CURRENT_TEXT" }
  | { type: "UPSERT_TOOL_STREAM"; entry: ToolStreamEntry }
  | { type: "UPSERT_INTERACTIVE_STREAM"; entry: InteractiveContentBlock }
  | {
      type: "SET_INTERACTIVE_SUMMARY";
      interactiveId: string;
      pairs: InteractiveSummaryPair[];
    }
  | { type: "CLEAR_INTERACTIVE_SUMMARY"; interactiveId: string }
  | { type: "RESET" };
