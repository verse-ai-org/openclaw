import { Filter, RefreshCw } from "lucide-react";
import { AddSkillDialog } from "./AddSkillDialog";

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

      {/* Refresh icon button */}
      <button
        type="button"
        disabled={loading}
        onClick={onRefresh}
        aria-label="Refresh"
        className="flex size-[33px] shrink-0 items-center justify-center rounded-full bg-[#F6F6F6] text-muted-foreground transition-colors hover:bg-[#EBEBEB] disabled:opacity-50"
      >
        <RefreshCw className={`size-[13px] ${loading ? "animate-spin" : ""}`} />
      </button>

      {/* Skills count pill */}
      <span className="inline-flex items-center rounded-full bg-black/5 px-4 py-[3px] text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
        {shownCount} Skills
      </span>

      {/* Add New Skill button */}
      <AddSkillDialog
        trigger={
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-[6px] text-[11px] font-bold text-white hover:bg-primary/90 transition-colors"
          >
            <span className="text-base leading-none">+</span>
            Add New Skill
          </button>
        }
      />
    </div>
  );
}
