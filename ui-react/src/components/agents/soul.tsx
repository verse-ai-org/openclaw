import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Loader2Icon, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAgentsStore } from "@/store/agents.store";
import { SectionCard } from "./shared";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function SoulSection({ agentId }: { agentId: string }) {
  const agentFilesList = useAgentsStore((s) => s.agentFilesList);
  const agentFilesLoading = useAgentsStore((s) => s.agentFilesLoading);
  const agentFilesError = useAgentsStore((s) => s.agentFilesError);
  const agentFileContents = useAgentsStore((s) => s.agentFileContents);
  const agentFileDrafts = useAgentsStore((s) => s.agentFileDrafts);
  const agentFileSaving = useAgentsStore((s) => s.agentFileSaving);
  const loadAgentFiles = useAgentsStore((s) => s.loadAgentFiles);
  const loadFileContent = useAgentsStore((s) => s.loadFileContent);
  const changeFileDraft = useAgentsStore((s) => s.changeFileDraft);
  const resetFileDraft = useAgentsStore((s) => s.resetFileDraft);
  const saveFile = useAgentsStore((s) => s.saveFile);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);

  useEffect(() => {
    if (agentFilesList?.agentId !== agentId) {
      void loadAgentFiles(agentId);
    }
  }, [agentId, agentFilesList?.agentId, loadAgentFiles]);

  useEffect(() => {
    if (!("SOUL.md" in agentFileContents)) {
      void loadFileContent(agentId, "SOUL.md");
    }
  }, [agentId, agentFileContents, loadFileContent]);

  const baseContent = agentFileContents["SOUL.md"] ?? "";
  const draft = agentFileDrafts["SOUL.md"];
  const content = draft ?? baseContent;
  const isDirty = draft !== undefined && draft !== baseContent;

  const soulFile = agentFilesList?.files.find((f) => f.name === "SOUL.md");
  const hasFile = soulFile !== undefined;

  // Collapsed row — always visible at the bottom
  return (
    <>
      <SectionCard className="py-3">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-bold text-[#8E8E93] uppercase tracking-wide">Soul</p>
          <div className="flex items-center gap-3">
            {agentFilesLoading && !agentFilesList && (
              <Loader2Icon className="size-3.5 animate-spin text-[#8E8E93]" />
            )}
            {agentFilesError && (
              <span className="text-[11px] text-red-500">{agentFilesError}</span>
            )}
            {/* Red "View / Edit" trigger */}
            <button
              type="button"
              onClick={() => { setIsEditMode(false); setDialogOpen(true); }}
              className="text-[12px] font-semibold text-[#BA0034] hover:underline"
            >
              View →
            </button>
          </div>
        </div>
        {/* Brief preview: first line of content */}
        {!agentFilesLoading && (hasFile || content) && (
          <p className="text-[11px] text-[#8E8E93] mt-1.5 truncate">
            {content.split("\n").find((l) => l.trim())?.replace(/^#+\s*/, "") ?? "SOUL.md"}
          </p>
        )}
      </SectionCard>

      {/* Full-content dialog */}
      <Dialog open={dialogOpen} onOpenChange={(v) => { if (!v) { setIsEditMode(false); } setDialogOpen(v); }}>
        <DialogContent className="w-[60vw] max-w-[60vw] sm:max-w-[60vw] h-[75vh] flex flex-col gap-0 p-0 overflow-hidden rounded-3xl">
          <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
            <DialogTitle className="text-[15px] font-bold flex items-center justify-between pr-6">
              <span>Soul</span>
              {/* Edit / Save / Reset controls */}
              <div className="flex items-center gap-2">
                {!isEditMode ? (
                  <button
                    type="button"
                    className="p-1 rounded-full hover:bg-[#F3F4F6] transition-colors"
                    onClick={() => setIsEditMode(true)}
                    title="Edit SOUL.md"
                  >
                    <Pencil className="size-3.5 text-[#8E8E93]" />
                  </button>
                ) : (
                  <>
                    {isDirty && (
                      <button
                        type="button"
                        className="text-[12px] text-[#8E8E93] hover:text-black px-2 py-0.5"
                        onClick={() => { resetFileDraft("SOUL.md"); setIsEditMode(false); }}
                        disabled={agentFileSaving}
                      >
                        Reset
                      </button>
                    )}
                    <button
                      type="button"
                      className="text-[12px] text-[#8E8E93] hover:text-black px-2 py-0.5"
                      onClick={() => setIsEditMode(false)}
                      disabled={agentFileSaving}
                    >
                      Preview
                    </button>
                    <button
                      type="button"
                      disabled={!isDirty || agentFileSaving}
                      onClick={() => void saveFile("SOUL.md").then(() => setIsEditMode(false))}
                      className={cn(
                        "text-[12px] font-semibold px-3 py-0.5 rounded-full transition-colors",
                        isDirty && !agentFileSaving
                          ? "bg-[#BA0034] text-white hover:bg-[#9b0029]"
                          : "bg-[#E5E7EB] text-[#8E8E93] cursor-not-allowed",
                      )}
                    >
                      {agentFileSaving ? "Saving…" : "Save"}
                    </button>
                  </>
                )}
              </div>
            </DialogTitle>
          </DialogHeader>

          {/* Content area */}
          <div className="flex-1 overflow-auto px-6 py-4">
            {!isEditMode ? (
              <div className="prose prose-sm max-w-none text-sm prose-headings:font-bold prose-headings:text-[14px] prose-p:text-[#1A1A1A] prose-p:text-[13px] prose-li:text-[13px] prose-li:text-[#1A1A1A] prose-code:text-[#BA0034] prose-code:text-[12px] leading-relaxed">
                {hasFile || content ? (
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {content || "*Empty soul file.*"}
                  </ReactMarkdown>
                ) : (
                  <p className="text-sm text-[#8E8E93]">
                    SOUL.md file does not exist yet — click Edit to create it.
                  </p>
                )}
              </div>
            ) : (
              <textarea
                className="w-full h-full resize-none rounded-xl bg-white px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-[#BA0034]/20"
                value={content}
                onChange={(e) => changeFileDraft("SOUL.md", e.target.value)}
                spellCheck={false}
                placeholder="# SOUL.md - Your Soul

Describe your core philosophy, values, and behavior..."
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
