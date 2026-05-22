import { useMemo } from "react";
import { cn } from "@/lib/utils";
import {
  resolveAgentDisplayName,
  resolveAgentEmoji,
} from "@/components/chat/AgentList";
import type { GatewayAgentRow } from "@/types/agents";

function sortAgentsForPicker(
  agents: GatewayAgentRow[],
  defaultAgentId: string,
): GatewayAgentRow[] {
  return [...agents].toSorted((a, b) => {
    if (a.id === defaultAgentId) {
      return -1;
    }
    if (b.id === defaultAgentId) {
      return 1;
    }
    return resolveAgentDisplayName(a).localeCompare(resolveAgentDisplayName(b));
  });
}

interface TaskFormAgentPickerProps {
  agents: GatewayAgentRow[];
  selectedAgentId: string;
  defaultAgentId: string;
  disabled?: boolean;
  onSelect: (agentId: string) => void;
}

export function TaskFormAgentPicker({
  agents,
  selectedAgentId,
  defaultAgentId,
  disabled = false,
  onSelect,
}: TaskFormAgentPickerProps) {
  const sortedAgents = useMemo(
    () => sortAgentsForPicker(agents, defaultAgentId),
    [agents, defaultAgentId],
  );

  const effectiveSelected = selectedAgentId.trim() || defaultAgentId;

  if (sortedAgents.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Choose an employee to run this task.
      </p>
      <div
        className="flex gap-4 overflow-x-auto pb-1 -mx-1 px-1"
        role="listbox"
        aria-label="Select agent"
      >
        {sortedAgents.map((agent) => {
          const selected = agent.id === effectiveSelected;
          const name = resolveAgentDisplayName(agent);
          const emoji = resolveAgentEmoji(agent);
          const avatarUrl = agent.identity?.avatarUrl ?? agent.identity?.avatar;

          return (
            <button
              key={agent.id}
              type="button"
              role="option"
              aria-selected={selected}
              disabled={disabled}
              onClick={() => onSelect(agent.id)}
              className={cn(
                "flex shrink-0 flex-col items-center gap-2 rounded-xl p-2 transition-colors",
                "hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                disabled && "pointer-events-none opacity-50",
              )}
            >
              <span
                className={cn(
                  "flex size-14 items-center justify-center overflow-hidden rounded-full bg-muted text-xl ring-offset-2 ring-offset-background",
                  selected
                    ? "ring-2 ring-primary"
                    : "ring-1 ring-border",
                )}
              >
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt=""
                    className="size-full object-cover"
                  />
                ) : (
                  <span aria-hidden="true">{emoji}</span>
                )}
              </span>
              <span
                className={cn(
                  "max-w-[5.5rem] truncate text-center text-xs font-medium",
                  selected ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {name}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
