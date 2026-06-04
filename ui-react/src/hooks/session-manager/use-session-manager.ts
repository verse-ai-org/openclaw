import { useCallback, useEffect, useRef } from "react";
import { useChatStore } from "@/store/chat.store";
import { useGatewayStore } from "@/store/gateway.store";
import { useSessionsStore } from "@/store/sessions.store";
import { useSettingsStore } from "@/store/settings.store";
import { resolveSessionDisplayName } from "./display-name";
import { getSessionKeyFromHash, setSessionKeyInHash } from "./url-session";
import { resolveManagedSessionKey } from "./session-key";
import {
  deleteSessionAction,
  newSessionAction,
  switchSessionAction,
} from "./actions";
import {
  loadHistoryFromGateway,
  loadSessionsFromGateway,
  syncSessionRunStatusFromGateway,
} from "./loaders";
import { useConversationStore } from "@/store/conversation.store";
import { selectIsRunning } from "@/store/conversation-selectors";
// import type { SessionEntry } from "./types";

export function useSessionManager() {
  const sessions = useSessionsStore((s) => s.sessions);
  const loading = useSessionsStore((s) => s.loading);
  const setSessions = useSessionsStore((s) => s.setSessions);

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

  const pendingReloadKey = useChatStore((s) => s.pendingHistoryReloadKey);
  const pendingSessionsReloadSeq = useChatStore(
    (s) => s.pendingSessionsReloadSeq,
  );
  const pendingReloadThreadRunning = useConversationStore((s) => {
    if (!pendingReloadKey) {
      return false;
    }
    const conv = s.byThread[pendingReloadKey];
    return conv ? selectIsRunning(conv) : false;
  });

  const historyRequestSeqRef = useRef(0);

  const loadSessions = useCallback(async () => {
    await loadSessionsFromGateway({ client, sessionKey });
  }, [client, sessionKey]);

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

  const syncRunStatus = useCallback(
    async (key: string) => {
      await syncSessionRunStatusFromGateway({ client, sessionKey: key });
    },
    [client],
  );

  useEffect(() => {
    if (!pendingReloadKey || pendingReloadThreadRunning) {
      return;
    }
    void loadHistory(pendingReloadKey, true);
    useChatStore.getState().setPendingHistoryReloadKey(null);
  }, [pendingReloadKey, pendingReloadThreadRunning, loadHistory]);

  const switchSession = useCallback(
    async (key: string) => {
      await switchSessionAction({
        key,
        loadHistory,
        syncRunStatus,
        persistSessionKey: setSessionKeyInHash,
      });
    },
    [loadHistory, syncRunStatus],
  );

  const deleteSession = useCallback(
    async (key: string): Promise<{ ok: boolean; error?: string }> => {
      return deleteSessionAction({ key, client, setSessions, switchSession });
    },
    [client, switchSession],
  );

  const newSession = useCallback(
    async (agentId?: string) => {
      await newSessionAction({ agentId, client, setSessions, switchSession });
    },
    [client, switchSession],
  );

  useEffect(() => {
    if (pendingSessionsReloadSeq > 0) {
      void loadSessions();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingSessionsReloadSeq]);

  useEffect(() => {
    if (gatewayStatus !== "connected") {
      return;
    }
    if (useChatStore.getState().sessionKey !== sessionKey) {
      useChatStore.getState().setSessionKey(sessionKey);
    }
    setSessionKeyInHash(sessionKey);
    void loadSessions();
    // History hydration runs from `useChatHistoryBootstrap` on ChatPage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gatewayStatus, sessionKey]);

  const activeSession = sessions.find((s) => s.key === sessionKey);
  const activeLabel = activeSession
    ? resolveSessionDisplayName(activeSession)
    : sessionKey;

  return {
    sessions,
    loading,
    sessionKey,
    activeLabel,
    switchSession,
    newSession,
    deleteSession,
  };
}
