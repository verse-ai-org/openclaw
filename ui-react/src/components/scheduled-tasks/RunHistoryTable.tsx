import { useState } from "react";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  MoreHorizontalIcon,
  RefreshCwIcon,
  MessageSquareIcon,
  CheckCircle2Icon,
  XCircleIcon,
  LoaderIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { CronRunRecord } from "@/types/agents";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const PAGE_SIZE = 10;

const TIME_FILTER_OPTIONS = [
  { label: "Day", value: "day" },
  { label: "Week", value: "week" },
  { label: "Month", value: "month" },
] as const;

type TimeFilter = (typeof TIME_FILTER_OPTIONS)[number]["value"];
type StatusFilter = "all" | "running" | "success" | "failed";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatTimestamp(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(ms?: number): string {
  if (ms == null) { return "—"; }
  if (ms < 1_000) { return `${ms}ms`; }
  const s = (ms / 1000).toFixed(1);
  return `${s}s`;
}

function StatusBadge({ status }: { status: CronRunRecord["status"] }) {
  if (status === "running") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-600 dark:text-blue-400">
        <LoaderIcon className="size-3 animate-spin" />
        Running
      </span>
    );
  }
  if (status === "success") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-600 dark:text-green-400">
        <CheckCircle2Icon className="size-3" />
        Success
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-600 dark:text-red-400">
      <XCircleIcon className="size-3" />
      Failed
    </span>
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
interface RunHistoryTableProps {
  records: CronRunRecord[];
  total: number;
  loading?: boolean;
  onRerun: (jobId: string, jobName?: string) => void;
  onViewInChat?: (record: CronRunRecord) => void;
  onPageChange?: (page: number) => void;
  onFilterChange?: (params: { timeFilter: TimeFilter; statusFilter: StatusFilter }) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function RunHistoryTable({
  records,
  total,
  loading = false,
  onRerun,
  onViewInChat,
  onPageChange,
  onFilterChange,
}: RunHistoryTableProps) {
  const [page, setPage] = useState(1);
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("week");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const from = Math.min((page - 1) * PAGE_SIZE + 1, total);
  const to = Math.min(page * PAGE_SIZE, total);

  function handleTimeFilter(value: TimeFilter) {
    setTimeFilter(value);
    setPage(1);
    onFilterChange?.({ timeFilter: value, statusFilter });
  }

  function handleStatusFilter(value: StatusFilter) {
    setStatusFilter(value);
    setPage(1);
    onFilterChange?.({ timeFilter, statusFilter: value });
  }

  function handlePageChange(next: number) {
    setPage(next);
    onPageChange?.(next);
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Day / Week / Month toggle group — matches TabsList style */}
        <div className="inline-flex h-auto gap-1 rounded-2xl bg-[#F6F6F6] p-1">
          {TIME_FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => handleTimeFilter(opt.value)}
              className={
                "rounded-[14px] px-5 py-2 text-[13px] font-semibold transition-all" +
                (timeFilter === opt.value
                  ? " bg-white text-foreground shadow-sm"
                  : " text-muted-foreground hover:text-foreground")
              }
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Status filter — same pill style */}
        <div className="inline-flex h-auto gap-1 rounded-2xl bg-[#F6F6F6] p-1">
          {(["all", "success", "failed", "running"] as const).map((val) => (
            <button
              key={val}
              type="button"
              onClick={() => handleStatusFilter(val)}
              className={
                "rounded-[14px] px-5 py-2 text-[13px] font-semibold transition-all" +
                (statusFilter === val
                  ? " bg-white text-foreground shadow-sm"
                  : " text-muted-foreground hover:text-foreground")
              }
            >
              {val === "all" ? "All" : val.charAt(0).toUpperCase() + val.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40">
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Task Title</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                Execution Time
              </th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Duration</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  <LoaderIcon className="mx-auto size-5 animate-spin" />
                </td>
              </tr>
            )}
            {!loading && records.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  No run history found.
                </td>
              </tr>
            )}
            {!loading &&
              records.map((record) => {
                // jobName starting with "…" means the original job was deleted (fallback id suffix)
                const jobDeleted = record.jobName.startsWith("\u2026");
                return (
                <tr key={record.id} className="border-b last:border-0 hover:bg-muted/20">
                  <td className="px-4 py-3 font-medium">
                    {record.jobName}
                    {jobDeleted && (
                      <span className="ml-1.5 text-xs text-muted-foreground">(deleted)</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={record.status} />
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {formatTimestamp(record.executionTime)}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {formatDuration(record.durationMs)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="size-7">
                          <MoreHorizontalIcon className="size-4" />
                          <span className="sr-only">Actions</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          disabled={jobDeleted}
                          onClick={() => !jobDeleted && onRerun(record.jobId, record.jobName)}
                        >
                          <RefreshCwIcon className="mr-2 size-3.5" />
                          Rerun
                          {jobDeleted && (
                            <span className="ml-1 text-xs text-muted-foreground">(unavailable)</span>
                          )}
                        </DropdownMenuItem>
                        {onViewInChat && record.sessionKey && (
                          <DropdownMenuItem onClick={() => onViewInChat(record)}>
                            <MessageSquareIcon className="mr-2 size-3.5" />
                            View in chat
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {total > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Showing {from}–{to} of {total} entries
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              disabled={page <= 1}
              onClick={() => handlePageChange(page - 1)}
            >
              <ChevronLeftIcon className="size-4" />
              <span className="sr-only">Previous page</span>
            </Button>
            <span className="px-2">
              {page} / {totalPages}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              disabled={page >= totalPages}
              onClick={() => handlePageChange(page + 1)}
            >
              <ChevronRightIcon className="size-4" />
              <span className="sr-only">Next page</span>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
