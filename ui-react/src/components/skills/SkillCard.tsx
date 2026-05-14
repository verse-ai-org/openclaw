import { AlertTriangle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { computeSkillMissing, computeSkillReasons } from "@/lib/skills-grouping";
import type { SkillMessage } from "@/store/skills.store";
import type { SkillStatusEntry } from "@/types/skills";

interface Props {
  skill: SkillStatusEntry;
  busy: boolean;
  message: SkillMessage | null;
  onOpen: () => void;
}

export function SkillCard({ skill, busy, message, onOpen }: Props) {
  const missing = computeSkillMissing(skill);
  const reasons = computeSkillReasons(skill);

  const isDisabled = skill.disabled;
  const hasError = message?.kind === "error";

  const statusHint = [
    missing.length > 0 ? `Missing: ${missing.join(", ")}` : "",
    reasons.length > 0 ? reasons.join(", ") : "",
  ]
    .filter(Boolean)
    .join(" · ");

  const sourceLabel = skill.source.replace("openclaw-", "");

  const showStatusHint = (missing.length > 0 || !skill.eligible || hasError) && Boolean(statusHint);

  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={busy}
      aria-busy={busy}
      className={[
        "relative flex w-full flex-col rounded-2xl border border-border p-8 text-left transition-colors",
        "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "enabled:hover:border-primary/25 enabled:hover:bg-muted/20",
        "disabled:opacity-60",
        isDisabled ? "bg-muted/40" : "bg-card",
        hasError ? "opacity-[0.92]" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {busy && (
        <span
          className="pointer-events-none absolute inset-0 rounded-2xl bg-background/40"
          aria-hidden
        />
      )}

      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={[
              "min-w-0 truncate text-[15px] font-bold leading-snug",
              isDisabled ? "text-muted-foreground" : "text-foreground",
            ].join(" ")}
          >
            {skill.name}
          </span>
          {showStatusHint && (
            <Tooltip delayDuration={400}>
              <TooltipTrigger asChild>
                <span
                  className="inline-flex shrink-0 cursor-help rounded-full p-0.5 text-muted-foreground hover:bg-muted"
                  tabIndex={-1}
                  aria-label={statusHint}
                >
                  <AlertTriangle
                    className={[
                      "size-[14px]",
                      hasError ? "text-destructive" : "text-amber-400",
                    ].join(" ")}
                    aria-hidden
                  />
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-[220px] text-[11px]">
                {statusHint}
              </TooltipContent>
            </Tooltip>
          )}
          <span className="inline-flex shrink-0 items-center rounded-md bg-muted px-2 py-[2px] text-[9px] font-bold uppercase tracking-wide text-muted-foreground">
            {sourceLabel}
          </span>
        </div>
        <p
          className={[
            "mt-0.5 line-clamp-3 text-xs h-16",
            isDisabled ? "text-muted-foreground/50" : "text-muted-foreground",
          ].join(" ")}
          title={skill.description}
        >
          {skill.description}
        </p>
        {message && (
          <p
            className={[
              "mt-2 line-clamp-2 text-[10px] font-semibold leading-snug",
              message.kind === "error"
                ? "text-destructive"
                : "text-emerald-600 dark:text-emerald-400",
            ].join(" ")}
          >
            {message.message}
          </p>
        )}
      </div>
    </button>
  );
}
