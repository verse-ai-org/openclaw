import { Badge } from "@/components/ui/badge";
import type { SkillStatusEntry } from "@/types/skills";

interface Props {
  skill: SkillStatusEntry;
  showBundledBadge?: boolean;
}

export function SkillStatusBadges({ skill, showBundledBadge }: Props) {
  return (
    <div className="flex flex-wrap gap-1.5 mt-1.5">
      <Badge variant="secondary">{skill.source}</Badge>
      {showBundledBadge && <Badge variant="secondary">bundled</Badge>}
      <Badge variant={skill.eligible ? "default" : "outline"}>
        {skill.eligible ? "eligible" : "blocked"}
      </Badge>
      {skill.disabled && <Badge variant="destructive">disabled</Badge>}
    </div>
  );
}
