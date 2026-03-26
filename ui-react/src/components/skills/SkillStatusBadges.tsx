import type { SkillStatusEntry } from "@/types/skills";

interface Props {
  skill: SkillStatusEntry;
  showBundledBadge?: boolean;
}

/** Compact pill badges matching the Figma design (9px bold, rgba bg) */
export function SkillStatusBadges({ skill, showBundledBadge }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
      {/* Source pill */}
      <span className="inline-flex items-center rounded-lg bg-black/5 px-2 py-[2px] text-[9px] font-bold uppercase tracking-wide text-muted-foreground">
        {skill.source.replace("openclaw-", "")}
      </span>

      {/* Bundled badge when skill is bundled but shown under a different source */}
      {showBundledBadge && (
        <span className="inline-flex items-center rounded-lg bg-black/5 px-2 py-[2px] text-[9px] font-bold uppercase tracking-wide text-muted-foreground">
          bundled
        </span>
      )}

      {/* Blocked / not eligible */}
      {!skill.eligible && (
        <span className="inline-flex items-center rounded-lg bg-destructive/10 px-2 py-[2px] text-[9px] font-bold uppercase tracking-wide text-destructive">
          blocked
        </span>
      )}

      {/* Disabled */}
      {skill.disabled && (
        <span className="inline-flex items-center rounded-lg bg-black/5 px-2 py-[2px] text-[9px] font-bold uppercase tracking-wide text-muted-foreground">
          disabled
        </span>
      )}
    </div>
  );
}
