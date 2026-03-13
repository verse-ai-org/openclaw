import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Props {
  filter: string;
  loading: boolean;
  shownCount: number;
  onFilterChange: (value: string) => void;
  onRefresh: () => void;
}

export function SkillsToolbar({ filter, loading, shownCount, onFilterChange, onRefresh }: Props) {
  return (
    <div className="flex items-center gap-3">
      <div className="relative flex-1">
        <Input
          placeholder="Search skills…"
          value={filter}
          onChange={(e) => onFilterChange(e.target.value)}
          className="h-8 text-sm pr-10"
        />
        {filter && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
            {shownCount}
          </span>
        )}
      </div>
      {!filter && (
        <span className="text-xs text-muted-foreground whitespace-nowrap">{shownCount} skills</span>
      )}
      <Button
        size="sm"
        variant="outline"
        disabled={loading}
        onClick={onRefresh}
        className="shrink-0"
      >
        <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
        {loading ? "Loading…" : "Refresh"}
      </Button>
    </div>
  );
}
