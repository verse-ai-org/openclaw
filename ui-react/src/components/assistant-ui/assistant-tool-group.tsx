import { type FC } from "react";
import { ToolCallGroup } from "@/components/chat/ToolCallGroup";
import {
  ToolFallback,
  type ToolFallbackPartProps,
  type ToolFallbackJsonObject,
} from "@/components/chat/ToolFallback";

export type AssistantToolPart = {
  toolCallId: string;
  toolName: string;
  args: ToolFallbackJsonObject;
  result?: string;
  isError?: boolean;
};

function getToolStatus(part: AssistantToolPart): ToolFallbackPartProps["status"] {
  if (part.result === undefined) {
    return { type: "running" };
  }
  if (part.isError) {
    return { type: "incomplete", reason: "error" };
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

export const AssistantToolGroup: FC<{ toolParts: AssistantToolPart[] }> = ({ toolParts }) => {
  if (toolParts.length === 0) {
    return null;
  }

  return (
    <ToolCallGroup startIndex={0} endIndex={toolParts.length - 1}>
      {toolParts.map((part) => (
        <ToolFallback key={part.toolCallId} {...buildToolFallbackProps(part)} />
      ))}
    </ToolCallGroup>
  );
};
