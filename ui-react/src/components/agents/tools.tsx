import { useEffect, useMemo, useState } from "react";
import { Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { useAgentsStore } from "@/store/agents.store";
import { AppleToggle, DialogSearchInput, SectionCard, SectionLabel } from "./shared";

// ── Tool profile definitions ───────────────────────────────────────────────────

const TOOL_PROFILES = ["minimal", "coding", "messaging", "full", "inherit"] as const;
type ToolProfileId = (typeof TOOL_PROFILES)[number];

const PROFILE_LABELS: Record<ToolProfileId, string> = {
  minimal: "Minimal",
  coding: "Coding",
  messaging: "Messaging",
  full: "Full",
  inherit: "Inherit",
};

const PROFILE_DESCRIPTIONS: Record<ToolProfileId, string> = {
  minimal: "Basic tools only, lowest privilege",
  coding: "Code writing and file system tools",
  messaging: "Messaging and web search tools",
  full: "All tools enabled — recommended for general-purpose agents",
  inherit: "Inherits global tool settings",
};

// ── Policy helpers (mirrors agents-utils.ts logic) ────────────────────────────

type ToolPolicy = { allow?: string[]; deny?: string[] };

const TOOL_NAME_ALIASES: Record<string, string> = { bash: "exec", "apply-patch": "apply_patch" };

function normalizeTool(name: string) {
  const n = name.trim().toLowerCase();
  return TOOL_NAME_ALIASES[n] ?? n;
}

function resolveBasePolicy(profile: string | null, allToolIds: string[], catalog: { id: string; defaultProfiles: string[] }[]): ToolPolicy | null {
  if (!profile || profile === "inherit") { return null; }
  if (profile === "full") { return null; }
  const allow = catalog.filter((t) => t.defaultProfiles.includes(profile)).map((t) => t.id);
  if (allow.length === 0) { return null; }
  void allToolIds;
  return { allow };
}

type CompiledPat = { kind: "all" } | { kind: "exact"; v: string } | { kind: "rx"; v: RegExp };

function compilePat(pattern: string): CompiledPat {
  const n = normalizeTool(pattern);
  if (!n) { return { kind: "exact", v: "" }; }
  if (n === "*") { return { kind: "all" }; }
  if (!n.includes("*")) { return { kind: "exact", v: n }; }
  const esc = n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return { kind: "rx", v: new RegExp(`^${esc.replace(/\\\*/g, ".*")}$`) };
}

function matchesAny(name: string, pats: CompiledPat[]): boolean {
  for (const p of pats) {
    if (p.kind === "all") { return true; }
    if (p.kind === "exact" && p.v === name) { return true; }
    if (p.kind === "rx" && p.v.test(name)) { return true; }
  }
  return false;
}

function isAllowedByPolicy(name: string, policy: ToolPolicy | null): boolean {
  if (!policy) { return true; }
  const n = normalizeTool(name);
  const denyPats = (policy.deny ?? []).map(compilePat);
  if (matchesAny(n, denyPats)) { return false; }
  const allowPats = (policy.allow ?? []).map(compilePat);
  if (allowPats.length === 0) { return true; }
  if (matchesAny(n, allowPats)) { return true; }
  if (n === "apply_patch" && matchesAny("exec", allowPats)) { return true; }
  return false;
}

function matchesList(name: string, list: string[]): boolean {
  if (!list.length) { return false; }
  const n = normalizeTool(name);
  const pats = list.map(compilePat);
  if (matchesAny(n, pats)) { return true; }
  if (n === "apply_patch" && matchesAny("exec", pats)) { return true; }
  return false;
}

function resolveAllowedFromDraft(
  toolId: string,
  basePolicy: ToolPolicy | null,
  alsoAllow: string[],
  deny: string[],
): boolean {
  const baseAllowed = isAllowedByPolicy(toolId, basePolicy);
  const extraAllowed = matchesList(toolId, alsoAllow);
  const denied = matchesList(toolId, deny);
  return (baseAllowed || extraAllowed) && !denied;
}

// ── Tools Dialog (Draft Mode) ─────────────────────────────────────────────────

function ToolsDialog({
  open,
  onClose,
  agentId,
  allTools,
  initialProfile,
  initialAlsoAllow,
  initialDeny,
  allCatalogTools,
  onSave,
  editable,
}: {
  open: boolean;
  onClose: () => void;
  agentId: string;
  allTools: Array<{ id: string; description: string; groupLabel: string }>;
  initialProfile: ToolProfileId;
  initialAlsoAllow: string[];
  initialDeny: string[];
  allCatalogTools: Array<{ id: string; description: string; groupLabel: string; defaultProfiles: string[] }>;
  onSave: (profile: ToolProfileId, alsoAllow: string[], deny: string[]) => Promise<void>;
  editable: boolean;
}) {
  void agentId;

  // Draft state — local until Save
  const [draftProfile, setDraftProfile] = useState<ToolProfileId>(initialProfile);
  const [draftAlsoAllow, setDraftAlsoAllow] = useState<string[]>(initialAlsoAllow);
  const [draftDeny, setDraftDeny] = useState<string[]>(initialDeny);
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [q, setQ] = useState("");

  // Reset draft whenever dialog opens
  useEffect(() => {
    if (open) {
      setDraftProfile(initialProfile);
      setDraftAlsoAllow(initialAlsoAllow);
      setDraftDeny(initialDeny);
      setSaving(false);
      setConfirmOpen(false);
      setQ("");
    }
  }, [open, initialProfile, initialAlsoAllow, initialDeny]);

  // Filter by search only (no category pills)
  const shown = useMemo(() => {
    const f = q.trim().toLowerCase();
    if (!f) { return allTools; }
    return allTools.filter((t) =>
      t.id.toLowerCase().includes(f) || t.description.toLowerCase().includes(f),
    );
  }, [allTools, q]);

  // Derive draft base policy
  const draftBasePolicy = useMemo(() => {
    const allIds = allCatalogTools.map((t) => t.id);
    const effectiveProfile = draftProfile === "inherit" ? "full" : draftProfile;
    return resolveBasePolicy(effectiveProfile, allIds, allCatalogTools);
  }, [draftProfile, allCatalogTools]);

  const resolveAllowed = (toolId: string) =>
    resolveAllowedFromDraft(toolId, draftBasePolicy, draftAlsoAllow, draftDeny);

  // Toggle a single tool in draft state
  const updateTool = (toolId: string, nextEnabled: boolean) => {
    const nextAllow = new Set(draftAlsoAllow.map(normalizeTool).filter(Boolean));
    const nextDeny = new Set(draftDeny.map(normalizeTool).filter(Boolean));
    const baseAllowed = isAllowedByPolicy(toolId, draftBasePolicy);
    const n = normalizeTool(toolId);
    if (nextEnabled) {
      nextDeny.delete(n);
      if (!baseAllowed) { nextAllow.add(n); }
    } else {
      nextAllow.delete(n);
      nextDeny.add(n);
    }
    setDraftAlsoAllow([...nextAllow]);
    setDraftDeny([...nextDeny]);
  };

  const handleProfileChange = (profile: ToolProfileId) => {
    setDraftProfile(profile);
    // Overrides are cleared on profile switch; user confirms on Save if destructive
    setDraftAlsoAllow([]);
    setDraftDeny([]);
  };

  // Destructive: profile switched AND original had custom overrides
  const hasDestructiveChange =
    draftProfile !== initialProfile &&
    (initialAlsoAllow.length > 0 || initialDeny.length > 0);

  const originalOverrideCount = initialAlsoAllow.length + initialDeny.length;

  const isDirty =
    draftProfile !== initialProfile ||
    JSON.stringify([...draftAlsoAllow].sort()) !== JSON.stringify([...initialAlsoAllow].sort()) ||
    JSON.stringify([...draftDeny].sort()) !== JSON.stringify([...initialDeny].sort());

  const handleSave = async () => {
    if (hasDestructiveChange) {
      setConfirmOpen(true);
      return;
    }
    await doSave();
  };

  const doSave = async () => {
    setSaving(true);
    await onSave(draftProfile, draftAlsoAllow, draftDeny);
    setSaving(false);
    onClose();
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => { if (!v) { onClose(); } }}>
        <DialogContent className="w-[60vw] max-w-[60vw] sm:max-w-[60vw] h-[75vh] flex flex-col gap-0 p-0 overflow-hidden rounded-3xl">
          <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
            <DialogTitle className="text-[15px] font-bold">Tools & Capabilities</DialogTitle>
            <p className="text-[12px] text-[#8E8E93] mt-0.5">{shown.length} of {allTools.length} tools</p>
          </DialogHeader>

          {/* Toolbar: search + profile tabs */}
          <div className="px-6 py-3 flex flex-col gap-3 border-b shrink-0">
            <DialogSearchInput value={q} onChange={setQ} placeholder="Search tools…" />

            {/* Profile selector — primary filter */}
            <div className="flex items-center bg-[#F3F4F6] rounded-full p-0.5 gap-0.5 self-start">
              {TOOL_PROFILES.map((p) => (
                <button
                  key={p}
                  type="button"
                  disabled={!editable}
                  onClick={() => handleProfileChange(p)}
                  className={cn(
                    "px-3 py-1 rounded-full text-[11px] font-semibold transition-colors duration-150",
                    draftProfile === p ? "bg-white text-black shadow-sm" : "text-[#8E8E93] hover:text-black",
                    !editable && "opacity-50 cursor-not-allowed",
                  )}
                >
                  {PROFILE_LABELS[p]}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-[#8E8E93] -mt-1">{PROFILE_DESCRIPTIONS[draftProfile]}</p>
          </div>

          {/* Tool grid */}
          <ScrollArea className="flex-1 px-6 py-4 overflow-auto">
            <div className="grid grid-cols-3 gap-3">
              {shown.map((tool) => {
                const allowed = resolveAllowed(tool.id);
                return (
                  <div
                    key={tool.id}
                    title={tool.description}
                    className="flex items-center justify-between bg-white rounded-[20px] px-4 h-13.5 shadow-sm"
                  >
                    <div className="flex flex-col flex-1 min-w-0 mr-2">
                      {/* Only dim text, not the toggle — toggle must always look clickable */}
                      <span className={cn(
                        "text-[13px] font-semibold truncate font-mono",
                        allowed ? "text-black" : "text-[#C0C4CC]",
                      )}>
                        {tool.id}
                      </span>
                      <span className="text-[11px] text-[#8E8E93] truncate">{tool.groupLabel}</span>
                    </div>
                    <AppleToggle
                      checked={allowed}
                      disabled={!editable}
                      onChange={() => updateTool(tool.id, !allowed)}
                    />
                  </div>
                );
              })}
              {shown.length === 0 && (
                <p className="col-span-3 text-sm text-[#8E8E93] py-4 text-center">No tools found.</p>
              )}
            </div>
          </ScrollArea>

          {/* Footer: Cancel + Save */}
          <div className="border-t px-6 py-4 shrink-0 flex items-center justify-end gap-2">
            <Button variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button
              className="gap-1.5 bg-[#BA0034] text-white hover:bg-[#9b0029]"
              disabled={!isDirty || !editable || saving}
              onClick={() => void handleSave()}
            >
              {saving && <Loader2Icon className="size-4 animate-spin" />}
              Save
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Destructive change confirmation */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Switching profile will clear overrides</AlertDialogTitle>
            <AlertDialogDescription>
              This agent has {originalOverrideCount} custom tool override{originalOverrideCount !== 1 ? "s" : ""}.
              Switching the profile will clear them, keeping only the default tools for the new profile. Continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmOpen(false)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-[#BA0034] text-white hover:bg-[#9b0029]"
              onClick={() => { setConfirmOpen(false); void doSave(); }}
            >
              Confirm & Save
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ── Tools Section ─────────────────────────────────────────────────────────────

export function ToolsSection({ agentId }: { agentId: string }) {
  const toolsCatalogResult = useAgentsStore((s) => s.toolsCatalogResult);
  const toolsCatalogLoading = useAgentsStore((s) => s.toolsCatalogLoading);
  const toolsCatalogError = useAgentsStore((s) => s.toolsCatalogError);
  const loadToolsCatalog = useAgentsStore((s) => s.loadToolsCatalog);
  const configForm = useAgentsStore((s) => s.configForm);
  const configLoading = useAgentsStore((s) => s.configLoading);
  const configSaving = useAgentsStore((s) => s.configSaving);
  const loadConfig = useAgentsStore((s) => s.loadConfig);
  const changeToolsProfile = useAgentsStore((s) => s.changeToolsProfile);
  const changeToolsOverrides = useAgentsStore((s) => s.changeToolsOverrides);
  const saveConfig = useAgentsStore((s) => s.saveConfig);

  useEffect(() => {
    if (!configForm && !configLoading) { void loadConfig(); }
  }, [configForm, configLoading, loadConfig]);

  useEffect(() => {
    if (toolsCatalogResult?.agentId !== agentId) { void loadToolsCatalog(agentId); }
  }, [agentId, toolsCatalogResult?.agentId, loadToolsCatalog]);

  // Derive agent tools config from store
  const agentToolsConfig = useMemo(() => {
    if (!configForm) { return { profile: undefined, alsoAllow: [] as string[], deny: [] as string[], hasAllow: false }; }
    const agents = (configForm.agents as Record<string, unknown> | undefined) ?? {};
    const list = (agents.list as Record<string, unknown>[] | undefined) ?? [];
    const entry = list.find((a) => a.id === agentId);
    const tools = (entry?.tools as Record<string, unknown> | undefined) ?? {};
    const hasAllow = Array.isArray(tools.allow) && (tools.allow as string[]).length > 0;
    return {
      profile: tools.profile as string | undefined,
      alsoAllow: hasAllow ? [] : (Array.isArray(tools.alsoAllow) ? tools.alsoAllow as string[] : []),
      deny: hasAllow ? [] : (Array.isArray(tools.deny) ? tools.deny as string[] : []),
      hasAllow,
    };
  }, [configForm, agentId]);

  const globalToolsConfig = useMemo(() => {
    if (!configForm) { return { profile: undefined }; }
    const gt = (configForm.tools as Record<string, unknown> | undefined) ?? {};
    return { profile: gt.profile as string | undefined };
  }, [configForm]);

  const effectiveProfile = agentToolsConfig.profile ?? globalToolsConfig.profile ?? "full";

  const currentProfile = useMemo<ToolProfileId>(() => {
    const p = agentToolsConfig.profile;
    if (p && TOOL_PROFILES.includes(p as ToolProfileId)) { return p as ToolProfileId; }
    return "inherit";
  }, [agentToolsConfig.profile]);

  // Flat catalog
  const allCatalogTools = useMemo(() => {
    if (!toolsCatalogResult) { return []; }
    return toolsCatalogResult.groups.flatMap((g) => g.tools.map((t) => ({ ...t, groupLabel: g.label })));
  }, [toolsCatalogResult]);

  // Base policy from effective profile (for preview rendering)
  const basePolicy = useMemo(() => {
    const allIds = allCatalogTools.map((t) => t.id);
    return resolveBasePolicy(effectiveProfile, allIds, allCatalogTools);
  }, [effectiveProfile, allCatalogTools]);

  const resolveAllowed = (toolId: string) =>
    resolveAllowedFromDraft(toolId, basePolicy, agentToolsConfig.alsoAllow, agentToolsConfig.deny);

  const activeCount = allCatalogTools.filter((t) => resolveAllowed(t.id)).length;

  const editable = Boolean(configForm) && !configLoading && !configSaving && !agentToolsConfig.hasAllow;

  // Profile pill click (direct save, no overrides touched)
  const handleCardProfileChange = (profile: ToolProfileId) => {
    if (!editable) { return; }
    const next = profile === "inherit" ? null : profile;
    // Only save if no existing overrides — if overrides exist, open dialog instead
    if (agentToolsConfig.alsoAllow.length > 0 || agentToolsConfig.deny.length > 0) {
      setDialogOpen(true);
      return;
    }
    changeToolsProfile(agentId, next, false);
    void saveConfig();
  };

  // Preview: first 6 tools (read-only)
  const previewTools = allCatalogTools.slice(0, 6);

  const [dialogOpen, setDialogOpen] = useState(false);

  // Persist changes from Dialog
  const handleDialogSave = async (profile: ToolProfileId, alsoAllow: string[], deny: string[]) => {
    const next = profile === "inherit" ? null : profile;
    changeToolsProfile(agentId, next, true);
    changeToolsOverrides(agentId, alsoAllow, deny);
    await saveConfig();
  };

  return (
    <SectionCard>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <SectionLabel>Tools & Capabilities</SectionLabel>
        <span className="text-[11px] text-[#8E8E93] font-semibold">{activeCount} / {allCatalogTools.length} active</span>
      </div>

      {toolsCatalogLoading && !toolsCatalogResult && (
        <div className="flex items-center gap-2 text-[#8E8E93] text-sm mb-4">
          <Loader2Icon className="size-4 animate-spin" /> Loading tools…
        </div>
      )}
      {toolsCatalogError && <p className="text-sm text-red-500 mb-4">{toolsCatalogError}</p>}

      {/* hasAllow warning */}
      {agentToolsConfig.hasAllow && (
        <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mb-4">
          This agent uses a full tool allowlist (<code className="font-mono">tools.allow</code>). UI editing is disabled — edit the config file directly to make changes.
        </p>
      )}

      {/* Profile pills — primary interaction */}
      {!agentToolsConfig.hasAllow && (
        <div className="mb-2">
          <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
            {TOOL_PROFILES.map((p) => (
              <button
                key={p}
                type="button"
                disabled={!editable}
                onClick={() => handleCardProfileChange(p)}
                className={cn(
                  "px-3 py-1 rounded-full text-[12px] font-semibold border transition-colors duration-150",
                  currentProfile === p
                    ? "bg-[#111827] text-white border-[#111827]"
                    : "bg-white text-[#6B7280] border-[#E5E7EB] hover:border-[#111827] hover:text-[#111827]",
                  !editable && "opacity-40 cursor-not-allowed",
                )}
              >
                {PROFILE_LABELS[p]}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-[#8E8E93]">{PROFILE_DESCRIPTIONS[currentProfile]}</p>
        </div>
      )}

      {/* Read-only tool preview */}
      {previewTools.length > 0 && (
        <div className="grid grid-cols-3 gap-2 mt-4">
          {previewTools.map((tool) => {
            const allowed = resolveAllowed(tool.id);
            return (
              <div
                key={tool.id}
                title={tool.description}
                className={cn(
                  "flex items-center gap-2 bg-white rounded-md px-3 h-10 shadow-sm",
                  !allowed && "opacity-45",
                )}
              >
                <span className={cn(
                  "size-1.5 rounded-full shrink-0",
                  allowed ? "bg-green-500" : "bg-[#D1D5DB]",
                )} />
                <span className={cn(
                  "text-[12px] font-mono font-semibold truncate",
                  allowed ? "text-black" : "text-[#9CA3AF]",
                )}>
                  {tool.id}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {previewTools.length === 0 && !toolsCatalogLoading && (
        <p className="text-sm text-[#8E8E93] mt-4">No tools registered.</p>
      )}

      {/* Advanced config button */}
      <div className="flex justify-end mt-4">
        <button
          type="button"
          onClick={() => setDialogOpen(true)}
          disabled={toolsCatalogLoading}
          className="text-[12px] font-semibold text-[#BA0034] hover:underline disabled:opacity-40"
        >
          Advanced →
        </button>
      </div>

      <ToolsDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        agentId={agentId}
        allTools={allCatalogTools}
        initialProfile={currentProfile}
        initialAlsoAllow={agentToolsConfig.alsoAllow}
        initialDeny={agentToolsConfig.deny}
        allCatalogTools={allCatalogTools}
        onSave={handleDialogSave}
        editable={editable}
      />
    </SectionCard>
  );
}
