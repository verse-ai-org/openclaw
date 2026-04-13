/**
 * Human-readable schedule formatters for Scheduled Tasks UI.
 * Converts Gateway CronSchedule values into the design-spec label style:
 *   "DAILY, 08:30 AM" / "EVERY MONDAY, 09:00 AM" / "1ST OF MONTH, 02:00 AM"
 */
import type { CronJob, CronSchedule } from "@/types/agents";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const ORDINAL = ["", "1st", "2nd", "3rd", "4th", "5th",
  "6th", "7th", "8th", "9th", "10th",
  "11th", "12th", "13th", "14th", "15th",
  "16th", "17th", "18th", "19th", "20th",
  "21st", "22nd", "23rd", "24th", "25th",
  "26th", "27th", "28th", "29th", "30th", "31st"];

/** Format a wall-clock hour/minute pair as "08:30 AM" style. */
function formatTime(hour: number, minute: number): string {
  const period = hour < 12 ? "AM" : "PM";
  const h = hour % 12 === 0 ? 12 : hour % 12;
  const m = String(minute).padStart(2, "0");
  return `${h}:${m} ${period}`;
}

/**
 * Parse a standard 5-field cron expression and return a human-readable label.
 * Handles the most common patterns used by formDataToCronSchedule.
 * Returns null when the expression is too complex to summarise.
 */
function parseCronExpr(expr: string): string | null {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) {
    return null;
  }
  const [minStr, hourStr, domStr, , dowStr] = parts;
  const hour = parseInt(hourStr, 10);
  const min = parseInt(minStr, 10);
  const validTime = !isNaN(hour) && !isNaN(min);

  // Every day at HH:mm  →  "Daily, 08:30 AM"
  if (dowStr === "*" && domStr === "*" && validTime) {
    return `Daily, ${formatTime(hour, min)}`;
  }

  // Specific day-of-week  →  "Every Monday, 09:00 AM"
  if (dowStr !== "*" && domStr === "*" && validTime) {
    const dow = parseInt(dowStr, 10);
    const dayLabel = !isNaN(dow) && dow >= 0 && dow <= 6 ? DAY_NAMES[dow] : dowStr;
    return `Every ${dayLabel}, ${formatTime(hour, min)}`;
  }

  // Specific day-of-month  →  "1st of Month, 02:00 AM"
  if (domStr !== "*" && dowStr === "*" && validTime) {
    const dom = parseInt(domStr, 10);
    const ordinal = !isNaN(dom) && dom >= 1 && dom <= 31 ? ORDINAL[dom] : `${domStr}th`;
    return `${ordinal} of Month, ${formatTime(hour, min)}`;
  }

  return null;
}

/** Format a CronSchedule into a short display label. */
export function formatCronSchedule(schedule: CronSchedule): string {
  if (schedule.kind === "every") {
    const ms = schedule.everyMs;
    if (ms % 3_600_000 === 0) {
      const h = ms / 3_600_000;
      return h === 1 ? "Every Hour" : `Every ${h} Hours`;
    }
    if (ms % 60_000 === 0) {
      const m = ms / 60_000;
      return `Every ${m} Minutes`;
    }
    return `Every ${ms}ms`;
  }

  if (schedule.kind === "cron") {
    const label = parseCronExpr(schedule.expr);
    return label ?? `Cron: ${schedule.expr}`;
  }

  if (schedule.kind === "at") {
    const d = new Date(schedule.at);
    if (isNaN(d.getTime())) {
      return `One-time: ${schedule.at}`;
    }
    // Display in local time so it matches what the user selected
    const pad = (n: number) => String(n).padStart(2, "0");
    const dateStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const timeStr = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    return `One-time, ${dateStr} ${timeStr}`;
  }

  return "Unknown";
}

/** Convenience wrapper that accepts a full CronJob. */
export function formatJobSchedule(job: CronJob): string {
  return formatCronSchedule(job.schedule);
}
