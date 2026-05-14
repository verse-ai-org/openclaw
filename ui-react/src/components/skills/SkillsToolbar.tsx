import { Filter, RefreshCwIcon } from "lucide-react";
import { AddSkillDialog } from "./AddSkillDialog";
import { Button } from "../ui/button.tsx";
import { cn } from "@/lib/utils.ts";

interface Props {
  filter: string;
  loading: boolean;
  shownCount: number;
  onFilterChange: (value: string) => void;
  onRefresh: () => void;
}

export function SkillsToolbar({ filter, loading, shownCount, onFilterChange, onRefresh }: Props) {
  return (
    <div className="flex items-center gap-4">
      {/* Search input */}
      <div className="relative flex items-center">
        <Filter className="absolute left-4 top-1/2 -translate-y-1/2 size-[15px] text-muted-foreground pointer-events-none" />
        <input
          placeholder="Filter skills..."
          value={filter}
          onChange={(e) => onFilterChange(e.target.value)}
          className="h-10 w-[320px] rounded-full border border-transparent bg-muted pl-10 pr-5 text-[13px] text-foreground outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-primary/30"
        />
      </div>

      <Button
        variant="ghost"
        className="size-8 rounded-full"
        disabled={loading}
        title="Refresh"
        onClick={onRefresh}
      >
        <RefreshCwIcon className={cn("size-4", loading && "animate-spin")} />
      </Button>

      {/* Add New Skill button */}
      <AddSkillDialog
        trigger={
          <Button type="button" className="h-auto rounded-full px-4 py-2 text-[11px] font-bold">
            <span className="text-base leading-none">+</span>
            Add New Skill
          </Button>
        }
      />

      {/* Skills count pill */}
      <span className="hidden items-center rounded-full bg-muted px-4 py-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
        {shownCount} Skills
      </span>
    </div>
  );
}
