import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Loader2Icon, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAgentsStore } from "@/store/agents.store";
import { SectionCard } from "./shared";

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

  return (
    <SectionCard>
      {agentFilesLoading && !agentFilesList && (
        <div className="flex items-center gap-2 text-[#8E8E93] text-sm mt-4">
          <Loader2Icon className="size-4 animate-spin" /> Loading soul…
        </div>
      )}
      {agentFilesError && <p className="text-sm text-red-500 mt-4">{agentFilesError}</p>}

      {!agentFilesLoading && !agentFilesError && (
        <div className="mt-4 flex flex-col gap-3">
          <div className="flex items-center justify-start">
            <div className="flex gap-2">
              {!isEditMode ? (
                <button
                  type="button"
                  className=""
                  onClick={() => setIsEditMode(true)}
                >
                  <Pencil className="size-4 text-black" />
                </button>
              ) : (
                <>
                  {isDirty && (
                    <button
                      type="button"
                      className="text-[13px] text-[#8E8E93] hover:text-black px-3 py-1"
                      onClick={() => {
                        resetFileDraft("SOUL.md");
                        setIsEditMode(false);
                      }}
                      disabled={agentFileSaving}
                    >
                      Reset
                    </button>
                  )}
                  <button
                    type="button"
                    className="text-[13px] text-[#8E8E93] hover:text-black px-3 py-1"
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
                      "text-[13px] font-semibold px-4 py-1 rounded-full transition-colors",
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
          </div>

          {!isEditMode ? (
            <div className="rounded-2xl pb-4">
              {hasFile || content ? (
                <div className="prose prose-sm max-w-none prose-headings:font-bold prose-p:text-black prose-li:text-black prose-code:text-[#BA0034]">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {content || "*Empty soul file.*"}
                  </ReactMarkdown>
                </div>
              ) : (
                <p className="text-xs text-[#8E8E93]">
                  SOUL.md file does not exist yet — click Edit to create it.
                </p>
              )}
            </div>
          ) : (
            <textarea
              className="w-full resize-none rounded-2xl bg-white px-4 py-3 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-[#BA0034]/20"
              value={content}
              onChange={(e) => changeFileDraft("SOUL.md", e.target.value)}
              spellCheck={false}
              rows={20}
              placeholder="# SOUL.md - Your Soul

Describe your core philosophy, values, and behavior..."
            />
          )}
        </div>
      )}
    </SectionCard>
  );
}
