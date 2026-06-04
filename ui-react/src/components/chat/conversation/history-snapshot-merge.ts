import type { CanonicalMessage, ChatPart, ConversationState } from "./types";

function assistantTextLength(parts: ChatPart[]): number {
  return parts
    .filter((p): p is Extract<ChatPart, { type: "text" }> => p.type === "text")
    .map((p) => p.text)
    .join("")
    .trim().length;
}

function runIdsWithAssistantText(messages: CanonicalMessage[]): Set<string> {
  const out = new Set<string>();
  for (const m of messages) {
    if (m.role !== "assistant" || !m.runId) continue;
    if (assistantTextLength(m.parts) > 0) {
      out.add(m.runId);
    }
  }
  return out;
}

/**
 * After a post-run silent `chat.history` reload, gateway rows can lag behind the live
 * WS stream. Keep in-memory assistant turns that still carry text until history catches up.
 */
export function mergeSilentHistorySnapshotWithLiveAssistantTurns(
  prev: ConversationState,
  incoming: CanonicalMessage[],
): CanonicalMessage[] {
  const historyRunIdsWithText = runIdsWithAssistantText(incoming);

  const mergedIncoming = incoming.map((m) => {
    if (m.role !== "assistant") return m;
    const prior = prev.messagesById.get(m.id);
    if (!prior || assistantTextLength(m.parts) > 0) return m;
    if (assistantTextLength(prior.parts) === 0) return m;
    return { ...m, parts: prior.parts, status: "complete" as const };
  });

  const extras: CanonicalMessage[] = [];
  for (const m of prev.messagesById.values()) {
    if (m.role !== "assistant" || !m.runId) continue;
    if (assistantTextLength(m.parts) === 0) continue;
    if (historyRunIdsWithText.has(m.runId)) continue;
    if (mergedIncoming.some((im) => im.id === m.id)) continue;
    extras.push({ ...m, status: "complete" });
  }

  if (extras.length === 0) {
    return mergedIncoming;
  }

  return [...mergedIncoming, ...extras].toSorted(
    (a, b) => a.createdAt - b.createdAt || String(a.id).localeCompare(String(b.id)),
  );
}
