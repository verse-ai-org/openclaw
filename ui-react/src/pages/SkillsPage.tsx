import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { SkillCard } from "@/components/skills/SkillCard";
import { plainMdComponents } from "@/components/chat/markdown-components";
import { SkillsToolbar } from "@/components/skills/SkillsToolbar";
import { SkillCategoryPills } from "@/components/skills/SkillCategoryPills";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useGatewayStore } from "@/store/gateway.store";
import { useSkillsStore } from "@/store/skills.store";
import type { SkillStatusEntry } from "@/types/skills";

type ParsedSkillMarkdown = {
  frontmatter: string;
  body: string;
};

type SkillsSourceFilter = "all" | "openclaw-bundled" | "openclaw-managed" | "openclaw-workspace" | "openclaw-extra";

const SOURCE_FILTER_OPTIONS: Array<{ id: SkillsSourceFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "openclaw-bundled", label: "System Built-in" },
  { id: "openclaw-managed", label: "Installed" },
  // { id: "openclaw-workspace", label: "Current Project" },
  { id: "openclaw-extra", label: "Other" },
];

function parseSkillMarkdown(markdown: string): ParsedSkillMarkdown {
  const content = markdown.trimStart();
  if (!content.startsWith("---\n")) {
    return { frontmatter: "", body: markdown };
  }

  const end = content.indexOf("\n---\n", 4);
  if (end === -1) {
    return { frontmatter: "", body: markdown };
  }

  const frontmatter = content.slice(4, end).trim();
  const body = content.slice(end + 5).trimStart();
  return { frontmatter, body };
}

