const MS = {
  minute: 60_000,
  hour: 3_600_000,
  day: 86_400_000,
  week: 7 * 86_400_000,
  approxMonth: 30 * 86_400_000,
  approxYear: 365 * 86_400_000,
} as const;

/**
 * Locale-aware "3 minutes ago" / "in 2 hours" (replaces date-fns formatDistanceToNow + addSuffix).
 */
export function formatDistanceToNow(date: Date): string {
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  const diffMs = date.getTime() - Date.now();
  const abs = Math.abs(diffMs);
  const sign = diffMs < 0 ? -1 : 1;

  if (abs < MS.minute) {
    return rtf.format(sign * Math.round(diffMs / 1000), "second");
  }
  if (abs < MS.hour) {
    return rtf.format(sign * Math.round(diffMs / MS.minute), "minute");
  }
  if (abs < MS.day) {
    return rtf.format(sign * Math.round(diffMs / MS.hour), "hour");
  }
  if (abs < MS.week) {
    return rtf.format(sign * Math.round(diffMs / MS.day), "day");
  }
  if (abs < MS.approxMonth) {
    return rtf.format(sign * Math.round(diffMs / MS.week), "week");
  }
  if (abs < MS.approxYear) {
    return rtf.format(sign * Math.round(diffMs / MS.approxMonth), "month");
  }
  return rtf.format(sign * Math.round(diffMs / MS.approxYear), "year");
}

export function relativeTime(ms: number | null | undefined): string {
  if (!ms) {
    return "n/a";
  }
  return formatDistanceToNow(new Date(ms));
}
