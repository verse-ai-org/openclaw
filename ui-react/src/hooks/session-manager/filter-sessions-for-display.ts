import { isHeartbeatSessionDisplayText } from "@/components/chat/serialization";
import type { SessionEntry } from "./types";

/** Doctor archives heartbeat-poisoned main sessions under this key prefix. */
export function isHiddenHeartbeatSessionKey(key: string): boolean {
  const normalized = key.trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  if (normalized.includes("heartbeat-recovered")) {
    return true;
  }
  if (normalized.endsWith(":heartbeat")) {
    return true;
  }
  return false;
}

function sanitizeSessionEntryForDisplay(session: SessionEntry): SessionEntry {
  const next: SessionEntry = { ...session };
  if (next.derivedTitle && isHeartbeatSessionDisplayText(next.derivedTitle)) {
    delete next.derivedTitle;
  }
  if (next.lastMessagePreview && isHeartbeatSessionDisplayText(next.lastMessagePreview)) {
    delete next.lastMessagePreview;
  }
  return next;
}

/**
 * Drop heartbeat archive/isolated sessions and scrub heartbeat noise from list titles.
 * Gateway `sessions.list` derives titles from raw transcript tails, so heartbeat-only
 * sessions otherwise show up as "[OpenClaw heartbeat poll]".
 */
export function filterSessionsForDisplay(sessions: SessionEntry[]): SessionEntry[] {
  const visible: SessionEntry[] = [];
  for (const session of sessions) {
    if (isHiddenHeartbeatSessionKey(session.key)) {
      continue;
    }
    visible.push(sanitizeSessionEntryForDisplay(session));
  }
  return visible;
}
