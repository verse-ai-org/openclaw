import { SearchIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type TaskSortBy = "created-desc" | "created-asc";
export type TaskStatusFilter = "all" | "enabled" | "disabled" | "failed-last";

const STATUS_FILTER_OPTIONS: { value: TaskStatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "enabled", label: "Enabled" },
  { value: "disabled", label: "Disabled" },
  { value: "failed-last", label: "Last failed" },
];

interface TasksListToolbarProps {
  searchQuery: string;
  statusFilter: TaskStatusFilter;
  sortBy: TaskSortBy;
  onSearchChange: (query: string) => void;
  onStatusFilterChange: (filter: TaskStatusFilter) => void;
  onSortChange: (sort: TaskSortBy) => void;
}

export function TasksListToolbar({
  searchQuery,
  statusFilter,
  sortBy,
  onSearchChange,
  onStatusFilterChange,
  onSortChange,
}: TasksListToolbarProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">


      <div className="inline-flex h-auto gap-1 rounded-2xl bg-muted p-1">
        {STATUS_FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onStatusFilterChange(opt.value)}
            className={
              "rounded-[14px] px-4 py-1 text-[13px] font-semibold transition-all" +
              (statusFilter === opt.value
                ? " bg-background text-foreground shadow-sm"
                : " text-muted-foreground hover:text-foreground")
            }
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="relative flex-1 min-w-[200px] max-w-sm rounded-full">
        <SearchIcon className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          placeholder="Search by name or prompt…"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="h-8 pl-8 text-sm rounded-full"
        />
      </div>

      <div className="flex items-center gap-2 sm:ml-auto">
        <span className="text-xs text-muted-foreground">Sort by</span>
        <Select value={sortBy} onValueChange={(v) => onSortChange(v as TaskSortBy)}>
          <SelectTrigger className="h-6 py-0 w-[140px] text-xs rounded-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="created-desc">Newest first</SelectItem>
            <SelectItem value="created-asc">Oldest first</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
