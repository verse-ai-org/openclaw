import { safeParseSerializableQuestionFlow } from "@/components/tool-ui/question-flow/schema";
import { safeParseSerializableOptionList } from "@/components/tool-ui/option-list/schema";
import type { InteractiveContentBlock, InteractiveKind } from "@/store/chat.store";

export function isInteractiveToolName(toolName: string | undefined): toolName is InteractiveKind {
  return toolName === "question_flow" || toolName === "option_list";
}

export function parseInteractivePayload(
  toolName: string | undefined,
  payload: unknown,
): InteractiveContentBlock["payload"] | null {
  if (!isInteractiveToolName(toolName)) {
    return null;
  }

  const parsed =
    typeof payload === "string"
      ? (() => {
          try {
            return JSON.parse(payload) as unknown;
          } catch {
            return null;
          }
        })()
      : payload;

  if (parsed == null) {
    return null;
  }

  if (toolName === "question_flow") {
    return safeParseSerializableQuestionFlow(parsed);
  }

  return safeParseSerializableOptionList(parsed);
}

export function createInteractiveBlock(args: {
  interactiveId: string;
  kind: InteractiveKind;
  payload: unknown;
}): InteractiveContentBlock | null {
  const parsed = parseInteractivePayload(args.kind, args.payload);
  if (!parsed) {
    return null;
  }

  return {
    type: "interactive",
    interactiveId: args.interactiveId,
    kind: args.kind,
    payload: parsed,
  };
}
