/**
 * Resolve the session key used for chat.history / chat.send.
 * Hash wins (shareable deep link), then in-memory store, then persisted settings.
 */
export function resolveManagedSessionKey(params: {
  hashSessionKey?: string;
  storeSessionKey?: string | null;
  settingsSessionKey?: string;
  lastActiveSessionKey?: string;
}): string {
  const fromHash =
    typeof params.hashSessionKey === "string" && params.hashSessionKey.trim()
      ? params.hashSessionKey.trim()
      : "";
  if (fromHash) return fromHash;

  const fromStore =
    typeof params.storeSessionKey === "string" && params.storeSessionKey.trim()
      ? params.storeSessionKey.trim()
      : "";
  if (fromStore) return fromStore;

  const fromSettings =
    typeof params.settingsSessionKey === "string" && params.settingsSessionKey.trim()
      ? params.settingsSessionKey.trim()
      : "";
  if (fromSettings) return fromSettings;

  const fromLast =
    typeof params.lastActiveSessionKey === "string" && params.lastActiveSessionKey.trim()
      ? params.lastActiveSessionKey.trim()
      : "";
  if (fromLast) return fromLast;

  return "main";
}
