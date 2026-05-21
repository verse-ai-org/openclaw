import { type FC } from "react";
import {
  ToolFallback,
  type ToolFallbackPartProps,
} from "@/components/chat/tools";
import {
  ToolCallGroup,
  type ToolCallGroupRunDuration,
  ToolCallGroupThinking,
} from "@/components/chat/ToolCallGroup";
import type { AssistantToolPart } from "@/components/chat/types";
import type { TurnUsageMeta } from "@/components/chat/usage/turn-usage-meta";

function getToolStatus(part: AssistantToolPart): ToolFallbackPartProps["status"] {
  if (part.isError) {
    return { type: "incomplete", reason: "error" };
  }
  if (part.result === undefined) {
    return { type: "running" };
  }
  return { type: "complete" };
}

function buildToolFallbackProps(part: AssistantToolPart): ToolFallbackPartProps {
  return {
    toolName: part.toolName,
    args: part.args,
    argsText: Object.keys(part.args).length > 0 ? JSON.stringify(part.args, null, 2) : undefined,
    result: part.result,
    isError: part.isError,
    status: getToolStatus(part),
  };
}

export const AssistantToolGroup: FC<{
  toolParts: AssistantToolPart[];
  showThinking?: boolean;
  runDuration?: ToolCallGroupRunDuration;
  usageMeta?: TurnUsageMeta | null;
}> = ({ toolParts, showThinking, runDuration, usageMeta }) => {
  if (toolParts.length === 0) {
    return showThinking ? <ToolCallGroupThinking /> : null;
  }

  return (
    <ToolCallGroup
      startIndex={0}
      endIndex={toolParts.length - 1}
      runDuration={runDuration}
      usageMeta={usageMeta}
    >
      {toolParts.map((part) => (
        <ToolFallback key={part.toolCallId} {...buildToolFallbackProps(part)} />
      ))}
    </ToolCallGroup>
  );
};
