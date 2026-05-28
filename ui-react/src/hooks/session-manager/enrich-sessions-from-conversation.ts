import { selectChatMessages } from "@/store/conversation-selectors";
import { useConversationStore } from "@/store/conversation.store";
import { cleanSessionText } from "./display-name";
import type { SessionEntry } from "./types";

/** Matches gateway `formatSessionIdPrefix` fallback when transcript has no first user line yet. */
const SESSION_LIST_ID_DATE_FALLBACK = /^[0-9a-f]{8} \(\d{4}-\d{2}-\d{2}\)$/i;

/** Matches channel routing titles from gateway `buildGroupDisplayName` id fallback. */
const ROUTING_CHANNEL_DERIVED_TITLE = /^[a-z0-9-]+:g-[a-z0-9]/i;

const DERIVED_TITLE_MAX_LEN = 60;

function truncateSessionTitle(text: string, maxLen: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= maxLen) {
    return t;
  }
  const cut = t.slice(0, maxLen - 1);
  const lastSpace = cut.lastIndexOf(" ");
  if (lastSpace > maxLen * 0.6) {
    return `${cut.slice(0, lastSpace)}…`;
  }
  return `${cut}…`;
}

function firstUserPlainTextForThread(threadId: string): string | undefined {
  const conv = useConversationStore.getState().byThread[threadId];
  if (!conv) {
    return undefined;
  }
  const msgs = selectChatMessages(conv);
  for (const m of msgs) {
    if (m.role === "user" && m.content?.trim()) {
      return m.content.replace(/\s+/g, " ").trim();
    }
  }
  return undefined;
}

function shouldPatchDerivedTitleFromLocal(s: SessionEntry, localFirst: string): boolean {
  if (!localFirst.trim()) {
    return false;
  }
  const derived = s.derivedTitle?.trim();
  if (derived && SESSION_LIST_ID_DATE_FALLBACK.test(derived)) {
    return true;
  }
  if (derived && !ROUTING_CHANNEL_DERIVED_TITLE.test(derived)) {
    return false;
  }
  const lab = s.label?.trim();
  if (lab && lab !== "New Session") {
    return false;
  }
  return true;
}

/**
 * After `sessions.list`, the gateway may still return the session-id date fallback for
 * `derivedTitle` because the transcript was not flushed yet (e.g. immediate reload after
 * `chat.send`). Merge in the first user line already present in the local conversation store.
 */
export function enrichSessionsFromLocalConversation(sessions: SessionEntry[]): SessionEntry[] {
  return sessions.map((s) => {
    const localFirst = firstUserPlainTextForThread(s.key);
    if (!localFirst || !shouldPatchDerivedTitleFromLocal(s, localFirst)) {
      return s;
    }
    return {
      ...s,
      derivedTitle: truncateSessionTitle(cleanSessionText(localFirst), DERIVED_TITLE_MAX_LEN),
    };
  });
}
