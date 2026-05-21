import { useAuiState } from "@assistant-ui/react";
import {
  AlertCircleIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ZapIcon,
  CheckCircle2Icon,
  LoaderIcon
} from "lucide-react";
import { type FC, type PropsWithChildren, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
// import { classifyTool, TOOL_CATEGORY_CONFIG } from "./tools";
import { sliceToolCallParts } from "@/components/chat/adapters/assistant-ui";
import {
  formatTurnUsageHeaderLine,
  type TurnUsageMeta,
} from "@/components/chat/usage/turn-usage-meta";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type GroupStatus = "running" | "done" | "done_partial" | "failed";

import type { AssistantToolPart } from "@/components/chat/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Derive an individual tool's completion state from its part fields. */
function isPartComplete(part: AssistantToolPart): boolean {
  return part.result !== undefined;
}
function isPartError(part: AssistantToolPart): boolean {
  return part.isError === true;
}

/**
 * Derive overall group status from the tool parts + message running state.
 *
 * Product rule: some tools failing is a **reminder** on the group header (amber), not a red
 * “whole group failed” state. Red `failed` is reserved for abnormal persisted state (stuck
 * incomplete parts). After the assistant message ends, partial failures stay visible as
 * `done_partial` (amber) so the reminder persists in history.
 */
function deriveGroupStatus(
  parts: AssistantToolPart[],
  messageIsRunning: boolean,
): { status: GroupStatus; failCount: number } {
  const explicitFailCount = parts.filter((p) => isPartError(p)).length;
  const anyIncomplete = parts.some((p) => !isPartComplete(p) && !isPartError(p));

  // While the assistant message is still running, keep group status as Running even if
  // some tools already failed. We still surface failCount in the running badge.
  if (messageIsRunning) {
    return { status: "running", failCount: explicitFailCount };
  }

  if (anyIncomplete) {
    // Persisted / odd states: missing results without an active run
    return {
      status: "failed",
      failCount: parts.filter((p) => !isPartComplete(p) && !isPartError(p)).length,
    };
  }

  // All parts settled (result or error): group run is complete; surface tool errors as warning, not whole-group failure.
  if (explicitFailCount > 0) {
    return { status: "done_partial", failCount: explicitFailCount };
  }

  return { status: "done", failCount: 0 };
}

/** Wall-clock run length for display (whole run, not per-tool). */
export function formatRunDuration(ms: number, opts?: { live?: boolean }): string {
  if (!Number.isFinite(ms) || ms < 0) return "";
  if (opts?.live && ms < 60_000) {
    const sec = Math.max(0, Math.ceil(ms / 1000));
    return `${sec}s`;
  }
  if (ms < 1000) return "<1s";
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1000);
  return `${m}m ${s}s`;
}

/** Collect up to maxIcons unique category configs from tool names. */
// function buildIconStrip(
//   toolNames: string[],
//   maxIcons = 4,
// ): {
//   configs: (typeof TOOL_CATEGORY_CONFIG)[keyof typeof TOOL_CATEGORY_CONFIG][];
//   overflow: number;
// } {
//   const seen = new Set<string>();
//   const configs: (typeof TOOL_CATEGORY_CONFIG)[keyof typeof TOOL_CATEGORY_CONFIG][] = [];

//   for (const name of toolNames) {
//     const cat = classifyTool(name);
//     if (!seen.has(cat)) {
//       seen.add(cat);
//       configs.push(TOOL_CATEGORY_CONFIG[cat]);
//     }
//   }

//   if (configs.length <= maxIcons) {
//     return { configs, overflow: 0 };
//   }
//   return { configs: configs.slice(0, maxIcons), overflow: configs.length - maxIcons };
// }

// ---------------------------------------------------------------------------
// Group status badge
// ---------------------------------------------------------------------------

