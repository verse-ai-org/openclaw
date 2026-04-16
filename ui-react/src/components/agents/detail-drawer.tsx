import { useEffect, useState } from "react";
import { Loader2Icon, Trash2Icon, XIcon } from "lucide-react";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
} from "@/components/ui/drawer";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAgentsStore } from "@/store/agents.store";
import { ProfileHeroSection, IntroSection } from "./profile";
import { CoreSkillsSection } from "./skills";
import { ToolsSection } from "./tools";
import { SoulSection  } from "./soul";

/** Built-in agents that cannot be deleted from the profile page. */
const LOCKED_AGENT_IDS = new Set(["travel-planner", "my-office-helper"]);

interface AgentDetailDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agentId: string | null;
  defaultAgentId: string;
  /** Optional: called when Chat button is clicked; receives the resolved session key.
   *  When provided the component does NOT navigate — the caller is responsible
   *  (e.g. closing the drawer and switching the active session on the Chat page). */
  onChatClick?: (sessionKey: string) => void;
}

export function AgentDetailDrawer({
  open,
  onOpenChange,
  agentId,
  defaultAgentId,
  onChatClick,
}: AgentDetailDrawerProps) {
  const agentsList = useAgentsStore((s) => s.agentsList);
  const selectAgent = useAgentsStore((s) => s.selectAgent);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  // Sync store's selectedAgentId with the drawer's agentId so that
  // agentFileContents, agentSkillsReport etc. are correctly reset/reloaded
  // when switching between different agents.
  useEffect(() => {
    if (open && agentId) {
      selectAgent(agentId);
    }
  }, [open, agentId, selectAgent]);

  const agents = agentsList?.agents ?? [];
  const selectedAgent = agents.find((a) => a.id === agentId);
  const selectedName = selectedAgent?.name ?? selectedAgent?.identity?.name ?? agentId ?? "";

  const DeleteAgentConfirm = () => {
    const deleteAgent = useAgentsStore((s) => s.deleteAgent);
    const [deleting, setDeleting] = useState(false);

    const handleConfirm = async () => {
      if (!agentId) {
        return;
      }
      setDeleting(true);
      await deleteAgent(agentId, true);
      setDeleting(false);
      setDeleteTarget(null);
    };

    if (!deleteTarget) {
      return null;
    }

    return (
      <Dialog open={!!deleteTarget} onOpenChange={(o: boolean) => { if (!o) { setDeleteTarget(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete "{deleteTarget.name}"?</DialogTitle>
            <DialogDescription>
              This will remove the agent configuration and move its workspace files to Trash. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" disabled={deleting}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => void handleConfirm()}
              disabled={deleting}
            >
              {deleting && <Loader2Icon className="size-4 animate-spin mr-1" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  };

  if (!agentId) {
    return null;
  }

  return (
    <>
      <Drawer open={open} onOpenChange={onOpenChange} direction="right">
        <DrawerContent className="h-full w-[80vw] bg-muted" style={{ maxWidth: "80vw" }}>
          <DrawerHeader className="px-8 py-2">
            <DialogTitle className="hidden">{selectedName}</DialogTitle>
            <div className="flex items-start justify-end gap-4">
              <div className="flex items-center gap-2">
                {agentId !== defaultAgentId && !LOCKED_AGENT_IDS.has(agentId) && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive border-destructive/30 hover:bg-destructive/5 hover:text-destructive gap-1.5"
                    onClick={() => setDeleteTarget({ id: agentId, name: String(selectedName) })}
                  >
                    <Trash2Icon className="size-4" />
                  </Button>
                )}
                <DrawerClose asChild>
                  <Button variant="ghost" size="icon" className="size-10">
                    <XIcon className="size-5" />
                  </Button>
                </DrawerClose>
              </div>
            </div>
          </DrawerHeader>

          <div className="flex-1 overflow-hidden">
            <ScrollArea className="h-[calc(100vh-100px)]">
              <div className="px-6 pt-2 pb-10 max-w-3xl mx-auto flex flex-col gap-4">
                <ProfileHeroSection agentId={agentId} onChatClick={onChatClick} readOnly={LOCKED_AGENT_IDS.has(agentId)} />
                <IntroSection agentId={agentId} onChatClick={onChatClick} />
                <CoreSkillsSection agentId={agentId} />
                <ToolsSection agentId={agentId} />
                <SoulSection agentId={agentId} />
              </div>
            </ScrollArea>
          </div>

        </DrawerContent>
      </Drawer>

      <DeleteAgentConfirm />
    </>
  );
}
