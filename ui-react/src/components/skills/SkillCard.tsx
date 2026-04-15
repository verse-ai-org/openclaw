import { useState } from "react";
import { AlertTriangle, Download, FileText, RotateCcw, Trash2, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { computeSkillMissing, computeSkillReasons } from "@/lib/skills-grouping";
import type { SkillMessage } from "@/store/skills.store";
import type { SkillStatusEntry } from "@/types/skills";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/** Small icon button with tooltip via title */
function IconBtn({
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
        "flex size-7 items-center justify-center rounded-full transition-colors disabled:opacity-40",
        danger
          ? "text-destructive/50 hover:bg-destructive/10 hover:text-destructive"
          : "text-muted-foreground hover:bg-black/5 hover:text-foreground",
      ].join(" ")}
    >
      <Icon size={14} className="" />
    </button>
  );
}

interface Props {
  skill: SkillStatusEntry;
  busy: boolean;
  apiKeyEdit: string;
  message: SkillMessage | null;
  onToggle: () => void;
  onEdit: (value: string) => void;
  onSaveKey: () => void;
  onInstall: (installId: string) => void;
  onSaveEnvVar: (envKey: string, value: string) => void;
  onRemove?: () => void;
  onViewDetail: () => void;
}

export function SkillCard({
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
  onViewDetail,
}: Props) {
  const [confirmRemove, setConfirmRemove] = useState(false);
  // Per-env-var draft values for missing.env inputs
  const [envDrafts, setEnvDrafts] = useState<Record<string, string>>({});
  const canRemove =
    onRemove !== undefined &&
    (skill.source === "openclaw-workspace" || skill.source === "openclaw-managed");
  const canInstall = skill.install.length > 0 && skill.missing.bins.length > 0;
  const missing = computeSkillMissing(skill);
  const reasons = computeSkillReasons(skill);

  const isDisabled = skill.disabled;
  const hasError = message?.kind === "error";

  // Tooltip for warning/blocked states
  const statusHint = [
    missing.length > 0 ? `Missing: ${missing.join(", ")}` : "",
    reasons.length > 0 ? reasons.join(", ") : "",
  ]
    .filter(Boolean)
    .join(" · ");

  // Source label: strip "openclaw-" prefix
  const sourceLabel = skill.source.replace("openclaw-", "");

  return (
    <div
      className={[
        "flex flex-col rounded-2xl border p-8 transition-colors",
        isDisabled ? "bg-white/60" : "bg-white",
        hasError ? "opacity-60" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {/* ── Main row: fixed height, no wrap ── */}
      <div className="flex items-center gap-4">
        {/* Skill icon */}
        <div
          className={[
            "relative flex size-12 shrink-0 items-center justify-center rounded-2xl text-xl",
            isDisabled ? "bg-[#F0F0F0]" : "bg-primary/5",
          ].join(" ")}
        >
          <span className={isDisabled ? "opacity-30" : ""}>{skill.emoji ?? "⚡"}</span>
          {/* Warning icon with tooltip: missing / blocked / error */}
          {(missing.length > 0 || !skill.eligible || hasError) && statusHint && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="absolute -top-1 -right-1 flex cursor-default">
                  <AlertTriangle
                    className={[
                      "size-[14px]",
                      hasError ? "text-destructive" : "text-amber-400",
                    ].join(" ")}
                  />
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[220px] text-[11px]">
                {statusHint}
              </TooltipContent>
            </Tooltip>
          )}
        </div>

        {/* Name + source + description */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className={[
                "truncate text-[15px] font-bold leading-snug",
                isDisabled ? "text-muted-foreground" : "text-[#1A1C1D]",
              ].join(" ")}
            >
              {skill.name}
            </span>
            {/* Single source pill */}
            <span className="shrink-0 inline-flex items-center rounded-md bg-black/5 px-2 py-[2px] text-[9px] font-bold uppercase tracking-wide text-muted-foreground">
              {sourceLabel}
            </span>
          </div>
          <p
            className={[
              "text-[12px] leading-[1.55] mt-0.5 line-clamp-2",
              isDisabled ? "text-muted-foreground/50" : "text-muted-foreground",
            ].join(" ")}
            title={skill.description}
          >
            {skill.description}
          </p>
        </div>

        {/* ── Right: primary action ── */}
        <div className="flex shrink-0 flex-col items-center gap-1">
          {canInstall ? (
            /* Install */
            <button
              type="button"
              disabled={busy}
              onClick={() => onInstall(skill.install[0].id)}
              title="Install"
              className="rounded-full border border-black/10 bg-white px-4 py-[5px] text-[12px] font-semibold text-foreground hover:bg-muted/50 disabled:opacity-50 transition-colors"
            >
              {busy ? <Download className="size-3.5 animate-pulse" /> : "Install"}
            </button>
          ) : isDisabled ? (
            /* Enable */
            <button
              type="button"
              disabled={busy}
              onClick={onToggle}
              className="rounded-full bg-primary px-5 py-[6px] text-[12px] font-bold text-white hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              Enable
            </button>
          ) : (
            /* iOS toggle (enabled) */
            <button
              type="button"
              role="switch"
              aria-checked
              disabled={busy}
              onClick={onToggle}
              className="relative inline-flex h-[26px] w-[44px] cursor-pointer items-center rounded-full bg-primary transition-colors disabled:opacity-50"
            >
              <span className="inline-block size-[22px] translate-x-[20px] rounded-full bg-white shadow-sm transition-transform" />
            </button>
          )}
        </div>
      </div>

      {/* ── API key row (primaryEnv shortcut) ── */}
      {skill.primaryEnv && (
        <div className="mt-5 flex items-center gap-2">
          <input
            type="password"
            placeholder="Enter API Key"
            value={apiKeyEdit}
            onChange={(e) => onEdit(e.target.value)}
            className="h-10 flex-1 rounded-[18px] bg-[#F6F6F6] px-4 text-[12px] text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/30"
          />
          <button
            type="button"
            disabled={busy}
            onClick={onSaveKey}
            className="h-10 rounded-[18px] bg-black px-4 text-[12px] font-bold text-white hover:bg-black/80 disabled:opacity-50 transition-colors whitespace-nowrap"
          >
            Save Key
          </button>
        </div>
      )}

      {/* ── Missing env vars: show input for each (skip if already covered by primaryEnv) ── */}
      {skill.missing.env.length > 0 &&
        skill.missing.env
          .filter((envKey) => envKey !== skill.primaryEnv)
          .map((envKey) => (
            <div key={envKey} className="mt-3 flex items-center gap-2">
              <Input
                type="password"
                placeholder={envKey}
                value={envDrafts[envKey] ?? ""}
                onChange={(e) =>
                  setEnvDrafts((prev) => ({ ...prev, [envKey]: e.target.value }))
                }
                disabled={busy}
                className="h-10 flex-1 rounded-[18px] bg-[#F6F6F6] px-4 text-[12px] border-0 focus-visible:ring-2 focus-visible:ring-primary/30"
              />
              <button
                type="button"
                disabled={busy || !(envDrafts[envKey] ?? "").trim()}
                onClick={() => {
                  const val = (envDrafts[envKey] ?? "").trim();
                  if (val) {
                    onSaveEnvVar(envKey, val);
                    setEnvDrafts((prev) => ({ ...prev, [envKey]: "" }));
                  }
                }}
                className="h-10 rounded-[18px] bg-black px-4 text-[12px] font-bold text-white hover:bg-black/80 disabled:opacity-50 transition-colors whitespace-nowrap"
              >
                Save Key
              </button>
            </div>
          ))}

      {/* ── Footer: icon actions + feedback ── */}
      {(canRemove || message) && (
        <div className="mt-3 flex items-center justify-between">
          {/* Feedback message */}
          <p
            className={[
              "text-[10px] font-semibold",
              message?.kind === "error" ? "text-destructive" : "text-emerald-600",
            ].join(" ")}
          >
            {message?.message ?? ""}
          </p>

          {/* Icon button row */}
          <div className="flex items-center gap-0.5 ml-auto">
            {/* Retry on error */}
            {hasError && (
              <IconBtn icon={RotateCcw} label="Retry" onClick={onToggle} disabled={busy} />
            )}
            {/* View detail */}
            <IconBtn icon={FileText} label="View details" onClick={onViewDetail} disabled={busy} />
            {/* Remove */}
            {canRemove && !confirmRemove && (
              <IconBtn
                icon={Trash2}
                label="Remove"
                onClick={() => setConfirmRemove(true)}
                disabled={busy}
                danger
              />
            )}
            {canRemove && confirmRemove && (
              <>
                <IconBtn
                  icon={Trash2}
                  label="Confirm remove"
                  onClick={() => {
                    setConfirmRemove(false);
                    onRemove();
                  }}
                  disabled={busy}
                  danger
                />
                <IconBtn
                  icon={X}
                  label="Cancel"
                  onClick={() => setConfirmRemove(false)}
                  disabled={busy}
                />
              </>
            )}
          </div>
        </div>
      )}

      {/* View detail row when no canRemove/message footer */}
      {!canRemove && !message && (
        <div className="mt-3 flex justify-end">
          <IconBtn icon={FileText} label="View details" onClick={onViewDetail} disabled={busy} />
          {hasError && (
            <IconBtn icon={RotateCcw} label="Retry" onClick={onToggle} disabled={busy} />
          )}
        </div>
      )}
    </div>
  );
}