const GroupStatusBadge: FC<{ status: GroupStatus; failCount: number }> = ({
  status,
  failCount,
}) => {
  if (status === "running") {
    const runningReminder =
      failCount === 1
        ? "Running · 1 tool needs attention"
        : `Running · ${failCount} tools need attention`;
    return (
      <span
        className="inline-flex items-center gap-1 text-muted-foreground"
        aria-label={failCount > 0 ? runningReminder : "Running"}
        title={failCount > 0 ? runningReminder : "Running"}
      >
        <LoaderIcon className="size-3 animate-spin" />
        {failCount > 0 && (
          <AlertCircleIcon
            className="size-3 shrink-0 text-amber-600 dark:text-amber-400"
            aria-hidden
          />
        )}
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span
        className="inline-flex items-center text-destructive"
        aria-label={`${failCount} failed`}
        title={`${failCount} failed`}
      >
        {/* <XCircleIcon className="size-3" /> */}
        <AlertCircleIcon
            className="size-3 shrink-0 text-amber-600 dark:text-amber-400"
            aria-hidden
          />
      </span>
    );
  }
  if (status === "done_partial") {
    const label =
      failCount === 1
        ? "Finished · 1 tool needs attention"
        : `Finished · ${failCount} tools need attention`;
    return (
      <span
        className="inline-flex items-center text-amber-600 dark:text-amber-400"
        aria-label={label}
        title={label}
      >
        <CheckCircle2Icon className="size-3" />
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center text-green-600 dark:text-green-400"
      aria-label="Done"
      title="Done"
    >
      <CheckCircle2Icon className="size-3" />
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
// One or more tool calls: collapsible container with summary header + children.
// ---------------------------------------------------------------------------

export type ToolCallGroupRunDuration =
  | { kind: "live"; startedAt: number }
  | { kind: "done"; ms: number };

export type ToolCallGroupProps = PropsWithChildren<{
  startIndex: number;
  endIndex: number;
  /** Whole-run wall time: live elapsed while run is in progress, or fixed when completed. */
  runDuration?: ToolCallGroupRunDuration;
  /** Per-run token/cost summary (from gateway history). */
  usageMeta?: TurnUsageMeta | null;
}>;

export const ToolCallGroup: FC<ToolCallGroupProps> = ({
  startIndex,
  endIndex,
  runDuration,
  usageMeta,
  children,
}) => {
  const toolCount = endIndex - startIndex + 1;

  return (
    <ToolCallGroupInner
      startIndex={startIndex}
      endIndex={endIndex}
      toolCount={toolCount}
      runDuration={runDuration}
      usageMeta={usageMeta}
    >
      {children}
    </ToolCallGroupInner>
  );
};

export const ToolCallGroupThinking: FC = () => {
  return (
    <div className="mb-2 bg-transparent text-sm">
      <div className="flex w-full items-center gap-2 px-3 py-2 text-left text-muted-foreground">
        <ZapIcon className="size-3.5 shrink-0 text-muted-foreground/80" />
        <span className="text-[12px] font-medium">Thinking…</span>
        {/* <span className="flex-1" /> */}
        <span aria-label="Thinking" title="Thinking">
          <LoaderIcon className="size-3 animate-spin" aria-hidden />
        </span>
      </div>
    </div>
  );
};

const ToolCallGroupInner: FC<
  PropsWithChildren<{
    startIndex: number;
    endIndex: number;
    toolCount: number;
    runDuration?: ToolCallGroupRunDuration;
    usageMeta?: TurnUsageMeta | null;
  }>
> = ({ startIndex, endIndex, toolCount, runDuration, usageMeta, children }) => {
  const messageIsRunning = useAuiState((s) => s.message.status?.type === "running");
  const rawContent = useAuiState((s) => s.message.content as unknown) as readonly unknown[] | undefined;
  // Extract raw tool parts from message content for header summary
  const toolParts = sliceToolCallParts(rawContent, startIndex, endIndex);
  // const toolNames = toolParts.map((p) => p.toolName ?? "");

  const { status: groupStatus, failCount } = deriveGroupStatus(
    toolParts,
    messageIsRunning ?? false,
  );
  // const { configs: iconConfigs, overflow } = buildIconStrip(toolNames);

  const [isExpanded, setIsExpanded] = useState(false);
  const [, setLiveDurationTick] = useState(0);
  const userToggledRef = useRef(false);
  const prevRunningRef = useRef(messageIsRunning);

  useEffect(() => {
    const wasRunning = prevRunningRef.current;
    prevRunningRef.current = messageIsRunning;

    if (!messageIsRunning && wasRunning && !userToggledRef.current) {
      setIsExpanded(false);
    }
  }, [messageIsRunning]);

  const liveStartedAt = runDuration?.kind === "live" ? runDuration.startedAt : undefined;

  useEffect(() => {
    if (liveStartedAt === undefined) return;
    const id = window.setInterval(() => setLiveDurationTick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [liveStartedAt]);

  function handleToggle() {
    userToggledRef.current = true;
    setIsExpanded((prev) => !prev);
  }

  const wallMs =
    runDuration?.kind === "live"
      ? Math.max(0, Date.now() - runDuration.startedAt)
      : runDuration?.kind === "done"
        ? runDuration.ms
        : undefined;
  const isLiveRunDuration = runDuration?.kind === "live";
  const usageLine =
    usageMeta && (usageMeta.input > 0 || usageMeta.output > 0 || usageMeta.cost > 0)
      ? formatTurnUsageHeaderLine(usageMeta)
      : null;

  return (
    <div
      className={cn(
        // Claude-like: inline + low-contrast (no border / no "card" rounding)
        "mb-2 bg-transparent text-sm",
        "transition-colors",
        isExpanded ? "bg-muted/10" : "hover:bg-muted/10",
      )}
    >
      {/* ── Header (always visible) ── */}
      <button
        type="button"
        onClick={handleToggle}
        className={cn(
          "group flex w-full items-center gap-2 px-3 py-2 text-left",
          "transition-colors hover:bg-muted/10",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
          // Keep header edges crisp; mimic inline row
          isExpanded ? "rounded-none" : "rounded-none",
        )}
        aria-expanded={isExpanded}
      >
        {/* Lightning bolt icon (subtle) */}
        <ZapIcon className="size-3.5 shrink-0 text-muted-foreground/80" />

        {/* Count label */}
        <span className="text-[12px] font-medium text-foreground/90">
          Used {toolCount} tool{toolCount === 1 ? "" : "s"}
        </span>
        {wallMs != null && wallMs >= 0 && (
          <span
            className="text-[11px] tabular-nums text-muted-foreground"
            aria-live={isLiveRunDuration ? "polite" : undefined}
            title={
              isLiveRunDuration
                ? `Elapsed this run: ${formatRunDuration(wallMs, { live: true })}`
                : `Run completed in ${formatRunDuration(wallMs)}`
            }
          >
            · {formatRunDuration(wallMs, isLiveRunDuration ? { live: true } : undefined)}
          </span>
        )}

        {/* Group status (left-side, minimal) */}
        <span className="ml-1 inline-flex items-center">
          <GroupStatusBadge status={groupStatus} failCount={failCount} />
        </span>

        {usageLine?.primary ? (
          <span
            className="text-[11px] tabular-nums text-muted-foreground"
            title={usageLine.title}
          >
            · {usageLine.primary}
          </span>
        ) : null}

        {/* Category icon strip */}
        {/* {iconConfigs.length > 0 && (
          <span className="flex items-center gap-1">
            {iconConfigs.map((cfg, i) => {
              const Icon = cfg.Icon;
              return (
                <span
                  key={i}
                  className={cn("flex size-4.5 items-center justify-center rounded-sm")}
                  title={cfg.actionLabel}
                >
                  <Icon className={cn("size-3 text-muted-foreground/80")} />
                </span>
              );
            })}
            {overflow > 0 && (
              <span className="text-[10px] font-medium text-muted-foreground">+{overflow}</span>
            )}
          </span>
        )} */}

        {/* Spacer */}
        <span className="flex-1" />

        {/* Expand/collapse chevron (right-side affordance) */}
        <span
          className="text-muted-foreground/70 group-hover:text-muted-foreground group-hover:opacity-100 opacity-80"
          aria-label={isExpanded ? "Collapse" : "Expand"}
          title={isExpanded ? "Collapse" : "Expand"}
        >
          {isExpanded ? (
            <ChevronUpIcon className="size-3.5" />
          ) : (
            <ChevronDownIcon className="size-3.5" />
          )}
        </span>
      </button>

      <div
        className={cn(
          "overflow-hidden transition-all duration-300 ease-out",
          isExpanded
            ? "max-h-80 opacity-100"
            : "max-h-0 opacity-0",
        )}
        aria-hidden={!isExpanded}
      >
        <div
          className={cn(
            // "Internal drawer" feel: subtle inset shadow + a light top divider
            "px-3 pb-2 pt-2 max-h-75 overflow-y-auto overscroll-contain pr-2",
            "border-t border-border/30",
            "shadow-[inset_0_10px_8px_-16px_rgba(0,0,0,0.45),inset_0_-10px_8px_-16px_rgba(0,0,0,0.35),inset_10px_0_8px_-16px_rgba(0,0,0,0.25),inset_-10px_0_8px_-16px_rgba(0,0,0,0.25)]",
            "dark:shadow-[inset_0_10px_16px_-16px_rgba(0,0,0,0.7),inset_0_-10px_16px_-16px_rgba(0,0,0,0.55),inset_10px_0_16px_-16px_rgba(0,0,0,0.45),inset_-10px_0_16px_-16px_rgba(0,0,0,0.45)]",
          )}
        >
          {children}
        </div>
      </div>
    </div>
  );
};
