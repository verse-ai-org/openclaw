import { useEffect, useMemo, useState } from "react";
import { Loader2Icon } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useAgentsStore } from "@/store/agents.store";
import { AppleToggle, CategoryPills, DialogSearchInput, SectionCard, SectionLabel } from "./shared";

// ── Tools profile tabs ────────────────────────────────────────────────────────

const TOOL_PROFILES = ["minimal", "coding", "messaging", "full", "inherit"] as const;
type ToolProfileId = (typeof TOOL_PROFILES)[number];

const PROFILE_LABELS: Record<ToolProfileId, string> = {
  minimal: "Minimal",
  coding: "Coding",
  messaging: "Messaging",
  full: "Full",
  inherit: "Inherit",
};

// ── Inline tool policy helpers (mirrors agents-utils.ts logic) ─────────────────

type ToolPolicy = { allow?: string[]; deny?: string[] };

const TOOL_NAME_ALIASES: Record<string, string> = { bash: "exec", "apply-patch": "apply_patch" };

function normalizeTool(name: string) {
  const n = name.trim().toLowerCase();
  return TOOL_NAME_ALIASES[n] ?? n;
}

function resolveBasePolicy(profile: string | null, allToolIds: string[], catalog: { id: string; defaultProfiles: string[] }[]): ToolPolicy | null {
  if (!profile || profile === "inherit") { return null; } // no restriction
  if (profile === "full") { return null; } // full = all tools allowed
  // Build allow list from tools whose defaultProfiles include this profile
  const allow = catalog.filter((t) => t.defaultProfiles.includes(profile)).map((t) => t.id);
  // If nothing is in the allow list, treat as null (all allowed) to avoid blocking everything
  if (allow.length === 0) { return null; }
  void allToolIds; // unused
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
  // apply_patch inherits exec
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

// ── Tools Dialog ──────────────────────────────────────────────────────────────

function ToolsDialog({ open, onClose, agentId, allTools, groupLabels, resolveAllowed, updateTool, editable, currentProfile, handleProfileChange }: {
  open: boolean;
  onClose: () => void;
  agentId: string;
  allTools: Array<{ id: string; description: string; groupLabel: string }>;
  groupLabels: { id: string; label: string }[];
  resolveAllowed: (toolId: string) => { allowed: boolean };
  updateTool: (toolId: string, next: boolean) => void;
  editable: boolean;
  currentProfile: ToolProfileId;
  handleProfileChange: (p: ToolProfileId) => void;
}) {
  void agentId;
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");

  const categories = useMemo(() => [
    { id: "all", label: "All" },
    ...groupLabels,
  ], [groupLabels]);

  const shown = useMemo(() => {
    const f = q.trim().toLowerCase();
    return allTools.filter((t) => {
      const matchCat = cat === "all" || t.groupLabel === cat;
      const matchQ = !f || t.id.toLowerCase().includes(f) || t.description.toLowerCase().includes(f);
      return matchCat && matchQ;
    });
  }, [allTools, q, cat]);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { onClose(); } }}>
      <DialogContent className="w-[60vw] max-w-[60vw] sm:max-w-[60vw] h-[75vh] flex flex-col gap-0 p-0 overflow-hidden rounded-3xl">
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <DialogTitle className="text-[15px] font-bold">All Tools</DialogTitle>
          <p className="text-[12px] text-[#8E8E93] mt-0.5">{shown.length} of {allTools.length} shown</p>
        </DialogHeader>

        {/* Toolbar */}
        <div className="px-6 py-3 flex flex-col gap-3 border-b shrink-0">
          {/* Search */}
          <DialogSearchInput value={q} onChange={setQ} placeholder="Search tools…" />

          {/* Category + Profile row */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <CategoryPills categories={categories} active={cat} onChange={setCat} />

            {/* Profile selector inside dialog */}
            <div className="flex items-center bg-[#F3F4F6] rounded-full p-0.5 gap-0.5 shrink-0">
              {TOOL_PROFILES.map((p) => (
                <button
                  key={p}
                  type="button"
                  disabled={!editable}
                  onClick={() => handleProfileChange(p)}
                  className={cn(
                    "px-2.5 py-0.5 rounded-full text-[11px] font-semibold transition-colors duration-150",
                    currentProfile === p ? "bg-white text-black shadow-sm" : "text-[#8E8E93] hover:text-black",
                    !editable && "opacity-50 cursor-not-allowed",
                  )}
                >
                  {PROFILE_LABELS[p]}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Grid */}
        <ScrollArea className="flex-1 px-6 py-4 overflow-auto">
          <div className="grid grid-cols-3 gap-3">
            {shown.map((tool) => {
              const { allowed } = resolveAllowed(tool.id);
              return (
                <div
                  key={tool.id}
                  title={tool.description}
                  className={cn(
                    "flex items-center justify-between bg-white rounded-[20px] px-4 h-13.5 shadow-sm",
                    !allowed && "opacity-60",
                  )}
                >
                  <div className="flex flex-col flex-1 min-w-0 mr-2">
                    <span className={cn("text-[13px] font-semibold truncate font-mono", allowed ? "text-black" : "text-[#8E8E93]")}>
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
              <p className="col-span-2 text-sm text-[#8E8E93] py-4 text-center">No tools found.</p>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
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
  const configDirty = useAgentsStore((s) => s.configDirty);
  const loadConfig = useAgentsStore((s) => s.loadConfig);
  const changeToolsProfile = useAgentsStore((s) => s.changeToolsProfile);
  const changeToolsOverrides = useAgentsStore((s) => s.changeToolsOverrides);
  const saveConfig = useAgentsStore((s) => s.saveConfig);

  // Ensure config is loaded — needed for profile/override mutations
  useEffect(() => {
    if (!configForm && !configLoading) { void loadConfig(); }
  }, [configForm, configLoading, loadConfig]);

  useEffect(() => {
    if (toolsCatalogResult?.agentId !== agentId) { void loadToolsCatalog(agentId); }
  }, [agentId, toolsCatalogResult?.agentId, loadToolsCatalog]);

  // Derive agent tools config entry
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

  // Global tools config
  const globalToolsConfig = useMemo(() => {
    if (!configForm) { return { profile: undefined }; }
    const gt = (configForm.tools as Record<string, unknown> | undefined) ?? {};
    return { profile: gt.profile as string | undefined };
  }, [configForm]);

  // Effective profile: agent override → global default → "full"
  const effectiveProfile = agentToolsConfig.profile ?? globalToolsConfig.profile ?? "full";

  // Current UI profile (for selector display: show "inherit" if no agent-level override)
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

  // Base policy from effective profile
  const basePolicy = useMemo(() => {
    const allIds = allCatalogTools.map((t) => t.id);
    return resolveBasePolicy(effectiveProfile, allIds, allCatalogTools);
  }, [effectiveProfile, allCatalogTools]);

  // Resolve whether a tool is allowed
  const resolveAllowed = (toolId: string) => {
    const baseAllowed = isAllowedByPolicy(toolId, basePolicy);
    const extraAllowed = matchesList(toolId, agentToolsConfig.alsoAllow);
    const denied = matchesList(toolId, agentToolsConfig.deny);
    return { allowed: (baseAllowed || extraAllowed) && !denied, baseAllowed };
  };

  // Toggle a single tool (writes alsoAllow / deny)
  const updateTool = (toolId: string, nextEnabled: boolean) => {
    const nextAllow = new Set(agentToolsConfig.alsoAllow.map(normalizeTool).filter(Boolean));
    const nextDeny = new Set(agentToolsConfig.deny.map(normalizeTool).filter(Boolean));
    const { baseAllowed } = resolveAllowed(toolId);
    const n = normalizeTool(toolId);
    if (nextEnabled) {
      nextDeny.delete(n);
      if (!baseAllowed) { nextAllow.add(n); }
    } else {
      nextAllow.delete(n);
      nextDeny.add(n);
    }
    changeToolsOverrides(agentId, [...nextAllow], [...nextDeny]);
    void saveConfig();
  };

  const handleProfileChange = (profile: ToolProfileId) => {
    const next = profile === "inherit" ? null : profile;
    changeToolsProfile(agentId, next, true); // clearAllow=true resets overrides
    void saveConfig();
  };

  const editable = Boolean(configForm) && !configLoading && !configSaving && !agentToolsConfig.hasAllow;

  // Group labels for dialog category filter
  const groupLabels = useMemo(() => {
    if (!toolsCatalogResult) { return []; }
    return toolsCatalogResult.groups.map((g) => ({ id: g.label, label: g.label }));
  }, [toolsCatalogResult]);

  // Preview: first 6 tools (2 rows × 3 cols)
  const previewTools = allCatalogTools.slice(0, 6);
  const hasMoreTools = allCatalogTools.length > 6;
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <SectionCard>
      {/* Header row: label + current profile badge */}
      <div className="flex items-center justify-between mb-6">
        <SectionLabel>Tools & Capabilities</SectionLabel>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-[#8E8E93] font-semibold">{allCatalogTools.length} total</span>
          {/* Current profile badge */}
          <span className="px-2.5 py-0.5 rounded-full bg-[#F3F4F6] text-[11px] font-bold text-[#8E8E93]">
            {PROFILE_LABELS[currentProfile]}
          </span>
        </div>
      </div>

      {toolsCatalogLoading && !toolsCatalogResult && (
        <div className="flex items-center gap-2 text-[#8E8E93] text-sm">
          <Loader2Icon className="size-4 animate-spin" /> Loading tools…
        </div>
      )}
      {toolsCatalogError && <p className="text-sm text-red-500">{toolsCatalogError}</p>}

      {/* 3-col grid — preview only (first 6) */}
      {previewTools.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {previewTools.map((tool) => {
            const { allowed } = resolveAllowed(tool.id);
            return (
              <div
                key={tool.id}
                title={tool.description}
                className={cn(
                  "flex items-center justify-between bg-white rounded-[20px] px-4 h-13.5 shadow-sm",
                  !allowed && "opacity-60",
                )}
              >
                <span className={cn("text-[13px] font-semibold truncate flex-1 mr-2 font-mono", allowed ? "text-black" : "text-[#8E8E93]")}>
                  {tool.id}
                </span>
                <AppleToggle
                  checked={allowed}
                  disabled={!editable}
                  onChange={() => updateTool(tool.id, !allowed)}
                />
              </div>
            );
          })}
        </div>
      )}

      {previewTools.length === 0 && !toolsCatalogLoading && (
        <p className="text-sm text-[#8E8E93]">No tools registered.</p>
      )}

      {/* "More" button */}
      {hasMoreTools && (
        <div className="flex justify-end mt-4">
          <button
            type="button"
            onClick={() => setDialogOpen(true)}
            className="text-[12px] font-semibold text-[#BA0034] hover:underline"
          >
            View all {allCatalogTools.length} tools →
          </button>
        </div>
      )}

      {/* Saving indicator */}
      {configDirty && (
        <div className="flex items-center gap-1.5 mt-4 text-[11px] text-[#8E8E93]">
          <Loader2Icon className="size-3 animate-spin" /> Saving…
        </div>
      )}

      <ToolsDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        agentId={agentId}
        allTools={allCatalogTools}
        groupLabels={groupLabels}
        resolveAllowed={resolveAllowed}
        updateTool={updateTool}
        editable={editable}
        currentProfile={currentProfile}
        handleProfileChange={handleProfileChange}
      />
    </SectionCard>
  );
}
