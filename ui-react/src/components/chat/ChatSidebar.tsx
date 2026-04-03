import { useEffect, useState } from "react";
import { SearchIcon } from "lucide-react";
import { useSessionManager } from "@/hooks/useSessionManager";
import { useAgentsStore } from "@/store/agents.store";
import { useGatewayStore } from "@/store/gateway.store";
import { cn } from "@/lib/utils";
import type { GatewayAgentRow } from "@/types/agents";
import { AgentList } from "./AgentList";
import { AgentSessionList } from "./AgentSessionList";

// ---------------------------------------------------------------------------
// ChatSidebar — Sessions Pane (Pane 2)
//
// Layout:
//   [Fixed search bar]  — always visible, not part of the sliding track
//   [Sliding track]     — two panels side-by-side:
//     "agents"   → Agent list (default)
//     "sessions" → Session list filtered to the selected agent
//
// The animation is pure CSS translate + transition — no extra dependencies.
// ---------------------------------------------------------------------------

type SidebarView = "agents" | "sessions";

export function ChatSidebar() {
  const { sessions, loading, sessionKey, switchSession, newSession, deleteSession } = useSessionManager();
  const gatewayStatus = useGatewayStore((s) => s.status);
  const isConnected = gatewayStatus === "connected";
  const agentsList = useAgentsStore((s) => s.agentsList);

  const [view, setView] = useState<SidebarView>("agents");
  const [activeAgent, setActiveAgent] = useState<GatewayAgentRow | null>(null);
  // Shared search query — placeholder switches with the active view
  const [search, setSearch] = useState("");

  // Auto-restore the sessions view when the current sessionKey already belongs
  // to a known agent (e.g. returning to Chat after navigating away).
  useEffect(() => {
    const agents = agentsList?.agents ?? [];
    if (agents.length === 0) { return; }
    // Only restore once; don't override a user-initiated view change
    if (activeAgent !== null) { return; }
    const match = /^agent:([^:]+):/.exec(sessionKey);
    if (!match) { return; }
    const found = agents.find((a) => a.id === match[1]);
    if (found) {
      // Silently restore — the chat area is already on the correct session
      setActiveAgent(found);
      setView("sessions");
    }
  }, [agentsList, sessionKey, activeAgent]);

  function handleSelectAgent(agent: GatewayAgentRow) {
    setActiveAgent(agent);
    setView("sessions");
    setSearch(""); // Clear search when drilling into a different agent
    // Auto-switch to the agent's main session so the chat area updates
    const agentMainKey = `agent:${agent.id}:main`;
    if (!sessionKey.startsWith(`agent:${agent.id}:`)) {
      void switchSession(agentMainKey);
    }
  }

  function handleBack() {
    setView("agents");
    setSearch(""); // Clear search when going back to agents
  }

  return (
    <div className="flex w-60 shrink-0 flex-col border-r bg-white">
      {/* Fixed search bar — sits above the sliding track, never moves */}
      <div className="shrink-0 px-3 py-2 border-b border-[rgb(229,229,234)]">
        <div className="relative flex items-center">
          <SearchIcon className="absolute left-3 size-3.5 text-[rgb(142,142,147)] pointer-events-none" />
          <input
            type="text"
            placeholder={view === "agents" ? "Search agents" : "Search sessions"}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={cn(
              "w-full rounded-full bg-[rgb(239,239,239)] py-1.5 pl-8 pr-3",
              "text-[13px] text-foreground placeholder:text-[rgb(142,142,147)]",
              "border-none outline-none focus:ring-0",
            )}
          />
        </div>
      </div>

      {/*
       * Sliding track: two panels side-by-side (each 100% wide).
       * translateX(0%)   → show Agent list
       * translateX(-50%) → show Session list
       * The outer div clips the overflow; the inner div is 200% wide.
       */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <div
          className="flex h-full transition-transform duration-300 ease-in-out"
          style={{
            width: "200%",
            transform: view === "agents" ? "translateX(0%)" : "translateX(-50%)",
          }}
        >
          {/* Panel 1: Agent list (left, 50% of inner = 100% of outer) */}
          <div className="flex h-full flex-col overflow-hidden" style={{ width: "50%" }}>
            <AgentList onSelectAgent={handleSelectAgent} search={search} />
          </div>

          {/* Panel 2: Session list (right, 50% of inner = 100% of outer) */}
          <div className="flex h-full flex-col overflow-hidden" style={{ width: "50%" }}>
            {activeAgent && (
              <AgentSessionList
                agent={activeAgent}
                sessions={sessions}
                loading={loading}
                sessionKey={sessionKey}
                search={search}
                onBack={handleBack}
                onSwitchSession={(key) => void switchSession(key)}
                onNewSession={(agentId) => void newSession(agentId)}
                onDeleteSession={(key) => deleteSession(key).then(() => {})}
                isConnected={isConnected}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
