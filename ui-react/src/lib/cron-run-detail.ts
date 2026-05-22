import type { CronRunDeliveryStatus, CronRunRecord, CronRunUsage } from "@/types/agents";

export type GatewayCronRunEntry = {
  ts: number;
  jobId: string;
  jobName?: string;
  status?: "ok" | "error" | "skipped";
  durationMs?: number;
  error?: string;
  summary?: string;
  deliveryStatus?: CronRunDeliveryStatus;
  deliveryError?: string;
  model?: string;
  provider?: string;
  usage?: CronRunUsage;
  runAtMs?: number;
  nextRunAtMs?: number;
  sessionId?: string;
  sessionKey?: string;
};

export function isCronRunJobDeleted(record: Pick<CronRunRecord, "jobName">): boolean {
  return record.jobName.startsWith("\u2026");
}

export function mapGatewayCronRunEntry(entry: GatewayCronRunEntry): CronRunRecord {
  return {
    id: `${entry.jobId}-${entry.ts}`,
    jobId: entry.jobId,
    jobName:
      entry.jobName && entry.jobName.trim() ? entry.jobName : `\u2026${entry.jobId.slice(-8)}`,
    status: entry.status === "ok" ? "success" : "failed",
    runStatus: entry.status,
    executionTime: entry.ts,
    durationMs: entry.durationMs,
    error: entry.error,
    summary: entry.summary,
    deliveryStatus: entry.deliveryStatus,
    deliveryError: entry.deliveryError,
    model: entry.model,
    provider: entry.provider,
    usage: entry.usage,
    runAtMs: entry.runAtMs,
    nextRunAtMs: entry.nextRunAtMs,
    sessionId: entry.sessionId,
    sessionKey: entry.sessionKey,
  };
}

export function formatRunHistoryTimestamp(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Compact timestamp for table rows. */
export function formatRunHistoryTimestampShort(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatRunHistoryDuration(ms?: number): string {
  if (ms == null) {
    return "\u2014";
  }
  if (ms < 1_000) {
    return `${ms}ms`;
  }
  const seconds = (ms / 1_000).toFixed(1);
  return `${seconds}s`;
}

export function runStatusLabel(status?: CronRunRecord["runStatus"]): string {
  switch (status) {
    case "ok":
      return "Success";
    case "error":
      return "Error";
    case "skipped":
      return "Skipped";
    default:
      return "Unknown";
  }
}

export function deliveryStatusLabel(status?: CronRunDeliveryStatus): string {
  switch (status) {
    case "delivered":
      return "Delivered";
    case "not-delivered":
      return "Not delivered";
    case "unknown":
      return "Unknown";
    case "not-requested":
      return "Not requested";
    default:
      return "Not requested";
  }
}

export function formatRunUsageSummary(usage?: CronRunUsage): string | null {
  if (!usage) {
    return null;
  }
  if (typeof usage.total_tokens === "number") {
    return `${usage.total_tokens} tokens`;
  }
  if (typeof usage.input_tokens === "number" && typeof usage.output_tokens === "number") {
    return `${usage.input_tokens} in / ${usage.output_tokens} out`;
  }
  return null;
}

function formatRelativeTimestamp(ts: number): string {
  const diffMs = Math.abs(Date.now() - ts);
  const diffMin = Math.round(diffMs / 60_000);
  if (diffMin < 1) {
    return "just now";
  }
  if (diffMin < 60) {
    return `${diffMin}m`;
  }
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) {
    return `${diffH}h`;
  }
  const diffD = Math.round(diffH / 24);
  return `${diffD}d`;
}

export function formatRunNextLabel(nextRunAtMs: number, nowMs = Date.now()): string {
  const rel = formatRelativeTimestamp(nextRunAtMs);
  return nextRunAtMs > nowMs ? `Next in ${rel}` : `Due ${rel} ago`;
}

export function getCronRunBodySource(record: Pick<CronRunRecord, "summary" | "error">): string {
  return record.summary?.trim() || record.error?.trim() || "No summary.";
}

export function shouldShowRunErrorInMeta(record: Pick<CronRunRecord, "summary" | "error">): boolean {
  return Boolean(record.error?.trim() && record.summary?.trim());
}
