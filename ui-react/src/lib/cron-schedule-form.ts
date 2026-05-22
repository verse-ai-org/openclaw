/** Cron day-of-week field: 0 = Sunday … 6 = Saturday (standard 5-field cron). */
export const CRON_WEEKDAY_OPTIONS = [
  { value: "0", label: "Sunday" },
  { value: "1", label: "Monday" },
  { value: "2", label: "Tuesday" },
  { value: "3", label: "Wednesday" },
  { value: "4", label: "Thursday" },
  { value: "5", label: "Friday" },
  { value: "6", label: "Saturday" },
] as const;

export const CRON_MONTH_DAY_OPTIONS = Array.from({ length: 31 }, (_, i) => {
  const day = String(i + 1);
  const suffix =
    day === "1" || day === "21" || day === "31"
      ? "st"
      : day === "2" || day === "22"
        ? "nd"
        : day === "3" || day === "23"
          ? "rd"
          : "th";
  return { value: day, label: `${day}${suffix}` };
});

export function parseCronExprScheduleFields(expr: string): {
  weeklyDayOfWeek?: string;
  monthlyDayOfMonth?: string;
} {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) {
    return {};
  }
  const [, , cronDay, , cronDow] = parts;
  const out: { weeklyDayOfWeek?: string; monthlyDayOfMonth?: string } = {};
  if (cronDow !== "*") {
    out.weeklyDayOfWeek = cronDow;
  }
  if (cronDay !== "*") {
    out.monthlyDayOfMonth = cronDay;
  }
  return out;
}
