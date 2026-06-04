import { useCallback, useEffect, useRef } from "react";
import { useChatStore } from "@/store/chat.store";
import { useGatewayStore } from "@/store/gateway.store";
import { useSettingsStore } from "@/store/settings.store";
import { getSessionKeyFromHash, setSessionKeyInHash } from "./url-session";
import { resolveManagedSessionKey } from "./session-key";
import { loadHistoryFromGateway, syncSessionRunStatusFromGateway } from "./loaders";

/**
 * Load `chat.history` whenever the chat surface mounts or the active session changes.
 * Complements `useSessionManager` (sidebar) so a full page refresh on `#/chat` always
 * hydrates the thread, not only when `gatewayStatus` flips.
 */
export function useChatHistoryBootstrap(): string {
  const client = useGatewayStore((s) => s.client);
  const gatewayStatus = useGatewayStore((s) => s.status);
  const settings = useSettingsStore((s) => s.settings);
  const hashSessionKey = getSessionKeyFromHash();
  const storeSessionKey = useChatStore((s) => s.sessionKey);

  const sessionKey = resolveManagedSessionKey({
    hashSessionKey,
    storeSessionKey,
    settingsSessionKey: settings.sessionKey,
    lastActiveSessionKey: settings.lastActiveSessionKey,
  });

  const historyRequestSeqRef = useRef(0);

  const loadHistory = useCallback(
    async (key: string, silent = false) => {
      await loadHistoryFromGateway({
        client,
        key,
        silent,
        historyRequestSeqRef,
      });
    },
    [client],
  );

  useEffect(() => {
    if (gatewayStatus !== "connected") {
      return;
    }
    const st = useChatStore.getState();
    if (st.sessionKey !== sessionKey) {
      st.setSessionKey(sessionKey);
    }
    setSessionKeyInHash(sessionKey);
    void loadHistory(sessionKey);
    void syncSessionRunStatusFromGateway({ client, sessionKey });
  }, [gatewayStatus, sessionKey, client, loadHistory]);

  return sessionKey;
}
