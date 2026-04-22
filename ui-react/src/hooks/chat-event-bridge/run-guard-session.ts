/**
 * Lets the chat UI reset the bridge run-id guard when a new gateway run is about
 * to start without a local `lifecycle:start` yet — notably after
 * `chat.interactionRespond` kicks off `interaction_continue` with a fresh runId.
 *
 * If we keep the previous runId in `activeRunBySession`, `shouldAcceptRunEvent`
 * drops tool / interaction `progress` events whose `runId` no longer matches,
 * so tool groups never render until a full history reload.
 *
 * Call **`clearBridgeTrackedRunForSession` before awaiting `chat.interactionRespond`**
 * as well as after it succeeds: continuation tool events can arrive over the
 * socket before the RPC promise resolves, and they often precede `lifecycle:start`
 * (only `start` overwrites a stale id; `progress` does not).
 */

let clearTrackedRunForSession: ((sessionKey: string) => void) | null = null;

export function setBridgeRunGuardClearHandler(
  handler: ((sessionKey: string) => void) | null,
): void {
  clearTrackedRunForSession = handler;
}

/** Reset the bridge run guard for this session (safe to call more than once). */
export function clearBridgeTrackedRunForSession(sessionKey: string): void {
  const k = sessionKey.trim();
  if (!k) {
    return;
  }
  clearTrackedRunForSession?.(k);
}
