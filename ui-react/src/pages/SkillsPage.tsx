import { useEffect, useMemo, useState } from "react";
import { SkillCard } from "@/components/skills/SkillCard";
import { SkillCategoryPills } from "@/components/skills/SkillCategoryPills";
import { SkillManageDialog } from "@/components/skills/SkillManageDialog";
import { SkillsToolbar } from "@/components/skills/SkillsToolbar";
import { useGatewayStore } from "@/store/gateway.store";
import { useSkillsStore } from "@/store/skills.store";
import type { SkillStatusEntry } from "@/types/skills";

type SkillsSourceFilter =
  | "all"
  | "openclaw-bundled"
  | "openclaw-managed"
  | "openclaw-workspace"
  | "openclaw-extra";

const SOURCE_FILTER_OPTIONS: Array<{ id: SkillsSourceFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "openclaw-bundled", label: "System Built-in" },
  { id: "openclaw-managed", label: "Installed" },
  // { id: "openclaw-workspace", label: "Current Project" },
  { id: "openclaw-extra", label: "Other" },
];

export function SkillsPage() {
  const [manageOpen, setManageOpen] = useState(false);
  /** Dialog resolves skill from latest `report` so enable/disable updates the switch immediately. */
  const [manageSkillKey, setManageSkillKey] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState<SkillsSourceFilter>("all");

  const status = useGatewayStore((s) => s.status);

  const loading = useSkillsStore((s) => s.loading);
  const error = useSkillsStore((s) => s.error);
  const filter = useSkillsStore((s) => s.filter);
  const busyKey = useSkillsStore((s) => s.busyKey);
  const edits = useSkillsStore((s) => s.edits);
  const messages = useSkillsStore((s) => s.messages);
  const report = useSkillsStore((s) => s.report);

  const manageSkill = useMemo((): SkillStatusEntry | null => {
    if (!manageSkillKey || !report?.skills?.length) {
      return null;
    }
    return report.skills.find((s) => s.skillKey === manageSkillKey) ?? null;
  }, [manageSkillKey, report]);

  const loadSkills = useSkillsStore((s) => s.loadSkills);
  const setFilter = useSkillsStore((s) => s.setFilter);
  const setEdit = useSkillsStore((s) => s.setEdit);
  const toggleSkill = useSkillsStore((s) => s.toggleSkill);
  const saveApiKey = useSkillsStore((s) => s.saveApiKey);
  const installSkill = useSkillsStore((s) => s.installSkill);
  const saveEnvVar = useSkillsStore((s) => s.saveEnvVar);
  const removeSkill = useSkillsStore((s) => s.removeSkill);
  const getSkillFile = useSkillsStore((s) => s.getSkillFile);
  const saveSkillFile = useSkillsStore((s) => s.saveSkillFile);

  const openSkillManage = (skill: SkillStatusEntry) => {
    setManageSkillKey(skill.skillKey);
    setManageOpen(true);
  };

  const filteredSkills = useMemo(() => {
    const skills = report?.skills ?? [];
    const f = filter.trim().toLowerCase();
    return skills.filter((skill) => {
      if (sourceFilter !== "all" && skill.source !== sourceFilter) {
        return false;
      }
      if (!f) {
        return true;
      }
      return [skill.name, skill.description, skill.source].join(" ").toLowerCase().includes(f);
    });
  }, [report, filter, sourceFilter]);

  useEffect(() => {
    async function load() {
      if (status === "connected") {
        await loadSkills(true);
      }
    }
    void load();
  }, [status, loadSkills]);

  const canRemoveManaged =
    manageSkill !== null &&
    (manageSkill.source === "openclaw-workspace" || manageSkill.source === "openclaw-managed");

  return (
    <div className="flex max-w-4xl w-full flex-col gap-12 p-8 mx-auto">
      {/* Header */}
      <div className="flex flex-col gap-2">
        <h2 className="text-[48px] font-extrabold leading-tight tracking-tight text-foreground">
          Skills
        </h2>
        <p className="text-lg font-medium text-muted-foreground">
          Bundled, managed, and workspace skills.
        </p>
      </div>

      {/* Toolbar + Tabs */}
      <div className="flex flex-col gap-8">
        <SkillsToolbar
          filter={filter}
          loading={loading}
          shownCount={filteredSkills.length}
          onFilterChange={setFilter}
          onRefresh={() => loadSkills(true)}
        />

        {error && (
          <div className="rounded-2xl border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {status !== "connected" && !loading && (
          <div className="rounded-2xl border px-4 py-3 text-sm text-muted-foreground">
            Not connected to Server.
          </div>
        )}

        <div className="flex items-center gap-3">
          <SkillCategoryPills
            categories={SOURCE_FILTER_OPTIONS}
            active={sourceFilter}
            onChange={(id) => setSourceFilter(id as SkillsSourceFilter)}
          />
        </div>

        {filteredSkills.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {filteredSkills.map((skill) => (
              <SkillCard
                key={skill.skillKey}
                skill={skill}
                busy={busyKey === skill.skillKey}
                message={messages[skill.skillKey] ?? null}
                onOpen={() => openSkillManage(skill)}
              />
            ))}
          </div>
        ) : (
          status === "connected" &&
          !loading && <p className="text-sm text-muted-foreground">No skills found.</p>
        )}
      </div>

      <SkillManageDialog
        open={manageOpen}
        onOpenChange={(next) => {
          setManageOpen(next);
          if (!next) {
            setManageSkillKey(null);
          }
        }}
        skill={manageSkill}
        busy={manageSkill !== null && busyKey === manageSkill.skillKey}
        apiKeyEdit={manageSkill ? (edits[manageSkill.skillKey] ?? "") : ""}
        message={manageSkill ? (messages[manageSkill.skillKey] ?? null) : null}
        onToggle={() => manageSkill && void toggleSkill(manageSkill.skillKey, manageSkill.disabled)}
        onEdit={(value) => manageSkill && setEdit(manageSkill.skillKey, value)}
        onSaveKey={() => manageSkill && void saveApiKey(manageSkill.skillKey)}
        onInstall={(installId) =>
          manageSkill && void installSkill(manageSkill.skillKey, manageSkill.name, installId)
        }
        onSaveEnvVar={(envKey, value) =>
          manageSkill && void saveEnvVar(manageSkill.skillKey, envKey, value)
        }
        onRemove={
          canRemoveManaged && manageSkill
            ? () => {
                void removeSkill(manageSkill.baseDir, manageSkill.source);
                setManageOpen(false);
                setManageSkillKey(null);
              }
            : undefined
        }
        getSkillFile={getSkillFile}
        saveSkillFile={saveSkillFile}
        onSkillsReload={() => loadSkills(false)}
      />
    </div>
  );
}
