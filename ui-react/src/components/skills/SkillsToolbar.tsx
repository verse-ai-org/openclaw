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
          className="h-10 w-[320px] rounded-full bg-[#F6F6F6] pl-10 pr-5 text-[13px] text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/30"
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
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-[11px] font-bold text-white hover:bg-primary/90 transition-colors"
          >
            <span className="text-base leading-none">+</span>
            Add New Skill
          </button>
        }
      />

      {/* Skills count pill */}
      <span className="hidden items-center rounded-full bg-black/5 px-4 py-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
        {shownCount} Skills
      </span>
    </div>
  );
}
