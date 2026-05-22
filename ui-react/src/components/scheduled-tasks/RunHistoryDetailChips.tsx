import type { ReactNode } from "react";
import type { CronRunRecord } from "@/types/agents";
import {
  deliveryStatusLabel,
  formatRunUsageSummary,
} from "@/lib/cron-run-detail";

interface RunHistoryDetailChipsProps {
  record: CronRunRecord;
}

function DetailChip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-border bg-muted/40 px-2.5 py-0.5 text-xs font-medium text-foreground">
      {children}
    </span>
  );
}

export function RunHistoryDetailChips({ record }: RunHistoryDetailChipsProps) {
  const usageSummary = formatRunUsageSummary(record.usage);
  const chips = [
    deliveryStatusLabel(record.deliveryStatus),
    record.model,
    record.provider,
    usageSummary,
  ].filter(Boolean);

  if (chips.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {chips.map((chip) => (
        <DetailChip key={chip}>{chip}</DetailChip>
      ))}
    </div>
  );
}
