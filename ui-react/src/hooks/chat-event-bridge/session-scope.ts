import { useChatStore } from "@/store/chat.store";
import { useSettingsStore } from "@/store/settings.store";
import { resolveActiveChatSessionKey } from "./active-session";

// ---------------------------------------------------------------------------
// Session scoping — Gateway broadcasts `chat` / `agent` to all WS clients; only
// apply updates when the event targets the session the Control UI is viewing.
// ---------------------------------------------------------------------------

/** Active chat session key (matches GatewayChatRuntimeProvider / chat.send). */
export function getActiveChatSessionKey(): string {
  const chat = useChatStore.getState();
  const settings = useSettingsStore.getState().settings;
  return resolveActiveChatSessionKey(chat.sessionKey, settings.sessionKey);
}

/**
 * True only when the gateway payload's `sessionKey` matches the active UI session.
 * Missing or blank keys are rejected (strict) so cross-session runs cannot mutate the thread.
 */
export function isChatEventForActiveSession(eventSessionKey: string | undefined): boolean {
  if (typeof eventSessionKey !== "string" || !eventSessionKey.trim()) {
    return false;
  }
  return eventSessionKey.trim() === getActiveChatSessionKey();
}