export function SkillsPage() {
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailContent, setDetailContent] = useState<string>("");
  const [detailEditing, setDetailEditing] = useState(false);
  const [detailDraft, setDetailDraft] = useState("");
  const [detailSaving, setDetailSaving] = useState(false);
  const [detailSkill, setDetailSkill] = useState<SkillStatusEntry | null>(null);
  const [sourceFilter, setSourceFilter] = useState<SkillsSourceFilter>("all");

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
  const saveEnvVar = useSkillsStore((s) => s.saveEnvVar);
  const removeSkill = useSkillsStore((s) => s.removeSkill);
  const getSkillFile = useSkillsStore((s) => s.getSkillFile);
  const saveSkillFile = useSkillsStore((s) => s.saveSkillFile);

  const openSkillDetail = async (skill: SkillStatusEntry) => {
    setDetailOpen(true);
    setDetailSkill(skill);
    setDetailError(null);
    setDetailContent("");
    setDetailDraft("");
    setDetailEditing(false);
    setDetailSaving(false);
    setDetailLoading(true);
    try {
      const file = await getSkillFile({ baseDir: skill.baseDir, source: skill.source });
      if (!file) {
        setDetailError("Unable to load SKILL.md");
        return;
      }
      const content = file.file.content ?? "";
      setDetailContent(content);
      setDetailDraft(content);
    } catch {
      setDetailError("Unable to load SKILL.md");
    } finally {
      setDetailLoading(false);
    }
  };

  const saveSkillDetail = async () => {
    if (!detailSkill) {
      return;
    }
    setDetailSaving(true);
    setDetailError(null);
    try {
      const result = await saveSkillFile({
        baseDir: detailSkill.baseDir,
        source: detailSkill.source,
        content: detailDraft,
      });
      if (!result) {
        setDetailError("Unable to save SKILL.md");
        return;
      }
      setDetailContent(result.file.content ?? detailDraft);
      setDetailDraft(result.file.content ?? detailDraft);
      setDetailEditing(false);
      await loadSkills(false);
    } catch {
      setDetailError("Unable to save SKILL.md");
    } finally {
      setDetailSaving(false);
    }
  };

  // Compute filtered list when report/filter/source changes
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

  // Load on mount and when connection is established
  useEffect(() => {
    async function load() {
      if (status === "connected") {
        await loadSkills(true);
      }
    }
    void load();
  }, [status, loadSkills]);

  const parsedDetailContent = useMemo(() => parseSkillMarkdown(detailContent), [detailContent]);
  const detailBodyContent = parsedDetailContent.body;
  const detailFrontmatter = parsedDetailContent.frontmatter;

  return (
    <div className="flex flex-col gap-12 p-8 max-w-4xl mx-auto w-full">
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
          <div className="rounded-2xl border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* Disconnected notice */}
        {status !== "connected" && !loading && (
          <div className="rounded-2xl border px-4 py-3 text-sm text-muted-foreground">
            Not connected to gateway.
          </div>
        )}

        {/* Source filter */}
        <div className="flex items-center gap-3">
          <SkillCategoryPills
            categories={SOURCE_FILTER_OPTIONS}
            active={sourceFilter}
            onChange={(id) => setSourceFilter(id as SkillsSourceFilter)}
          />
        </div>

        {/* Skills list */}
        {filteredSkills.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredSkills.map((skill) => (
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
                onSaveEnvVar={(envKey, value) => saveEnvVar(skill.skillKey, envKey, value)}
                onRemove={() => void removeSkill(skill.baseDir, skill.source)}
                onViewDetail={() => void openSkillDetail(skill)}
              />
            ))}
          </div>
        ) : (
          status === "connected" &&
          !loading && <p className="text-sm text-muted-foreground">No skills found.</p>
        )}
      </div>

      <Dialog
        open={detailOpen}
        onOpenChange={(next) => {
          setDetailOpen(next);
          if (!next) {
            setDetailEditing(false);
            setDetailError(null);
            setDetailSaving(false);
          }
        }}
      >
        <DialogContent className="w-[80vw] max-w-[80vw] sm:max-w-[80vw] max-h-[80vh] flex flex-col rounded-lg">
          <DialogHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <DialogTitle>{detailSkill?.name ?? "Skill"} - SKILL.md</DialogTitle>
                {/* <DialogDescription className="text-xs break-all">
                  {detailSkill?.filePath ?? ""}
                </DialogDescription> */}
              </div>
              <Button
                className="mr-6"
                size="sm"
                variant="outline"
                disabled={detailLoading || detailSaving || !detailSkill}
                onClick={() => {
                  if (detailEditing) {
                    setDetailDraft(detailContent);
                    setDetailEditing(false);
                  } else {
                    setDetailDraft(detailContent);
                    setDetailEditing(true);
                  }
                }}
              >
                {detailEditing ? "Cancel edit" : "Edit"}
              </Button>
            </div>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-auto rounded-md border bg-muted/30 p-3">
            {detailLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : detailError ? (
              <p className="text-sm text-destructive">{detailError}</p>
            ) : detailEditing ? (
              <textarea
                className="h-full min-h-[52vh] w-full resize-y rounded-md border bg-background p-3 text-sm leading-6 font-mono outline-none focus:ring-2 focus:ring-ring"
                value={detailDraft}
                onChange={(e) => setDetailDraft(e.target.value)}
              />
            ) : (
              <div className="flex flex-col gap-3 text-sm leading-6">
                {detailFrontmatter && (
                  <details className="rounded-md border bg-background/70 p-2">
                    <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
                      Metadata (frontmatter)
                    </summary>
                    <pre className="mt-2 overflow-auto rounded bg-muted/60 p-2 text-xs leading-5 whitespace-pre-wrap break-words font-mono">
                      {detailFrontmatter}
                    </pre>
                  </details>
                )}
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={plainMdComponents}>
                  {detailBodyContent || "(empty)"}
                </ReactMarkdown>
              </div>
            )}
          </div>

          <DialogFooter>
            {detailEditing && (
              <Button onClick={() => void saveSkillDetail()} disabled={detailSaving || detailLoading}>
                {detailSaving ? "Saving…" : "Save"}
              </Button>
            )}
            <Button variant="outline" onClick={() => setDetailOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
