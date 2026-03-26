import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ChevronRightIcon,
  FileTextIcon,
  Loader2Icon,
  RefreshCwIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useAgentsStore } from "@/store/agents.store";
import { useGatewayStore } from "@/store/gateway.store";
import { ProfileHeroSection, ProfessionalSummarySection } from "../components/agents/profile";
import { CoreSkillsSection } from "../components/agents/skills";
import { ToolsSection } from "../components/agents/tools";

// ── Section card wrapper ───────────────────────────────────────────────────────

function SectionCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("bg-[#FBFBFB] rounded-3xl p-8", className)}>
      {children}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-bold text-[#8E8E93] uppercase tracking-wide">{children}</p>
  );
}

// ── Profile / Summary / Skills moved to ./agents/* ───────────────────────────

// ── Files Section ─────────────────────────────────────────────────────────────

function isMarkdownFile(name: string) {
  const n = name.toLowerCase();
  return n.endsWith(".md") || n.endsWith(".mdx");
}

function FilesSection({ agentId }: { agentId: string }) {
  const agentFilesList = useAgentsStore((s) => s.agentFilesList);
  const agentFilesLoading = useAgentsStore((s) => s.agentFilesLoading);
  const agentFilesError = useAgentsStore((s) => s.agentFilesError);
  const agentFileActive = useAgentsStore((s) => s.agentFileActive);
  const agentFileContents = useAgentsStore((s) => s.agentFileContents);
  const agentFileDrafts = useAgentsStore((s) => s.agentFileDrafts);
  const agentFileSaving = useAgentsStore((s) => s.agentFileSaving);
  const loadAgentFiles = useAgentsStore((s) => s.loadAgentFiles);
  const loadFileContent = useAgentsStore((s) => s.loadFileContent);
  const selectFile = useAgentsStore((s) => s.selectFile);
  const changeFileDraft = useAgentsStore((s) => s.changeFileDraft);
  const resetFileDraft = useAgentsStore((s) => s.resetFileDraft);
  const saveFile = useAgentsStore((s) => s.saveFile);
  const [mdEditMode, setMdEditMode] = useState(false);

  useEffect(() => {
    if (agentFilesList?.agentId !== agentId) { void loadAgentFiles(agentId); }
  }, [agentId, agentFilesList?.agentId, loadAgentFiles]);

  const files = agentFilesList?.files ?? [];

  const handleSelect = (name: string) => {
    setMdEditMode(false);
    selectFile(name);
    if (!(name in agentFileContents)) { void loadFileContent(agentId, name); }
  };

  useEffect(() => {
    if (!agentFileActive && files.length > 0) {
      handleSelect(files[0].name);
    }
  }, [agentFileActive, files]);

  return (
    <SectionCard>
      <SectionLabel>Agent Files</SectionLabel>

      {agentFilesLoading && !agentFilesList && (
        <div className="flex items-center gap-2 text-[#8E8E93] text-sm mt-4">
          <Loader2Icon className="size-4 animate-spin" /> Loading files…
        </div>
      )}
      {agentFilesError && <p className="text-sm text-red-500 mt-4">{agentFilesError}</p>}

      {files.length > 0 && (
        <div className="mt-6">
          <Tabs
            value={agentFileActive ?? files[0]?.name}
            onValueChange={handleSelect}
            className="gap-4"
          >
              <TabsList variant="line" className="bg-transparent p-0 w-max min-w-full justify-start">
                {files.map((f) => {
                  const hasDraft = f.name in agentFileDrafts;
                  return (
                    <TabsTrigger
                      key={f.name}
                      value={f.name}
                      className={cn(
                        "h-auto px-2 py-2 rounded-lg border border-transparent data-[state=active]:border-[#E5E7EB] data-[state=active]:bg-white",
                        "data-[state=active]:text-[#BA0034] font-mono text-[13px]",
                      )}
                    >
                      <span className="truncate">{f.name}</span>
                      {hasDraft && <span className="ml-1.5 inline-block size-1.5 rounded-full bg-amber-400 align-middle" />}
                    </TabsTrigger>
                  );
                })}
              </TabsList>

            {files.map((f) => {
              const isMarkdown = isMarkdownFile(f.name);
              const base = agentFileContents[f.name] ?? "";
              const fileDraft = agentFileDrafts[f.name];
              const fileContent = fileDraft ?? base;
              const fileDirty = fileDraft !== undefined && fileDraft !== base;
              const isEditing = !isMarkdown || mdEditMode;

              return (
                <TabsContent key={f.name} value={f.name} className="mt-2">
                  <div className="rounded-2xl p-4 flex flex-col gap-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[13px] font-bold font-mono text-[#BA0034] truncate">{f.name}</p>
                        <p className="text-[12px] text-[#8E8E93] truncate">{f.path}</p>
                      </div>
                      <div className="text-[11px] font-bold text-[#8E8E93] shrink-0">
                        {f.updatedAtMs
                          ? new Date(f.updatedAtMs).toLocaleDateString()
                          : f.size !== undefined
                            ? (f.size < 1024 ? `${f.size}B` : `${(f.size / 1024).toFixed(1)}KB`)
                            : ""}
                      </div>
                    </div>

                    {f.missing && !fileContent && (
                      <p className="text-xs text-[#8E8E93]">File does not exist yet — will be created on save.</p>
                    )}

                    {!isEditing ? (
                      <div className="rounded-2xl bg-white px-5 py-4">
                        <div className="prose prose-sm max-w-none prose-headings:font-bold prose-p:text-black prose-li:text-black prose-code:text-[#BA0034]">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {fileContent || "*Empty markdown file.*"}
                          </ReactMarkdown>
                        </div>
                      </div>
                    ) : (
                      <textarea
                        className="w-full resize-none rounded-2xl bg-white px-4 py-3 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-[#BA0034]/20"
                        value={fileContent}
                        onChange={(e) => changeFileDraft(f.name, e.target.value)}
                        spellCheck={false}
                        rows={14}
                      />
                    )}

                    <div className="flex gap-2 justify-end">
                      {isMarkdown && !mdEditMode ? (
                        <button
                          type="button"
                          className="text-[13px] font-semibold px-4 py-1 rounded-full bg-[#111827] text-white hover:bg-black"
                          onClick={() => setMdEditMode(true)}
                        >
                          Edit
                        </button>
                      ) : (
                        <>
                          {isMarkdown && (
                            <button
                              type="button"
                              className="text-[13px] text-[#8E8E93] hover:text-black px-3 py-1"
                              onClick={() => setMdEditMode(false)}
                            >
                              Preview
                            </button>
                          )}
                          {fileDirty && (
                            <button
                              type="button"
                              className="text-[13px] text-[#8E8E93] hover:text-black px-3 py-1"
                              onClick={() => resetFileDraft(f.name)}
                            >
                              Reset
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={!fileDirty || agentFileSaving}
                            onClick={() => void saveFile(f.name)}
                            className={cn(
                              "text-[13px] font-semibold px-4 py-1 rounded-full transition-colors",
                              fileDirty && !agentFileSaving
                                ? "bg-[#BA0034] text-white hover:bg-[#9b0029]"
                                : "bg-[#E5E7EB] text-[#8E8E93] cursor-not-allowed",
                            )}
                          >
                            {agentFileSaving ? "Saving…" : "Save"}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </TabsContent>
              );
            })}
          </Tabs>
        </div>
      )}
      {files.length === 0 && !agentFilesLoading && (
        <p className="text-sm text-[#8E8E93] mt-4">No files found.</p>
      )}
    </SectionCard>
  );
}

// ── Tools moved to ./agents/tools ───────────────────────────────────────────

// ── Agent list item ───────────────────────────────────────────────────────────

function AgentListItem({
  name, emoji, selected, onClick,
}: {
  id: string; name: string; emoji?: string; selected: boolean; onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 px-3 py-2.5 text-left rounded-lg transition-colors",
        selected
          ? "bg-accent text-accent-foreground"
          : "hover:bg-muted/60 text-muted-foreground hover:text-foreground",
      )}
    >
      <span className="shrink-0 text-lg leading-none">{emoji ?? "🤖"}</span>
      <span className="flex-1 text-sm font-medium truncate">{name}</span>
      <ChevronRightIcon className={cn("size-3.5 shrink-0 transition-transform", selected && "rotate-90")} />
    </button>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function AgentsPage() {
  const isConnected = useGatewayStore((s) => s.status === "connected");
  const loading     = useAgentsStore((s) => s.loading);
  const error       = useAgentsStore((s) => s.error);
  const agentsList  = useAgentsStore((s) => s.agentsList);
  const selectedId  = useAgentsStore((s) => s.selectedAgentId);
  const loadAgents  = useAgentsStore((s) => s.loadAgents);
  const selectAgent = useAgentsStore((s) => s.selectAgent);

  useEffect(() => {
    if (isConnected && !agentsList) { void loadAgents(); }
  }, [isConnected, agentsList, loadAgents]);

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
  const showFilesSection = false;

  return (
    <div className="flex h-full overflow-hidden">
      {/* Sidebar */}
      {agents?.length > 1 && (
        <div className="w-52 shrink-0 border-r flex flex-col">
          <div className="flex items-center justify-between px-3 py-3 border-b shrink-0">
            <h2 className="text-sm font-semibold">Agents</h2>
            <Button
              size="icon"
              variant="ghost"
              className="size-7"
              disabled={loading}
              onClick={() => void loadAgents()}
              title="Refresh"
            >
              <RefreshCwIcon
                className={cn("size-3.5", loading && "animate-spin")}
              />
            </Button>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-2 space-y-0.5">
              {agents.map((agent) => {
                const ident = agent.identity as
                  | Record<string, unknown>
                  | undefined;
                return (
                  <AgentListItem
                    key={agent.id}
                    id={agent.id}
                    name={(agent.name ?? ident?.name ?? agent.id) as string}
                    emoji={ident?.emoji as string | undefined}
                    selected={selectedId === agent.id}
                    onClick={() => selectAgent(agent.id)}
                  />
                );
              })}
            </div>
          </ScrollArea>
        </div>
      )}

      {/* Main content */}
      {selectedId ? (
        <ScrollArea className="flex-1 bg-white">
          <div className="px-8 pt-12 pb-32 max-w-4xl mx-auto flex flex-col gap-8">
            {/* Profile Hero */}
            <ProfileHeroSection agentId={selectedId} />

            {/* Professional Summary */}
            <ProfessionalSummarySection agentId={selectedId} />

            {/* Core Skills */}
            <CoreSkillsSection agentId={selectedId} />

            {/* Tools */}
            <ToolsSection agentId={selectedId} />

            {/* Agent Files (temporary hidden) */}
            {showFilesSection && <FilesSection agentId={selectedId} />}
          </div>
        </ScrollArea>
      ) : (
        <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
          <div className="flex flex-col items-center gap-3 text-center">
            <FileTextIcon className="size-10 text-[#E5E7EB]" />
            <p>Select an agent to view details.</p>
          </div>
        </div>
      )}
    </div>
  );
}
