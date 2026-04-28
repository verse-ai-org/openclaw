import { type FC } from "react";
import {
  ToolFallback,
  type ToolFallbackPartProps,
  type ToolFallbackJsonObject,
} from "@/components/chat/tool-fallback";
import {
  resolveRichToolPresentation,
  type RichToolPresentation,
} from "@/components/chat/tool-fallback/rich-presentation";
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

type PromotionMode = "default" | "route_visual";

const PROMOTION_PRIORITY: Record<string, number> = {
  weather_widget: 100,
  chart: 90,
  item_carousel: 85,
  geo_map: 84,
  stats_display: 80,
  link_preview: 60,
};

const MAX_PROMOTED_TEXT_LENGTH = 400;
const MAX_PROMOTED_TOOL_COUNT = 20;
const MAX_PROMOTED_CANDIDATES = 2;
const MIN_PROMOTION_SCORE = 70;
const ROUTE_VISUAL_TOOL_NAMES = new Set(["item_carousel", "geo_map"]);

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

function detectPromotionMode(candidates: PromotionCandidate[]): PromotionMode {
  const hasRouteVisual = candidates.some((candidate) =>
    ROUTE_VISUAL_TOOL_NAMES.has(candidate.part.toolName),
  );
  return hasRouteVisual ? "route_visual" : "default";
}

function sortCandidatesByScore(candidates: PromotionCandidate[]): PromotionCandidate[] {
  return [...candidates].sort((a, b) => b.score - a.score);
}

export function resolvePromotedToolParts(
  toolParts: AssistantToolPart[],
  context: PromotedToolSelectionContext,
): AssistantToolPart[] {
  if (context.textContent.trim().length > MAX_PROMOTED_TEXT_LENGTH) {
    return [];
  }

  if (toolParts.length > MAX_PROMOTED_TOOL_COUNT) {
    return [];
  }

  const candidates = buildPromotionCandidates(toolParts);
  if (candidates.length === 0) {
    return [];
  }
  const mode = detectPromotionMode(candidates);
  const sorted = sortCandidatesByScore(candidates);

  if (mode === "route_visual") {
    const routeVisualCandidates = sorted.filter((candidate) =>
      ROUTE_VISUAL_TOOL_NAMES.has(candidate.part.toolName),
    );
    const selected = routeVisualCandidates
      .filter((candidate) => candidate.score >= MIN_PROMOTION_SCORE)
      .slice(0, MAX_PROMOTED_CANDIDATES)
      .map((candidate) => candidate.part);
    if (selected.length > 0) {
      return selected;
    }
  }

  const best = sorted[0];
  if (!best || best.score < MIN_PROMOTION_SCORE) {
    return [];
  }

  return [best.part];
}

export const PromotedToolResult: FC<{
  toolParts: AssistantToolPart[];
  textContent: string;
}> = ({ toolParts, textContent }) => {
  const promotedParts = resolvePromotedToolParts(toolParts, { textContent });
  if (promotedParts.length === 0) {
    return null;
  }

  return (
    <div className="my-2 space-y-2 overflow-hidden">
      {promotedParts.map((part) => {
        if (part.result === undefined) return null;
        const presentation = resolveRichToolPresentation(part.toolName, part.result, part.result);
        if (!presentation) return null;
        return <div key={part.toolCallId}>{presentation.content}</div>;
      })}
    </div>
  );
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
