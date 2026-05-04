import type { BridgeRuntimeContext } from "./handlers/shared";

let bridgeCtx: BridgeRuntimeContext | null = null;

export function attachChatBridgeRunContext(ctx: BridgeRuntimeContext) {
  bridgeCtx = ctx;
}

export function detachChatBridgeRunContext() {
  bridgeCtx = null;
}

/**
 * Drop the client-side active run id for a session before a new `chat.send`.
 * Prevents a stale `activeRunBySession` entry from blocking deltas/finals for
 * the next run (same sessionKey, new runId).
 */
export function clearBridgeActiveRunForSession(sessionKey: string | undefined) {
  const k = typeof sessionKey === "string" ? sessionKey.trim() : "";
  if (!k || !bridgeCtx) {
    return;
  }
  bridgeCtx.activeRunBySession.delete(k);
}
