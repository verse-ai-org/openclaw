import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { Loader2Icon, XIcon } from "lucide-react";
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
  const navigate = useNavigate();
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
    <Dialog open={open} onOpenChange={(next) => { if (!next) { onClose(); }}}>
      <DialogContent className="w-[60vw] max-w-[60vw] sm:max-w-[60vw] h-[70vh] flex flex-col gap-0 p-0 overflow-hidden rounded-3xl">
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <DialogTitle className="text-[15px] font-bold">Add Skills</DialogTitle>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
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
                    "rounded-2xl border px-3 py-2 text-left transition-colors",
                    checked
                      ? "border-primary bg-primary/10"
                      : "border-border bg-card hover:border-primary/40",
                  )}
                >
                  <p className="truncate text-[13px] font-semibold text-foreground">{skill.name}</p>
                  {skill.description && (
                    <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">{skill.description}</p>
                  )}
                </button>
              );
            })}
            {shown.length === 0 && (
              <p className="col-span-3 py-4 text-center text-sm text-muted-foreground">No skills found.</p>
            )}
          </div>
        </ScrollArea>

        <div className="border-t px-6 py-4 shrink-0 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            <p className="text-[11px] text-muted-foreground">
              Skill missing from the list? Install it globally first, then return here to bind it.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0 text-[11px] font-semibold"
              disabled={saving}
              onClick={() => {
                onClose();
                void navigate("/skills");
              }}
            >
              Install on Skills page
            </Button>
          </div>
          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button disabled={selected.length === 0 || saving} onClick={() => void handleAdd()}>
              {saving && <Loader2Icon className="size-4 animate-spin" />}
              Add {selected.length > 0 ? selected.length : ""}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Built-in agents whose skills are locked (no removal allowed). */
const LOCKED_SKILL_AGENT_IDS = new Set(["travel-planner", "my-office-helper"]);

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
      <div className="flex items-center justify-between mb-3">
        <SectionLabel>Skills</SectionLabel>
        <span className="text-[11px] font-semibold text-muted-foreground">{boundSkills.length} bound</span>
      </div>

      {agentSkillsLoading && !agentSkillsReport && (
        <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
          <Loader2Icon className="size-4 animate-spin" />
          Loading skills…
        </div>
      )}
      {agentSkillsError && (
        <p className="text-sm text-red-500">{agentSkillsError}</p>
      )}

      {!hasExplicitSkillsList && !agentSkillsLoading && boundSkills.length > 0 && (
        <p className="mb-3 text-[11px] text-muted-foreground">
          No restrictions — all active skills are available.
        </p>
      )}

      {boundSkills.length > 0 ? (
        <div className="max-h-[260px] overflow-y-auto">
          <div className="grid grid-cols-3 gap-3 pr-1">
            {boundSkills.map((skill) => (
              <div key={skill.id} className="rounded-2xl border border-border bg-card px-3 py-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold text-foreground">{skill.label}</p>
                    {skill.description && (
                      <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">{skill.description}</p>
                    )}
                    {skill.missingFromCatalog && (
                      <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-500">Missing from current skills catalog</p>
                    )}
                  </div>
                  {!LOCKED_SKILL_AGENT_IDS.has(agentId) && (
                    <button
                      type="button"
                      className="shrink-0 rounded-full p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
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
        </div>
      ) : (
        !agentSkillsLoading && (
          <div className="rounded-2xl border border-dashed border-border p-6 text-center">
            <p className="text-sm text-muted-foreground">No bound skills yet.</p>
          </div>
        )
      )}

      {/* Advanced button — mirrors ToolsSection style: right-aligned red text */}
      <div className="flex justify-end mt-4">
        <button
          type="button"
          onClick={() => setDialogOpen(true)}
          disabled={agentSkillsLoading || updating}
          className="text-[12px] font-semibold text-primary hover:underline disabled:opacity-40"
        >
          Advanced →
        </button>
      </div>

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
