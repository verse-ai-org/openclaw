import { useChatStore } from "@/store/chat.store";
import { useSettingsStore } from "@/store/settings.store";
import { resolveActiveChatSessionKey } from "./active-session";

// ---------------------------------------------------------------------------
// Session scoping — Gateway broadcasts `chat` / `agent` to all WS clients; only
// apply updates when the event targets the session the Control UI is viewing.
//
// Session key vocabulary (two distinct concepts; keep them separate):
//
//   "Active session key" — the session the UI is currently rendering.
//     Derived from chat.store.sessionKey → settings.sessionKey → "main".
//     Single source: `resolveActiveChatSessionKey` / `getActiveChatSessionKey`.
//
//   "Event session key"  — the session a WS event belongs to.
//     Comes from `payload.sessionKey`; always cleaned with `normalizeSessionKey`
//     before use. Compared to the active session key via `isChatEventForActiveSession`.
//
// The `pendingGenerationBySession` map in chat.store is keyed by event session
// keys written from both the WS handler (event key) and GatewayChatRuntimeProvider
// (active session key). They converge to the same trimmed string in normal operation.
// ---------------------------------------------------------------------------

/**
 * Returns the active chat session key (matches GatewayChatRuntimeProvider / chat.send).
 * This is the single authoritative read path for the UI's current session.
 */
export function getActiveChatSessionKey(): string {
  const chat = useChatStore.getState();
  const settings = useSettingsStore.getState().settings;
  return resolveActiveChatSessionKey(chat.sessionKey, settings.sessionKey);
}

/**
 * True only when the gateway payload's `sessionKey` matches the active UI session.
 * Missing or blank keys are rejected (strict) so cross-session runs cannot mutate the thread.
 */
export function isChatEventForActiveSession(
  eventSessionKey: string | undefined,
): boolean {
  if (typeof eventSessionKey !== "string" || !eventSessionKey.trim()) {
    return false;
  }
  return eventSessionKey.trim() === getActiveChatSessionKey();
}
