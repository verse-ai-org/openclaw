import { useEffect, useMemo, useState } from "react";
import { Loader2Icon, PlusIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useAgentsStore } from "@/store/agents.store";
import type { AgentSkillStatusEntry } from "@/types/agents";
import { CategoryPills, DialogSearchInput, SectionCard, SectionLabel } from "./shared";

type BoundSkillItem = {
  id: string;
  label: string;
  description?: string;
  source?: string;
  missingFromCatalog?: boolean;
};

function skillIdOf(skill: AgentSkillStatusEntry): string {
  return skill.skillKey || skill.name;
}

type SkillsSourceFilter = "all" | "system-built-in" | "installed" | "other-sources";

function sourceCategoryOf(source: string | undefined): Exclude<SkillsSourceFilter, "all"> {
  if (source === "openclaw-bundled") {
    return "system-built-in";
  }
  if (source === "openclaw-managed") {
    return "installed";
  }
  return "other-sources";
}

function AddSkillsDialog({
  open,
  onClose,
  allSkills,
  boundSkillIds,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  allSkills: AgentSkillStatusEntry[];
  boundSkillIds: string[];
  onSubmit: (addedSkillIds: string[]) => Promise<void>;
}) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<SkillsSourceFilter>("all");
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setQ("");
      setCat("all");
      setSelected([]);
      setSaving(false);
    }
  }, [open]);

  const boundSet = useMemo(() => new Set(boundSkillIds), [boundSkillIds]);

  const candidates = useMemo(
    () => allSkills.filter((skill) => !boundSet.has(skillIdOf(skill))),
    [allSkills, boundSet],
  );

  const categories = useMemo(
    () => [
      { id: "all", label: "All" },
      { id: "system-built-in", label: "System Built-in" },
      { id: "installed", label: "Installed" },
      { id: "other-sources", label: "Other Sources" },
    ] satisfies Array<{ id: SkillsSourceFilter; label: string }>,
    [],
  );

  const shown = useMemo(() => {
    const keyword = q.trim().toLowerCase();
    return candidates.filter((skill) => {
      const sourceCategory = sourceCategoryOf(skill.source);
      const matchCat = cat === "all" || sourceCategory === cat;
      const haystack = [skill.name, skill.description, skill.source].join(" ").toLowerCase();
      const matchQ = !keyword || haystack.includes(keyword);
      return matchCat && matchQ;
    });
  }, [candidates, q, cat]);

  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const toggleSelect = (id: string) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const handleAdd = async () => {
    if (selected.length === 0 || saving) {
      return;
    }
    setSaving(true);
    await onSubmit(selected);
    setSaving(false);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent className="w-[60vw] max-w-[60vw] sm:max-w-[60vw] h-[70vh] flex flex-col gap-0 p-0 overflow-hidden rounded-3xl">
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <DialogTitle className="text-[15px] font-bold">Add Skills</DialogTitle>
          <p className="text-[12px] text-[#8E8E93] mt-0.5">
            {shown.length} available · {selected.length} selected
          </p>
        </DialogHeader>

        <div className="px-6 py-3 flex flex-col gap-3 border-b shrink-0">
          <DialogSearchInput value={q} onChange={setQ} placeholder="Search skills…" />
          <CategoryPills
            categories={categories}
            active={cat}
            onChange={(id) => setCat(id as SkillsSourceFilter)}
          />
        </div>

        <ScrollArea className="flex-1 px-6 py-4 overflow-auto">
          <div className="grid grid-cols-3 gap-3">
            {shown.map((skill) => {
              const id = skillIdOf(skill);
              const checked = selectedSet.has(id);
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => toggleSelect(id)}
                  className={cn(
                    "text-left rounded-2xl border px-3 py-2 transition-colors",
                    checked
                      ? "border-[#BA0034] bg-[#FFF3F7]"
                      : "border-[#E5E7EB] bg-white hover:border-[#BA0034]/40",
                  )}
                >
                  <p className="text-[13px] font-semibold text-black truncate">{skill.name}</p>
                  {skill.description && (
                    <p className="text-[11px] text-[#8E8E93] line-clamp-2 mt-1">{skill.description}</p>
                  )}
                </button>
              );
            })}
            {shown.length === 0 && (
              <p className="col-span-3 text-sm text-[#8E8E93] py-4 text-center">No skills found.</p>
            )}
          </div>
        </ScrollArea>

        <div className="border-t px-6 py-4 shrink-0 flex items-center justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button
            className="gap-1.5 bg-[#BA0034] text-white hover:bg-[#9b0029]"
            disabled={selected.length === 0 || saving}
            onClick={() => void handleAdd()}
          >
            {saving && <Loader2Icon className="size-4 animate-spin" />}
            Add {selected.length > 0 ? selected.length : ""}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function CoreSkillsSection({ agentId }: { agentId: string }) {
  const agentsList = useAgentsStore((s) => s.agentsList);
  const agentSkillsReport = useAgentsStore((s) => s.agentSkillsReport);
  const agentSkillsLoading = useAgentsStore((s) => s.agentSkillsLoading);
  const agentSkillsError = useAgentsStore((s) => s.agentSkillsError);
  const loadAgentSkills = useAgentsStore((s) => s.loadAgentSkills);
  const setAgentSkills = useAgentsStore((s) => s.setAgentSkills);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    if (agentSkillsReport && !agentSkillsLoading) {
      return;
    }
    void loadAgentSkills(agentId);
  }, [agentId, agentSkillsReport, agentSkillsLoading, loadAgentSkills]);

  const selectedAgent = useMemo(
    () => agentsList?.agents.find((agent) => agent.id === agentId) ?? null,
    [agentsList, agentId],
  );

  const allSkills = agentSkillsReport?.skills ?? [];

  // Whether the agent has an explicit skills allowlist in the config.
  // undefined = no restriction (all eligible skills are active).
  const hasExplicitSkillsList = selectedAgent?.skills !== undefined;

  const boundSkillIds = useMemo(() => {
    if (hasExplicitSkillsList) {
      // Use the explicit allowlist from the agent config.
      return Array.from(new Set((selectedAgent?.skills ?? []).filter(Boolean)));
    }
    // No explicit allowlist → all non-disabled, non-blocked skills are active.
    return allSkills
      .filter((s) => !s.disabled && !s.blockedByAllowlist)
      .map((s) => skillIdOf(s));
  }, [hasExplicitSkillsList, selectedAgent?.skills, allSkills]);

  const skillById = useMemo(() => {
    const map = new Map<string, AgentSkillStatusEntry>();
    for (const skill of allSkills) {
      map.set(skillIdOf(skill), skill);
      map.set(skill.name, skill);
    }
    return map;
  }, [allSkills]);

  const boundSkills = useMemo<BoundSkillItem[]>(() => {
    return boundSkillIds.map((id) => {
      const matched = skillById.get(id);
      if (!matched) {
        return {
          id,
          label: id,
          missingFromCatalog: true,
        };
      }
      return {
        id,
        label: matched.name,
        description: matched.description,
        source: matched.source,
      };
    });
  }, [boundSkillIds, skillById]);

  const updateBoundSkills = async (nextSkills: string[]) => {
    setUpdating(true);
    await setAgentSkills(agentId, nextSkills);
    setUpdating(false);
  };

  const handleRemove = async (skillId: string) => {
    if (updating) {
      return;
    }
    const nextSkills = boundSkillIds.filter((id) => id !== skillId);
    await updateBoundSkills(nextSkills);
  };

  const handleAdd = async (addedSkillIds: string[]) => {
    const nextSkills = Array.from(new Set([...boundSkillIds, ...addedSkillIds]));
    await updateBoundSkills(nextSkills);
  };

  return (
    <SectionCard>
      <div className="flex items-center justify-between mb-6">
        <SectionLabel>Bound Skills</SectionLabel>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-[#8E8E93] font-semibold">{boundSkills.length} bound</span>
          <Button
            size="sm"
            className="gap-1.5 bg-[#BA0034] text-white hover:bg-[#9b0029]"
            onClick={() => setDialogOpen(true)}
            disabled={agentSkillsLoading || updating}
          >
            {updating ? <Loader2Icon className="size-3.5 animate-spin" /> : <PlusIcon className="size-3.5" />}
            Add Skill
          </Button>
        </div>
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

      {!hasExplicitSkillsList && !agentSkillsLoading && boundSkills.length > 0 && (
        <p className="text-[11px] text-[#8E8E93] mb-3">
          No restrictions — all active skills are available. Add a skill to create an explicit allowlist.
        </p>
      )}

      {boundSkills.length > 0 ? (
        <div className="grid grid-cols-3 gap-3">
          {boundSkills.map((skill) => (
            <div key={skill.id} className="rounded-2xl border border-[#E5E7EB] bg-white px-3 py-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-black truncate">{skill.label}</p>
                  {skill.description && (
                    <p className="text-[11px] text-[#8E8E93] line-clamp-2 mt-1">{skill.description}</p>
                  )}
                  {skill.missingFromCatalog && (
                    <p className="text-[11px] text-amber-600 mt-1">Missing from current skills catalog</p>
                  )}
                </div>
                {hasExplicitSkillsList && (
                  <button
                    type="button"
                    className="shrink-0 rounded-full p-1 text-[#8E8E93] hover:text-[#BA0034] hover:bg-[#FFF3F7]"
                    onClick={() => void handleRemove(skill.id)}
                    disabled={updating}
                    aria-label={`Remove ${skill.label}`}
                    title="Remove"
                  >
                    <XIcon className="size-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        !agentSkillsLoading && (
          <div className="rounded-2xl border border-dashed border-[#E5E7EB] p-6 text-center">
            <p className="text-sm text-[#8E8E93]">No bound skills yet. Add skills to this agent.</p>
          </div>
        )
      )}

      <AddSkillsDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        allSkills={allSkills}
        boundSkillIds={boundSkillIds}
        onSubmit={handleAdd}
      />
    </SectionCard>
  );
}
