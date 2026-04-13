import { type FC } from "react";
import {
  ToolFallback,
  type ToolFallbackPartProps,
  type ToolFallbackJsonObject,
} from "@/components/chat/ToolFallback";
import {
  resolveRichToolPresentation,
  type RichToolPresentation,
} from "@/components/chat/tool-rich-presentation";
import { ToolCallGroup } from "@/components/chat/ToolCallGroup";

export type AssistantToolPart = {
  toolCallId: string;
  toolName: string;
  args: ToolFallbackJsonObject;
  result?: string;
  isError?: boolean;
};

export type PromotedToolSelectionContext = {
  textContent: string;
};

type PromotionCandidate = {
  part: AssistantToolPart;
  presentation: RichToolPresentation;
  score: number;
};

const PROMOTION_PRIORITY: Record<string, number> = {
  weather_widget: 100,
  chart: 90,
  stats_display: 80,
  link_preview: 60,
};

const MAX_PROMOTED_TEXT_LENGTH = 400;
const MAX_PROMOTED_TOOL_COUNT = 8;
const MAX_PROMOTED_CANDIDATES = 2;
const MIN_PROMOTION_SCORE = 70;

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

function buildPromotionCandidates(toolParts: AssistantToolPart[]): PromotionCandidate[] {
  const candidates: PromotionCandidate[] = [];

  for (let i = 0; i < toolParts.length; i++) {
    const part = toolParts[i];
    if (!part || part.result === undefined || part.isError) {
      continue;
    }

    const presentation = resolveRichToolPresentation(part.toolName, part.result, part.result);
    if (!presentation?.canPromote) {
      continue;
    }

    const basePriority = PROMOTION_PRIORITY[part.toolName] ?? 0;
    const distanceFromEnd = toolParts.length - 1 - i;
    const recencyBonus = Math.max(0, 10 - distanceFromEnd * 5);
    const score = basePriority + recencyBonus;

    candidates.push({ part, presentation, score });
  }

  return candidates;
}

export function resolvePromotedToolPart(
  toolParts: AssistantToolPart[],
  context: PromotedToolSelectionContext,
): AssistantToolPart | null {
  if (context.textContent.trim().length > MAX_PROMOTED_TEXT_LENGTH) {
    return null;
  }

  if (toolParts.length > MAX_PROMOTED_TOOL_COUNT) {
    return null;
  }

  const candidates = buildPromotionCandidates(toolParts);
  if (candidates.length === 0 || candidates.length > MAX_PROMOTED_CANDIDATES) {
    return null;
  }

  let best: PromotionCandidate | null = null;
  for (const candidate of candidates) {
    if (!best || candidate.score > best.score) {
      best = candidate;
    }
  }

  if (!best || best.score < MIN_PROMOTION_SCORE) {
    return null;
  }

  return best.part;
}

export const PromotedToolResult: FC<{
  toolParts: AssistantToolPart[];
  textContent: string;
}> = ({ toolParts, textContent }) => {
  const promoted = resolvePromotedToolPart(toolParts, { textContent });
  if (!promoted || promoted.result === undefined) {
    return null;
  }

  const presentation = resolveRichToolPresentation(
    promoted.toolName,
    promoted.result,
    promoted.result,
  );

  if (!presentation) {
    return null;
  }

  return <div className="my-2 overflow-hidden">{presentation.content}</div>;
};

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
