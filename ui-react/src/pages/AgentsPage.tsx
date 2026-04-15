import { useEffect, useState } from "react";
import { FileTextIcon, Loader2Icon, PlusIcon, RefreshCwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useAgentsStore } from "@/store/agents.store";
import { useGatewayStore } from "@/store/gateway.store";
import { AgentCard } from "../components/agents/card";
import { AgentDetailDrawer } from "../components/agents/detail-drawer";

function CreateAgentDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const createAgent = useAgentsStore((s) => s.createAgent);
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimName = name.trim();
    if (!trimName) { setErr("Name is required."); return; }
    setSubmitting(true);
    setErr(null);
    // workspace defaults to ~/.openclaw/agents/<id>
    const workspaceName = trimName.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    const workspace = `~/.openclaw/agents/${workspaceName}`;
    const res = await createAgent({
      name: trimName,
      workspace,
      ...(emoji.trim() ? { emoji: emoji.trim() } : {}),
    });
    setSubmitting(false);
    if (res) {
      setName("");
      setEmoji("");
      onOpenChange(false);
    } else {
      setErr("Failed to create agent. Please try again.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Agent</DialogTitle>
        </DialogHeader>
        <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="agent-name">Name <span className="text-destructive">*</span></Label>
            <Input
              id="agent-name"
              placeholder="e.g. Travel Planner"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="agent-emoji">Emoji (optional)</Label>
            <Input
              id="agent-emoji"
              placeholder="e.g. ✈️"
              value={emoji}
              onChange={(e) => setEmoji(e.target.value)}
              maxLength={8}
            />
          </div>
          {err && <p className="text-sm text-destructive">{err}</p>}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || !name.trim()}>
              {submitting ? (
                <><Loader2Icon className="size-4 animate-spin mr-1" /> Creating…</>
              ) : "Create Agent"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function AgentsPage() {
  const isConnected = useGatewayStore((s) => s.status === "connected");
  const loading     = useAgentsStore((s) => s.loading);
  const error       = useAgentsStore((s) => s.error);
  const agentsList  = useAgentsStore((s) => s.agentsList);
  const selectedId  = useAgentsStore((s) => s.selectedAgentId);
  const loadAgents  = useAgentsStore((s) => s.loadAgents);
  const selectAgent = useAgentsStore((s) => s.selectAgent);

  const [createOpen, setCreateOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    if (isConnected && !agentsList) { void loadAgents(); }
  }, [isConnected, agentsList, loadAgents]);

  // Open drawer when an agent is selected
  useEffect(() => {
    if (selectedId) {
      setDrawerOpen(true);
    } else {
      setDrawerOpen(false);
    }
  }, [selectedId]);

  if (!isConnected) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
        Not connected to gateway.
      </div>
    );
  }

  if (loading && !agentsList) {
    return (
      <div className="flex items-center justify-center h-full gap-2 text-muted-foreground">
        <Loader2Icon className="size-4 animate-spin" />
        <span className="text-sm">Loading agents…</span>
      </div>
    );
  }

  if (error && !agentsList) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <p className="text-sm text-destructive">{error}</p>
        <Button size="sm" variant="outline" onClick={() => void loadAgents()}>Retry</Button>
      </div>
    );
  }

  const agents = agentsList?.agents ?? [];
  const DEFAULT_AGENT_ID = agentsList?.defaultId ?? "main";


  return (
      <>
        <div className="flex flex-col gap-10 p-8 max-w-4xl mx-auto w-full">
        {/* Header */}
        <div className="flex items-center justify-between shrink-0">
          <div className="flex flex-col gap-2">
              <h2 className="text-[48px] font-extrabold leading-tight tracking-tight text-foreground">
                Employees
              </h2>
              <p className="text-lg font-medium text-muted-foreground">
                Manage your employees and their roles
              </p>
            </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              className="size-10"
              disabled={loading}
              onClick={() => void loadAgents()}
              title="Refresh"
            >
              <RefreshCwIcon
                className={cn("size-4", loading && "animate-spin")}
              />
            </Button>
            <Button
              className="gap-2 rounded-full bg-primary text-white hover:bg-primary/90"
              onClick={() => setCreateOpen(true)}
            >
              <PlusIcon className="size-4" />
              New Employee
            </Button>
          </div>
        </div>

        {/* Content */}
        <ScrollArea className="flex-1">
          <div>
            {loading && !agentsList ? (
              <div className="flex items-center justify-center gap-2 text-muted-foreground py-20">
                <Loader2Icon className="size-6 animate-spin" />
                <span className="text-sm">Loading agents…</span>
              </div>
            ) : error && !agentsList ? (
              <div className="flex flex-col items-center justify-center gap-3 py-20">
                <p className="text-sm text-destructive">{error}</p>
                <Button size="sm" variant="outline" onClick={() => void loadAgents()}>
                  Retry
                </Button>
              </div>
            ) : agents.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
                <FileTextIcon className="size-16 text-[#E5E7EB]" />
                <div>
                  <p className="text-base font-semibold text-[#111827]">No agents yet</p>
                  <p className="text-sm text-[#8E8E93] mt-1">
                    Create your first agent to get started
                  </p>
                </div>
                <Button
                  className="gap-2 bg-[#BA0034] text-white hover:bg-[#9b0029]"
                  onClick={() => setCreateOpen(true)}
                >
                  <PlusIcon className="size-4" />
                  Create Agent
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {agents.map((agent) => {
                  const ident = agent.identity;
                  const agentName = agent.name ?? ident?.name ?? agent.id;
                  const agentEmoji = ident?.emoji;
                  const agentAvatar = ident?.avatarUrl;
                  const agentVideo = ident?.video;

                  return (
                    <AgentCard
                      key={agent.id}
                      id={agent.id}
                      name={agentName}
                      emoji={agentEmoji}
                      avatar={agentAvatar}
                      video={agentVideo}
                      isSelected={selectedId === agent.id}
                      onClick={() => selectAgent(agent.id)}
                    />
                  );
                })}
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Create Agent Dialog */}
      <CreateAgentDialog open={createOpen} onOpenChange={setCreateOpen} />

      {/* Agent Detail Drawer */}
      <AgentDetailDrawer
        open={drawerOpen}
        onOpenChange={(open) => {
          setDrawerOpen(open);
          if (!open) {
            selectAgent("");
          }
        }}
        agentId={selectedId}
        defaultAgentId={DEFAULT_AGENT_ID}
      />
    </>
  );
}
