import { ChevronRightIcon } from "lucide-react";
import { useEffect } from "react";
import { cn } from "@/lib/utils";
import { useAgentsStore } from "@/store/agents.store";
import { useGatewayStore } from "@/store/gateway.store";
import type { GatewayAgentRow } from "@/types/agents";

// ---------------------------------------------------------------------------
// AgentList — Panel that shows all agents (Pane 2, "agents" view)
// ---------------------------------------------------------------------------

function resolveAgentEmoji(agent: GatewayAgentRow): string {
  return agent.identity?.emoji ?? "🤖";
}

function resolveAgentDisplayName(agent: GatewayAgentRow): string {
  return agent.identity?.name ?? agent.name ?? agent.id;
}

function AgentItem({
  agent,
  onClick,
}: {
  agent: GatewayAgentRow;
  onClick: () => void;
}) {
  const emoji = resolveAgentEmoji(agent);
  const name = resolveAgentDisplayName(agent);
  const avatarUrl = agent.identity?.avatarUrl;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full rounded-xl px-3 py-2.5 text-left transition-colors",
        "flex items-center gap-3",
        "hover:bg-[rgb(243,244,246)]",
      )}
    >
      {/* Avatar: image if available, else emoji */}
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[rgb(243,244,246)] text-[18px] overflow-hidden">
        {avatarUrl ? (
          <img src={avatarUrl} alt={name} className="size-full object-contain rounded-lg" />
        ) : (
          emoji
        )}
      </span>

      {/* Name */}
      <span className="flex-1 min-w-0 truncate text-[13px] font-semibold text-foreground">
        {name}
      </span>

      {/* Chevron */}
      <ChevronRightIcon className="size-3.5 shrink-0 text-[rgb(142,142,147)]" />
    </button>
  );
}

interface AgentListProps {
  onSelectAgent: (agent: GatewayAgentRow) => void;
  /** Search query from the parent ChatSidebar — filters agents by name/id */
  search?: string;
}

export function AgentList({ onSelectAgent, search = "" }: AgentListProps) {
  const agentsList = useAgentsStore((s) => s.agentsList);
  const loading = useAgentsStore((s) => s.loading);
  const loadAgents = useAgentsStore((s) => s.loadAgents);
  const gatewayStatus = useGatewayStore((s) => s.status);

  // Load agents when connected
  useEffect(() => {
    if (gatewayStatus === "connected") {
      void loadAgents();
    }
  }, [gatewayStatus, loadAgents]);

  const allAgents = agentsList?.agents ?? [];
  // Filter by search query if provided
  const agents = search
    ? allAgents.filter((a) => {
        const q = search.toLowerCase();
        const name = resolveAgentDisplayName(a).toLowerCase();
        return name.includes(q) || a.id.toLowerCase().includes(q);
      })
    : allAgents;

  return (
    <div className="flex flex-1 min-h-0 flex-col overflow-y-auto px-2 py-4">
      {/* Section heading */}
      <div className="px-3 mb-3">
        <span className="text-[17px] font-bold leading-tight text-foreground">Agents</span>
      </div>

      {/* List */}
      <div className="flex flex-col gap-0.5">
        {loading && agents.length === 0 && (
          <p className="px-3 py-2 text-[13px] text-[rgb(142,142,147)]">Loading…</p>
        )}
        {!loading && agents.length === 0 && (
          <p className="px-3 py-2 text-[13px] text-[rgb(142,142,147)]">
            {search ? "No results" : "No agents found"}
          </p>
        )}
        {agents.map((agent) => (
          <AgentItem key={agent.id} agent={agent} onClick={() => onSelectAgent(agent)} />
        ))}
      </div>
    </div>
  );
}

export { resolveAgentEmoji, resolveAgentDisplayName };
