import { useEffect, useMemo, useState } from "react";
import { Loader2Icon } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useAgentsStore } from "@/store/agents.store";
import type { AgentSkillStatusEntry } from "@/types/agents";
import { AppleToggle, CategoryPills, DialogSearchInput, SectionCard, SectionLabel } from "./shared";

function SkillCard({ skill, agentId }: { skill: AgentSkillStatusEntry; agentId: string }) {
  const toggleAgentSkill = useAgentsStore((s) => s.toggleAgentSkill);
  return (
    <div
      className={cn(
        "flex items-center justify-between bg-white rounded-[20px] px-4 h-13.5 shadow-sm",
        !skill.eligible && "opacity-50",
      )}
    >
      <span
        className={cn(
          "text-[13px] font-semibold truncate flex-1 mr-2",
          !skill.eligible ? "text-[#8E8E93]" : "text-black",
        )}
      >
        {skill.name}
      </span>
      <AppleToggle
        checked={!skill.disabled}
        disabled={skill.always || !skill.eligible}
        onChange={() => void toggleAgentSkill(agentId, skill.name, skill.disabled)}
      />
    </div>
  );
}

function SkillsDialog({ open, onClose, agentId, allSkills }: {
  open: boolean;
  onClose: () => void;
  agentId: string;
  allSkills: AgentSkillStatusEntry[];
}) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");

  const categories = useMemo(() => {
    const sources = Array.from(new Set(allSkills.map((s) => s.source ?? "built-in")));
    return [
      { id: "all", label: "All" },
      ...sources.map((s) => ({ id: s, label: s.charAt(0).toUpperCase() + s.slice(1) })),
    ];
  }, [allSkills]);

  const shown = useMemo(() => {
    const f = q.trim().toLowerCase();
    return allSkills.filter((s) => {
      const matchCat = cat === "all" || (s.source ?? "built-in") === cat;
      const matchQ = !f || [s.name, s.description, s.source].join(" ").toLowerCase().includes(f);
      return matchCat && matchQ;
    });
  }, [allSkills, q, cat]);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { onClose(); } }}>
      <DialogContent className="w-[60vw] max-w-[60vw] sm:max-w-[60vw] h-[70vh] flex flex-col gap-0 p-0 overflow-hidden rounded-3xl">
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <DialogTitle className="text-[15px] font-bold">All Skills</DialogTitle>
          <p className="text-[12px] text-[#8E8E93] mt-0.5">{shown.length} of {allSkills.length} shown</p>
        </DialogHeader>

        <div className="px-6 py-3 flex flex-col gap-3 border-b shrink-0">
          <DialogSearchInput value={q} onChange={setQ} placeholder="Search skills…" />
          <CategoryPills categories={categories} active={cat} onChange={setCat} />
        </div>

        <ScrollArea className="flex-1 px-6 py-4 overflow-auto">
          <div className="grid grid-cols-3 gap-3">
            {shown.map((skill) => (
              <SkillCard key={skill.skillKey} skill={skill} agentId={agentId} />
            ))}
            {shown.length === 0 && (
              <p className="col-span-2 text-sm text-[#8E8E93] py-4 text-center">No skills found.</p>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

export function CoreSkillsSection({ agentId }: { agentId: string }) {
  const agentSkillsReport = useAgentsStore((s) => s.agentSkillsReport);
  const agentSkillsLoading = useAgentsStore((s) => s.agentSkillsLoading);
  const agentSkillsError = useAgentsStore((s) => s.agentSkillsError);
  const loadAgentSkills = useAgentsStore((s) => s.loadAgentSkills);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    if (!agentSkillsReport) { void loadAgentSkills(agentId); }
  }, [agentId, agentSkillsReport, loadAgentSkills]);

  const allSkills = agentSkillsReport?.skills ?? [];
  const preview = allSkills.slice(0, 6);
  const hasMore = allSkills.length > 6;

  return (
    <SectionCard>
      <div className="flex items-center justify-between mb-6">
        <SectionLabel>Core Skills</SectionLabel>
        <span className="text-[11px] text-[#8E8E93] font-semibold">{allSkills.length} total</span>
      </div>

      {agentSkillsLoading && !agentSkillsReport && (
        <div className="flex items-center gap-2 text-[#8E8E93] text-sm py-4">
          <Loader2Icon className="size-4 animate-spin" />
          Loading skills…
        </div>
      )}
      {agentSkillsError && (
        <p className="text-sm text-red-500">{agentSkillsError}</p>
      )}

      <div className="grid grid-cols-3 gap-3">
        {preview.map((skill) => (
          <SkillCard key={skill.skillKey} skill={skill} agentId={agentId} />
        ))}
        {preview.length === 0 && !agentSkillsLoading && (
          <p className="col-span-3 text-sm text-[#8E8E93] py-2">No skills found.</p>
        )}
      </div>

      {hasMore && (
        <div className="flex justify-end mt-4">
          <button
            type="button"
            onClick={() => setDialogOpen(true)}
            className="text-[12px] font-semibold text-[#BA0034] hover:underline"
          >
            View all {allSkills.length} skills →
          </button>
        </div>
      )}

      <SkillsDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        agentId={agentId}
        allSkills={allSkills}
      />
    </SectionCard>
  );
}
