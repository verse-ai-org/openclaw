import { useMessage } from "@assistant-ui/react";
import {
  ChevronDownIcon,
  ChevronUpIcon,
  ZapIcon,
  CheckIcon,
  LoaderIcon,
  XCircleIcon,
} from "lucide-react";
import { type FC, type PropsWithChildren, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { classifyTool, TOOL_CATEGORY_CONFIG } from "./ToolFallback";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type GroupStatus = "running" | "done" | "failed";

// Raw ToolCallMessagePart fields we need (no `status` field in the core type)
type RawToolPart = {
  type: "tool-call";
  toolName: string;
  result?: unknown;
  isError?: boolean;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Derive an individual tool's completion state from its part fields. */
function isPartComplete(part: RawToolPart): boolean {
  return part.result !== undefined;
}
function isPartError(part: RawToolPart): boolean {
  return part.isError === true;
}

/** Derive overall group status from the tool parts + message running state. */
function deriveGroupStatus(
  parts: RawToolPart[],
  messageIsRunning: boolean,
): { status: GroupStatus; failCount: number } {
  const failCount = parts.filter((p) => isPartError(p)).length;
  if (failCount > 0) return { status: "failed", failCount };

  const anyIncomplete = parts.some((p) => !isPartComplete(p) && !isPartError(p));
  if (anyIncomplete && messageIsRunning) return { status: "running", failCount: 0 };

  return { status: "done", failCount: 0 };
}

/** Collect up to maxIcons unique category configs from tool names. */
function buildIconStrip(
  toolNames: string[],
  maxIcons = 4,
): {
  configs: (typeof TOOL_CATEGORY_CONFIG)[keyof typeof TOOL_CATEGORY_CONFIG][];
  overflow: number;
} {
  const seen = new Set<string>();
  const configs: (typeof TOOL_CATEGORY_CONFIG)[keyof typeof TOOL_CATEGORY_CONFIG][] = [];

  for (const name of toolNames) {
    const cat = classifyTool(name);
    if (!seen.has(cat)) {
      seen.add(cat);
      configs.push(TOOL_CATEGORY_CONFIG[cat]);
    }
  }

  if (configs.length <= maxIcons) {
    return { configs, overflow: 0 };
  }
  return { configs: configs.slice(0, maxIcons), overflow: configs.length - maxIcons };
}

// ---------------------------------------------------------------------------
// Group status badge
// ---------------------------------------------------------------------------

const GroupStatusBadge: FC<{ status: GroupStatus; failCount: number }> = ({
  status,
  failCount,
}) => {
  if (status === "running") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
        <LoaderIcon className="size-3 animate-spin" />
        Running
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-medium text-destructive">
        <XCircleIcon className="size-3" />
        {failCount} failed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-green-500/10 px-2 py-0.5 text-[10px] font-medium text-green-600 dark:text-green-400">
      <CheckIcon className="size-3" />
      Done
    </span>
  );
};

// ---------------------------------------------------------------------------
// ToolCallGroup
//
// Designed to be used as the `ToolGroup` prop of `MessagePrimitive.Parts`.
// assistant-ui calls this component to wrap each consecutive run of tool-call
// parts, providing `startIndex`, `endIndex`, and pre-rendered `children`.
//
// Single tool call (startIndex === endIndex): render children as-is.
// Multiple tool calls: wrap in a collapsible container with a summary header.
// ---------------------------------------------------------------------------

export type ToolCallGroupProps = PropsWithChildren<{
  startIndex: number;
  endIndex: number;
}>;

export const ToolCallGroup: FC<ToolCallGroupProps> = ({ startIndex, endIndex, children }) => {
  const toolCount = endIndex - startIndex + 1;

  if (import.meta.env.DEV) {
    console.log(`[ToolCallGroup] startIndex=${startIndex} endIndex=${endIndex} toolCount=${toolCount}`);
  }

  // Single tool → no wrapper, preserve existing single-card UX
  if (toolCount <= 1) {
    return <>{children}</>;
  }

  return <ToolCallGroupMulti startIndex={startIndex} endIndex={endIndex} toolCount={toolCount}>{children}</ToolCallGroupMulti>;
};

// Inner component that can safely call hooks (only rendered for multiple tools)
const ToolCallGroupMulti: FC<PropsWithChildren<{ startIndex: number; endIndex: number; toolCount: number }>> = ({
  startIndex,
  endIndex,
  toolCount,
  children,
}) => {
  const message = useMessage();
  const messageIsRunning = (message as { status?: { type: string } }).status?.type === "running";

  // Extract raw tool parts from message content for header summary
  const rawContent = (message as { content?: unknown[] }).content ?? [];
  const toolParts = rawContent
    .slice(startIndex, endIndex + 1)
    .filter((p): p is RawToolPart => typeof p === "object" && p !== null && (p as RawToolPart).type === "tool-call");

  const toolNames = toolParts.map((p) => p.toolName ?? "");
  const { status: groupStatus, failCount } = deriveGroupStatus(toolParts, messageIsRunning ?? false);
  const { configs: iconConfigs, overflow } = buildIconStrip(toolNames);

  // Expand during streaming; auto-collapse when stream ends (unless user toggled)
  const [isExpanded, setIsExpanded] = useState(messageIsRunning ?? false);
  const userToggledRef = useRef(false);
  const prevRunningRef = useRef(messageIsRunning);

  useEffect(() => {
    const wasRunning = prevRunningRef.current;
    prevRunningRef.current = messageIsRunning;

    if (messageIsRunning && !wasRunning && !userToggledRef.current) {
      setIsExpanded(true);
      return;
    }
    if (!messageIsRunning && wasRunning && !userToggledRef.current) {
      setIsExpanded(false);
    }
  }, [messageIsRunning]);

  function handleToggle() {
    userToggledRef.current = true;
    setIsExpanded((prev) => !prev);
  }

  return (
    <div
      className={cn(
        "my-2 rounded-xl border bg-card text-sm transition-colors",
        groupStatus === "failed" ? "border-destructive/30" : "border-border",
      )}
    >
      {/* ── Header (always visible) ── */}
      <button
        type="button"
        onClick={handleToggle}
        className={cn(
          "flex w-full items-center gap-2.5 px-3 py-2.5 text-left",
          "transition-colors hover:bg-muted/50",
          isExpanded ? "rounded-t-xl" : "rounded-xl",
        )}
        aria-expanded={isExpanded}
      >
        {/* Lightning bolt icon */}
        <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-muted">
          <ZapIcon className="size-3.5 text-muted-foreground" />
        </span>

        {/* Count label */}
        <span className="text-[12px] font-semibold text-foreground">
          Used {toolCount} tool{toolCount === 1 ? "" : "s"}
        </span>

        {/* Category icon strip */}
        {iconConfigs.length > 0 && (
          <span className="flex items-center gap-1">
            {iconConfigs.map((cfg, i) => {
              const Icon = cfg.Icon;
              return (
                <span
                  key={i}
                  className={cn("flex size-5 items-center justify-center rounded", cfg.iconBg)}
                  title={cfg.actionLabel}
                >
                  <Icon className={cn("size-3", cfg.iconColor)} />
                </span>
              );
            })}
            {overflow > 0 && (
              <span className="text-[10px] font-medium text-muted-foreground">+{overflow}</span>
            )}
          </span>
        )}

        {/* Spacer */}
        <span className="flex-1" />

        {/* Group status badge */}
        <GroupStatusBadge status={groupStatus} failCount={failCount} />

        {/* Expand/collapse chevron */}
        <span className="ml-1 text-muted-foreground">
          {isExpanded ? (
            <ChevronUpIcon className="size-3.5" />
          ) : (
            <ChevronDownIcon className="size-3.5" />
          )}
        </span>
      </button>

      {/* ── Expanded card list ── */}
      {isExpanded && <div className="border-t px-2 pb-2 pt-1">{children}</div>}
    </div>
  );
};
