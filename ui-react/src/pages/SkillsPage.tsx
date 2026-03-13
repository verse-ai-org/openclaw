import { useEffect, useMemo } from "react";
import { SkillCard } from "@/components/skills/SkillCard";
import { SkillsToolbar } from "@/components/skills/SkillsToolbar";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { groupSkills } from "@/lib/skills-grouping";
import { useGatewayStore } from "@/store/gateway.store";
import { useSkillsStore } from "@/store/skills.store";

export function SkillsPage() {
  const status = useGatewayStore((s) => s.status);

  const loading = useSkillsStore((s) => s.loading);
  const error = useSkillsStore((s) => s.error);
  const filter = useSkillsStore((s) => s.filter);
  const busyKey = useSkillsStore((s) => s.busyKey);
  const edits = useSkillsStore((s) => s.edits);
  const messages = useSkillsStore((s) => s.messages);
  // Subscribe to report (stable object reference when unchanged)
  const report = useSkillsStore((s) => s.report);

  // Stable action references from the store (never change between renders)
  const loadSkills = useSkillsStore((s) => s.loadSkills);
  const setFilter = useSkillsStore((s) => s.setFilter);
  const setEdit = useSkillsStore((s) => s.setEdit);
  const toggleSkill = useSkillsStore((s) => s.toggleSkill);
  const saveApiKey = useSkillsStore((s) => s.saveApiKey);
  const installSkill = useSkillsStore((s) => s.installSkill);
  const removeSkill = useSkillsStore((s) => s.removeSkill);

  // Compute filtered list + groups only when report or filter changes
  const filteredSkills = useMemo(() => {
    const skills = report?.skills ?? [];
    const f = filter.trim().toLowerCase();
    if (!f) {
      return skills;
    }
    return skills.filter((skill) =>
      [skill.name, skill.description, skill.source].join(" ").toLowerCase().includes(f),
    );
  }, [report, filter]);

  const groups = useMemo(() => groupSkills(filteredSkills), [filteredSkills]);

  // Default to first group's id when groups change
  const defaultTab = groups[0]?.id ?? "installed";

  // Load on mount and when connection is established
  useEffect(() => {
    async function load() {
      if (status === "connected") {
        await loadSkills(true);
      }
    }
    void load();
  }, [status, loadSkills]);

  return (
    <div className="flex flex-col gap-4 p-4 max-w-5xl mx-auto w-full overflow-auto h-full">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold">Skills</h2>
          <p className="text-sm text-muted-foreground">Bundled, managed, and workspace skills.</p>
        </div>
      </div>

      {/* Toolbar */}
      <SkillsToolbar
        filter={filter}
        loading={loading}
        shownCount={filteredSkills.length}
        onFilterChange={setFilter}
        onRefresh={() => loadSkills(true)}
      />

      {/* Error */}
      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Disconnected notice */}
      {status !== "connected" && !loading && (
        <div className="rounded-md border px-4 py-3 text-sm text-muted-foreground">
          Not connected to gateway.
        </div>
      )}

      {/* Skills tabs */}
      {groups.length > 0 && (
        <Tabs defaultValue={defaultTab} key={defaultTab}>
          <TabsList className="flex w-full h-auto flex-wrap gap-1 bg-muted p-1">
            {groups.map((group) => (
              <TabsTrigger key={group.id} value={group.id} className="flex items-center gap-1.5">
                {group.label}
                <Badge variant="secondary" className="px-1.5 py-0 text-xs font-normal">
                  {group.skills.length}
                </Badge>
              </TabsTrigger>
            ))}
          </TabsList>

          {groups.map((group) => (
            <TabsContent key={group.id} value={group.id} className="mt-4">
              {group.skills.length === 0 ? (
                <p className="text-sm text-muted-foreground">No skills found.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {group.skills.map((skill) => (
                    <SkillCard
                      key={skill.skillKey}
                      skill={skill}
                      busy={busyKey === skill.skillKey}
                      apiKeyEdit={edits[skill.skillKey] ?? ""}
                      message={messages[skill.skillKey] ?? null}
                      onToggle={() => toggleSkill(skill.skillKey, skill.disabled)}
                      onEdit={(value) => setEdit(skill.skillKey, value)}
                      onSaveKey={() => saveApiKey(skill.skillKey)}
                      onInstall={(installId) => installSkill(skill.skillKey, skill.name, installId)}
                      onRemove={() => void removeSkill(skill.baseDir, skill.source)}
                    />
                  ))}
                </div>
              )}
            </TabsContent>
          ))}
        </Tabs>
      )}

      {/* Empty state: connected but no skills at all */}
      {status === "connected" && !loading && groups.length === 0 && (
        <p className="text-sm text-muted-foreground">No skills found.</p>
      )}
    </div>
  );
}
