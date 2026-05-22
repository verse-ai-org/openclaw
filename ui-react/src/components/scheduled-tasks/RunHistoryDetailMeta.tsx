import type { ReactNode } from "react";
import type { CronRunRecord } from "@/types/agents";
import {
  formatRunHistoryDuration,
  formatRunHistoryTimestamp,
  formatRunNextLabel,
  shouldShowRunErrorInMeta,
} from "@/lib/cron-run-detail";

interface RunHistoryDetailMetaProps {
  record: CronRunRecord;
}

function MetaRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid grid-cols-[7.5rem_1fr] gap-3 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-foreground">{value}</dd>
    </div>
  );
}

export function RunHistoryDetailMeta({ record }: RunHistoryDetailMetaProps) {
  const showErrorInMeta = shouldShowRunErrorInMeta(record);

  return (
    <dl className="flex flex-col gap-3 rounded-xl border border-border bg-muted/20 p-4">
      <MetaRow label="Finished" value={formatRunHistoryTimestamp(record.executionTime)} />
      {typeof record.runAtMs === "number" && (
        <MetaRow label="Run at" value={formatRunHistoryTimestamp(record.runAtMs)} />
      )}
      <MetaRow label="Duration" value={formatRunHistoryDuration(record.durationMs)} />
      {typeof record.nextRunAtMs === "number" && (
        <MetaRow label="Next run" value={formatRunNextLabel(record.nextRunAtMs)} />
      )}
      {showErrorInMeta && record.error && (
        <MetaRow
          label="Error"
          value={<span className="text-destructive">{record.error}</span>}
        />
      )}
      {record.deliveryError && (
        <MetaRow
          label="Delivery"
          value={<span className="text-destructive">{record.deliveryError}</span>}
        />
      )}
    </dl>
  );
}
