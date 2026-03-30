import { formatDistanceToNow } from "date-fns";

export function relativeTime(ms: number | null | undefined): string {
  if (!ms) { return "n/a"; }
  return formatDistanceToNow(new Date(ms), { addSuffix: true });
}
