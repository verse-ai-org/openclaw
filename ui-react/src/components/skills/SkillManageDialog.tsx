import { AlertTriangle, Download, Pencil, RotateCcw, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";
import { plainMdComponents } from "@/components/assistant-ui/markdown-text";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { parseSkillMarkdown } from "@/lib/skill-markdown";
import { computeSkillMissing, computeSkillReasons } from "@/lib/skills-grouping";
import type { SkillMessage } from "@/store/skills.store";
import type {
  SkillFileGetParams,
  SkillFileResult,
  SkillFileSetParams,
  SkillFileSetResult,
  SkillStatusEntry,
} from "@/types/skills";

function SkillIconButton({
  icon: Icon,
  label,
  onClick,
  disabled,
  danger,
}: {
  icon: React.ElementType;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={[
        "flex size-8 items-center justify-center rounded-full transition-colors disabled:opacity-40",
        danger
          ? "text-destructive/50 hover:bg-destructive/10 hover:text-destructive"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      ].join(" ")}
    >
      <Icon size={15} />
    </button>
  );
}

/** Enable / disable / install — aligned to the header row (top right). */
function SkillHeaderPrimaryActions({
  skill,
  busy,
  onToggle,
  onInstall,
}: {
  skill: SkillStatusEntry;
  busy: boolean;
  onToggle: () => void;
  onInstall: (installId: string) => void;
}) {
  const canInstall = skill.install.length > 0 && skill.missing.bins.length > 0;
  const isDisabled = skill.disabled;

  return (
    <div className="flex shrink-0 items-center gap-2">
      {canInstall ? (
        <Button
          type="button"
          size="sm"
          disabled={busy}
          onClick={() => onInstall(skill.install[0].id)}
          className="rounded-full font-semibold"
        >
          {busy ? <Download className="size-3.5 animate-pulse" /> : "Install"}
        </Button>
      ) : (
        <div className="flex items-center gap-2">
          <Switch
            checked={!isDisabled}
            onCheckedChange={() => onToggle()}
            disabled={busy}
            size="default"
            aria-label={isDisabled ? "Enable skill" : "Disable skill"}
          />
        </div>
      )}
    </div>
  );
}

function SkillDialogCredentials({
  skill,
  busy,
  apiKeyEdit,
  envDrafts,
  message,
  onEdit,
  onSaveKey,
  onSaveEnvVar,
  setEnvDrafts,
}: {
  skill: SkillStatusEntry;
  busy: boolean;
  apiKeyEdit: string;
  envDrafts: Record<string, string>;
  message: SkillMessage | null;
  onEdit: (value: string) => void;
  onSaveKey: () => void;
  onSaveEnvVar: (envKey: string, value: string) => void;
  setEnvDrafts: React.Dispatch<React.SetStateAction<Record<string, string>>>;
}) {
  const [primaryApiKeyEditing, setPrimaryApiKeyEditing] = useState(false);

  const primaryEnv = skill.primaryEnv;
  /** Gateway marks env satisfied when process.env, skills.entries.<key>.env[name], or .apiKey matches primaryEnv (see src/agents/skills-status.ts). */
  const primaryEnvSatisfied =
    typeof primaryEnv === "string" && !skill.missing.env.includes(primaryEnv);

  useEffect(() => {
    setPrimaryApiKeyEditing(false);
  }, [skill.skillKey]);

  useEffect(() => {
    if (message?.kind === "success" && message.message === "API key saved") {
      setPrimaryApiKeyEditing(false);
      onEdit("");
    }
  }, [message]);

  const showPrimaryKeyInput =
    typeof primaryEnv === "string" && (!primaryEnvSatisfied || primaryApiKeyEditing);

  const extraEnvKeys = skill.missing.env.filter((envKey) => envKey !== skill.primaryEnv);

  return (
    <div className="flex shrink-0 flex-col gap-2 mt-4">
      {typeof primaryEnv === "string" && (
        <div className="flex flex-wrap items-center gap-2">
          {showPrimaryKeyInput ? (
            <>
              <Input
                type="password"
                placeholder={primaryEnvSatisfied ? `New ${primaryEnv}` : "Enter API Key"}
                value={apiKeyEdit}
                onChange={(e) => onEdit(e.target.value)}
                disabled={busy}
                autoComplete="off"
                className="h-10 min-w-[12rem] flex-1 rounded-[18px] bg-muted px-4 text-[12px] focus-visible:ring-primary/30"
              />
              <Button
                type="button"
                disabled={busy || !apiKeyEdit.trim()}
                onClick={onSaveKey}
                className="h-10 shrink-0 rounded-[18px] px-4 text-[12px] font-bold"
              >
                Save Key
              </Button>
              {primaryEnvSatisfied && (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={busy}
                  className="h-10 shrink-0 rounded-[18px] px-3 text-[12px] font-semibold"
                  onClick={() => {
                    setPrimaryApiKeyEditing(false);
                    onEdit("");
                  }}
                >
                  Cancel
                </Button>
              )}
            </>
          ) : (
            <>
              <div
                className="flex h-10 min-w-[12rem] flex-1 items-center gap-3 rounded-[18px] border border-border bg-muted px-4"
                aria-label={`${primaryEnv} is configured`}
              >
                <span
                  className="select-none font-mono text-sm tracking-[0.25em] text-muted-foreground"
                  aria-hidden
                >
                  ••••••••
                </span>
                <span className="truncate text-[11px] text-muted-foreground">{primaryEnv}</span>
              </div>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                className="h-10 shrink-0 rounded-[18px] px-4 text-[12px] font-bold"
                onClick={() => setPrimaryApiKeyEditing(true)}
              >
                Edit
              </Button>
            </>
          )}
        </div>
      )}
      {extraEnvKeys.map((envKey) => (
        <div key={envKey} className="flex flex-wrap items-center gap-2">
          <Input
            type="password"
            placeholder={envKey}
            value={envDrafts[envKey] ?? ""}
            onChange={(e) => setEnvDrafts((prev) => ({ ...prev, [envKey]: e.target.value }))}
            disabled={busy}
            className="h-10 min-w-[12rem] flex-1 rounded-[18px] bg-muted px-4 text-[12px] focus-visible:ring-primary/30"
          />
          <Button
            type="button"
            disabled={busy || !(envDrafts[envKey] ?? "").trim()}
            className="h-10 shrink-0 rounded-[18px] px-4 text-[12px] font-bold"
            onClick={() => {
              const val = (envDrafts[envKey] ?? "").trim();
              if (val) {
                onSaveEnvVar(envKey, val);
                setEnvDrafts((prev) => ({ ...prev, [envKey]: "" }));
              }
            }}
          >
            Save Key
          </Button>
        </div>
      ))}
    </div>
  );
}

function SkillDialogFeedback({
  busy,
  message,
  confirmRemove,
  canRemove,
  onToggle,
  onRemove,
  setConfirmRemove,
}: {
  busy: boolean;
  message: SkillMessage | null;
  confirmRemove: boolean;
  canRemove: boolean;
  onToggle: () => void;
  onRemove?: () => void;
  setConfirmRemove: (v: boolean) => void;
}) {
  const hasError = message?.kind === "error";

  if (!canRemove && !hasError) {
    return null;
  }

  return (
    <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-b border-border pb-3">
      <div className="flex items-center gap-0.5">
        {hasError && (
          <SkillIconButton icon={RotateCcw} label="Retry" onClick={onToggle} disabled={busy} />
        )}
        {canRemove && !confirmRemove && (
          <SkillIconButton
            icon={Trash2}
            label="Remove"
            onClick={() => setConfirmRemove(true)}
            disabled={busy}
            danger
          />
        )}
        {canRemove && confirmRemove && (
          <>
            <SkillIconButton
              icon={Trash2}
              label="Confirm remove"
              onClick={() => {
                setConfirmRemove(false);
                onRemove?.();
              }}
              disabled={busy}
              danger
            />
            <SkillIconButton
              icon={X}
              label="Cancel"
              onClick={() => setConfirmRemove(false)}
              disabled={busy}
            />
          </>
        )}
      </div>
    </div>
  );
}

/** Reserves vertical space so dialog layout stays stable while SKILL.md loads. */
function SkillMarkdownLoadingSkeleton() {
  return (
    <div
      className="flex min-h-[min(52vh,420px)] flex-col gap-3"
      aria-busy="true"
      aria-label="Loading skill documentation"
    >
      <Skeleton className="h-5 w-[55%]" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-[92%]" />
      <div className="mt-5 flex flex-col gap-2">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-[88%]" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-[76%]" />
      </div>
    </div>
  );
}

function SkillMarkdownPanel({
  detailLoading,
  detailError,
  detailEditing,
  detailDraft,
  detailFrontmatter,
  detailBodyContent,
  onDraftChange,
}: {
  detailLoading: boolean;
  detailError: string | null;
  detailEditing: boolean;
  detailDraft: string;
  detailFrontmatter: string;
  detailBodyContent: string;
  onDraftChange: (value: string) => void;
}) {
  if (detailLoading) {
    return <SkillMarkdownLoadingSkeleton />;
  }
  if (detailError) {
    return <p className="text-sm text-destructive">{detailError}</p>;
  }
  if (detailEditing) {
    return (
      <textarea
        className="box-border block min-h-[min(52vh,420px)] w-full min-w-0 max-w-full resize-y rounded-md border border-input bg-background p-3 font-mono text-sm leading-6 outline-none focus:ring-2 focus:ring-ring"
        value={detailDraft}
        onChange={(e) => onDraftChange(e.target.value)}
      />
    );
  }
  return (
    <div className="flex min-w-0 flex-col gap-3 overflow-x-auto text-sm leading-6">
      {detailFrontmatter && (
        <details className="rounded-md border bg-background/70 p-2">
          <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
            Metadata (frontmatter)
          </summary>
          <pre className="mt-2 overflow-auto whitespace-pre-wrap break-words rounded bg-muted/60 p-2 font-mono text-xs leading-5">
            {detailFrontmatter}
          </pre>
        </details>
      )}
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={plainMdComponents}>
        {detailBodyContent || "(empty)"}
      </ReactMarkdown>
    </div>
  );
}

export type SkillManageDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  skill: SkillStatusEntry | null;
  busy: boolean;
  apiKeyEdit: string;
  message: SkillMessage | null;
  onToggle: () => void;
  onEdit: (value: string) => void;
  onSaveKey: () => void;
  onInstall: (installId: string) => void;
  onSaveEnvVar: (envKey: string, value: string) => void;
  onRemove?: () => void;
  getSkillFile: (params: SkillFileGetParams) => Promise<SkillFileResult | null>;
  saveSkillFile: (params: SkillFileSetParams) => Promise<SkillFileSetResult | null>;
  onSkillsReload: () => Promise<void>;
};

