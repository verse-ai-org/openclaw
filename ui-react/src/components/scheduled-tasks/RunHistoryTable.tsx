import { useState } from "react";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  EyeIcon,
  RefreshCwIcon,
  LoaderIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CronRunRecord } from "@/types/agents";
import {
  formatRunHistoryDuration,
  formatRunHistoryTimestampShort,
  isCronRunJobDeleted,
} from "@/lib/cron-run-detail";
import { RunHistoryDetailDrawer } from "./RunHistoryDetailDrawer";
import { RunHistoryStatusBadge } from "./RunHistoryStatusBadge";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
export const CRON_RUN_HISTORY_PAGE_SIZE = 10;

const TIME_FILTER_OPTIONS = [
  { label: "Day", value: "day" },
  { label: "Week", value: "week" },
  { label: "Month", value: "month" },
] as const;

export type RunHistoryTimeFilter = (typeof TIME_FILTER_OPTIONS)[number]["value"];
export type RunHistoryStatusFilter = "all" | "success" | "failed";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
interface RunHistoryTableProps {
  records: CronRunRecord[];
  total: number;
  page: number;
  timeFilter: RunHistoryTimeFilter;
  statusFilter: RunHistoryStatusFilter;
  loading?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  onRerun: (jobId: string, jobName?: string) => void;
  onFilterChange: (params: {
    timeFilter: RunHistoryTimeFilter;
    statusFilter: RunHistoryStatusFilter;
  }) => void;
  onPageChange: (page: number) => void;
  onViewInChat?: (record: CronRunRecord) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function RunHistoryTable({
  records,
  total,
  page,
  timeFilter,
  statusFilter,
  loading = false,
  refreshing = false,
  onRefresh,
  onRerun,
  onFilterChange,
  onPageChange,
  onViewInChat,
}: RunHistoryTableProps) {
  const [detailRecord, setDetailRecord] = useState<CronRunRecord | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const totalPages = Math.max(1, Math.ceil(total / CRON_RUN_HISTORY_PAGE_SIZE));
  const pageStart = (page - 1) * CRON_RUN_HISTORY_PAGE_SIZE;
  const from = total === 0 ? 0 : pageStart + 1;
  const to = Math.min(pageStart + records.length, total);

  function handleTimeFilter(value: RunHistoryTimeFilter) {
    onFilterChange({ timeFilter: value, statusFilter });
  }

  function handleStatusFilter(value: RunHistoryStatusFilter) {
    onFilterChange({ timeFilter, statusFilter: value });
  }

  function handleView(record: CronRunRecord) {
    setDetailRecord(record);
    setDetailOpen(true);
  }

  function handleDetailOpenChange(open: boolean) {
    setDetailOpen(open);
    if (!open) {
      setDetailRecord(null);
    }
  }

  return (
    <>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap items-center gap-3 flex-1 min-w-0">
            <div className="inline-flex h-auto gap-1 rounded-2xl bg-muted p-1">
              {TIME_FILTER_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleTimeFilter(opt.value)}
                  className={
                    "rounded-[14px] px-5 py-1 text-[13px] font-semibold transition-all" +
                    (timeFilter === opt.value
                      ? " bg-background text-foreground shadow-sm"
                      : " text-muted-foreground hover:text-foreground")
                  }
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <div className="inline-flex h-auto gap-1 rounded-2xl bg-muted p-1">
              {(["all", "success", "failed"] as const).map((val) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => handleStatusFilter(val)}
                  className={
                    "rounded-[14px] px-5 py-1 text-[13px] font-semibold transition-all" +
                    (statusFilter === val
                      ? " bg-background text-foreground shadow-sm"
                      : " text-muted-foreground hover:text-foreground")
                  }
                >
                  {val === "all" ? "All" : val.charAt(0).toUpperCase() + val.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {onRefresh && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={refreshing}
              onClick={onRefresh}
              title="Refresh run history"
              className="gap-1.5 shrink-0"
            >
              <RefreshCwIcon className={cn("size-3.5", refreshing && "animate-spin")} />
              Refresh
            </Button>
          )}
        </div>

        <div className="overflow-hidden rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Task Title</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground min-w-[160px] max-w-[240px]">Summary</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Execution Time
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Duration</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Detail</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                    <LoaderIcon className="mx-auto size-5 animate-spin" />
                  </td>
                </tr>
              )}
              {!loading && total === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                    No run history found.
                  </td>
                </tr>
              )}
              {!loading &&
                records.map((record) => {
                  const jobDeleted = isCronRunJobDeleted(record);
                  return (
                    <tr key={record.id} className="border-b last:border-0 hover:bg-muted/20">
                      <td className="px-4 py-3 font-medium">
                        {record.jobName}
                        {jobDeleted && (
                          <span className="ml-1.5 text-xs text-muted-foreground">(deleted)</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <RunHistoryStatusBadge
                          status={record.status}
                          runStatus={record.runStatus}
                        />
                      </td>
                      <td className="px-4 py-3 text-muted-foreground max-w-[240px]">
                        {record.summary ? (
                          <span className="line-clamp-2 text-xs" title={record.summary}>
                            {record.summary}
                          </span>
                        ) : (
                          <span className="text-xs italic">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {formatRunHistoryTimestampShort(record.executionTime)}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {formatRunHistoryDuration(record.durationMs)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="gap-1.5 text-muted-foreground hover:text-foreground"
                          onClick={() => handleView(record)}
                        >
                          <EyeIcon className="size-3.5" />
                          Detail
                        </Button>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>

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
                disabled={page <= 1 || loading}
                onClick={() => onPageChange(page - 1)}
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
                disabled={page >= totalPages || loading}
                onClick={() => onPageChange(page + 1)}
              >
                <ChevronRightIcon className="size-4" />
                <span className="sr-only">Next page</span>
              </Button>
            </div>
          </div>
        )}
      </div>

      <RunHistoryDetailDrawer
        open={detailOpen}
        onOpenChange={handleDetailOpenChange}
        record={detailRecord}
        onRerun={onRerun}
        onViewInChat={onViewInChat}
      />
    </>
  );
}