export function SkillManageDialog({
  open,
  onOpenChange,
  skill,
  busy,
  apiKeyEdit,
  message,
  onToggle,
  onEdit,
  onSaveKey,
  onInstall,
  onSaveEnvVar,
  onRemove,
  getSkillFile,
  saveSkillFile,
  onSkillsReload,
}: SkillManageDialogProps) {
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailContent, setDetailContent] = useState("");
  const [detailEditing, setDetailEditing] = useState(false);
  const [detailDraft, setDetailDraft] = useState("");
  const [detailSaving, setDetailSaving] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [envDrafts, setEnvDrafts] = useState<Record<string, string>>({});

  const canRemove =
    onRemove !== undefined &&
    (skill?.source === "openclaw-workspace" || skill?.source === "openclaw-managed");

  /** Toast when gateway-backed actions finish (`busy` → idle), avoiding duplicate inline banner text. */
  const prevBusyRef = useRef(false);

  useEffect(() => {
    prevBusyRef.current = false;
  }, [skill?.skillKey]);

  useEffect(() => {
    if (!open || !skill) {
      prevBusyRef.current = false;
      return;
    }
    const ended = prevBusyRef.current && !busy;
    prevBusyRef.current = busy;
    if (!ended || !message) {
      return;
    }
    if (message.kind === "success") {
      toast.success(message.message, { duration: 2600 });
    } else {
      toast.error(message.message, { duration: 4500 });
    }
  }, [open, skill, busy, message]);

  useEffect(() => {
    if (!open) {
      setDetailEditing(false);
      setDetailError(null);
      setDetailSaving(false);
      setDetailContent("");
      setDetailDraft("");
      setDetailLoading(false);
      setConfirmRemove(false);
      setEnvDrafts({});
    }
  }, [open]);

  useEffect(() => {
    if (!open || !skill) {
      return;
    }

    const target = skill;
    let cancelled = false;
    setConfirmRemove(false);
    setEnvDrafts({});
    setDetailError(null);
    setDetailLoading(true);
    setDetailContent("");
    setDetailDraft("");
    setDetailEditing(false);

    async function load() {
      try {
        const file = await getSkillFile({ baseDir: target.baseDir, source: target.source });
        if (cancelled) {
          return;
        }
        if (!file) {
          setDetailError("Unable to load SKILL.md");
          return;
        }
        const content = file.file.content ?? "";
        setDetailContent(content);
        setDetailDraft(content);
      } catch {
        if (!cancelled) {
          setDetailError("Unable to load SKILL.md");
        }
      } finally {
        if (!cancelled) {
          setDetailLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [open, skill?.skillKey, skill?.baseDir, skill?.source, getSkillFile]);

  const parsedDetail = useMemo(() => parseSkillMarkdown(detailContent), [detailContent]);
  const detailBodyContent = parsedDetail.body;
  const detailFrontmatter = parsedDetail.frontmatter;

  const missing = skill ? computeSkillMissing(skill) : [];
  const reasons = skill ? computeSkillReasons(skill) : [];
  const statusHint = [
    missing.length > 0 ? `Missing: ${missing.join(", ")}` : "",
    reasons.length > 0 ? reasons.join(", ") : "",
  ]
    .filter(Boolean)
    .join(" · ");
  const hasError = message?.kind === "error";
  const showStatusHint =
    skill !== null && (missing.length > 0 || !skill.eligible || hasError) && Boolean(statusHint);
  const sourceLabel = skill ? skill.source.replace("openclaw-", "") : "";

  const saveSkillDetail = async () => {
    if (!skill) {
      return;
    }
    setDetailSaving(true);
    setDetailError(null);
    try {
      const result = await saveSkillFile({
        baseDir: skill.baseDir,
        source: skill.source,
        content: detailDraft,
      });
      if (!result) {
        setDetailError("Unable to save SKILL.md");
        return;
      }
      const next = result.file.content ?? detailDraft;
      setDetailContent(next);
      setDetailDraft(next);
      setDetailEditing(false);
      await onSkillsReload();
      toast.success("SKILL.md saved", { duration: 2600 });
    } catch {
      setDetailError("Unable to save SKILL.md");
    } finally {
      setDetailSaving(false);
    }
  };

  const toggleEditMarkdown = () => {
    if (detailEditing) {
      setDetailDraft(detailContent);
      setDetailEditing(false);
    } else {
      setDetailDraft(detailContent);
      setDetailEditing(true);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(88vh,840px)] max-h-[min(88vh,840px)] min-h-0 w-[min(72vw,720px)] flex-col gap-0 overflow-hidden rounded-xl p-0 sm:max-w-none">
        {skill ? (
          <>
            <DialogHeader className="shrink-0 gap-0 border-b border-border pl-6 pr-4 pt-12 pb-4 text-left">
              <div className="flex items-start gap-4">
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <DialogTitle className="text-left text-[17px] leading-snug">
                      {skill.name}
                    </DialogTitle>
                    {showStatusHint && (
                      <Tooltip delayDuration={400}>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            tabIndex={-1}
                            className="mt-0.5 shrink-0 rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                            aria-label={statusHint}
                          >
                            <AlertTriangle
                              className={[
                                "size-[15px]",
                                hasError ? "text-destructive" : "text-amber-400",
                              ].join(" ")}
                              aria-hidden
                            />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="max-w-[260px] text-[11px]">
                          {statusHint}
                        </TooltipContent>
                      </Tooltip>
                    )}
                    <span className="inline-flex shrink-0 items-center rounded-md bg-muted px-2 py-[3px] text-[9px] font-bold uppercase tracking-wide text-muted-foreground">
                      {sourceLabel}
                    </span>
                  </div>
                  <DialogDescription className="text-left text-[13px] leading-relaxed text-muted-foreground">
                    {skill.description}
                  </DialogDescription>
                </div>
                <SkillHeaderPrimaryActions
                  skill={skill}
                  busy={busy}
                  onToggle={onToggle}
                  onInstall={onInstall}
                />
              </div>
            </DialogHeader>

            <div className="flex min-h-0 min-w-0 flex-1 flex-col px-6 pb-4">
              <SkillDialogCredentials
                skill={skill}
                busy={busy}
                apiKeyEdit={apiKeyEdit}
                envDrafts={envDrafts}
                message={message}
                onEdit={onEdit}
                onSaveKey={onSaveKey}
                onSaveEnvVar={onSaveEnvVar}
                setEnvDrafts={setEnvDrafts}
              />

              <SkillDialogFeedback
                busy={busy}
                message={message}
                confirmRemove={confirmRemove}
                canRemove={canRemove}
                onToggle={onToggle}
                onRemove={onRemove}
                setConfirmRemove={setConfirmRemove}
              />

              <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-1 overflow-hidden">
                <div className="flex shrink-0 justify-end">
                  <Tooltip delayDuration={400}>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        disabled={detailLoading || detailSaving || busy}
                        onClick={toggleEditMarkdown}
                        className="size-7 rounded-full shadow-sm [&_svg]:size-3.5"
                        aria-label={detailEditing ? "Cancel editing SKILL.md" : "Edit SKILL.md"}
                      >
                        {detailEditing ? (
                          <X className="size-3.5" aria-hidden />
                        ) : (
                          <Pencil className="size-3.5" aria-hidden />
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      {detailEditing ? "Cancel edit" : "Edit SKILL.md"}
                    </TooltipContent>
                  </Tooltip>
                </div>
                <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-muted/25">
                  <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain p-4">
                    <SkillMarkdownPanel
                      detailLoading={detailLoading}
                      detailError={detailError}
                      detailEditing={detailEditing}
                      detailDraft={detailDraft}
                      detailFrontmatter={detailFrontmatter}
                      detailBodyContent={detailBodyContent}
                      onDraftChange={setDetailDraft}
                    />
                  </div>
                </div>
              </div>
            </div>

            <DialogFooter className="shrink-0 gap-2 border-t border-border px-6 py-4">
              {detailEditing && (
                <Button
                  type="button"
                  onClick={() => void saveSkillDetail()}
                  disabled={detailSaving || detailLoading}
                >
                  {detailSaving ? "Saving…" : "Save SKILL.md"}
                </Button>
              )}
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
