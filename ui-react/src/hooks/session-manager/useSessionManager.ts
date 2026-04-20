import { useCallback, useEffect, useRef, useState } from "react";
import { useChatStore } from "@/store/chat.store";
import { useGatewayStore } from "@/store/gateway.store";
import { useSettingsStore } from "@/store/settings.store";
import { resolveSessionDisplayName } from "./display-name";
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
import type { SessionEntry } from "./types";

export function useSessionManager() {
  const [sessions, setSessions] = useState<SessionEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const client = useGatewayStore((s) => s.client);
  const gatewayStatus = useGatewayStore((s) => s.status);
  const settings = useSettingsStore((s) => s.settings);
  const sessionKey =
    useChatStore((s) => s.sessionKey) ?? settings.sessionKey ?? "main";

  const pendingReloadKey = useChatStore((s) => s.pendingHistoryReloadKey);
  const pendingSessionsReloadSeq = useChatStore(
    (s) => s.pendingSessionsReloadSeq,
  );

  const historyRequestSeqRef = useRef(0);

  const loadSessions = useCallback(async () => {
    await loadSessionsFromGateway({
      client,
      sessionKey,
      setLoading,
      setSessions,
    });
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
    if (!pendingReloadKey) {
      return;
    }
    void loadHistory(pendingReloadKey, true);
    useChatStore.getState().setPendingHistoryReloadKey(null);
  }, [pendingReloadKey, loadHistory]);

  const switchSession = useCallback(
    async (key: string) => {
      await switchSessionAction({ key, loadHistory, syncRunStatus });
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
    if (gatewayStatus === "connected") {
      if (!useChatStore.getState().sessionKey) {
        useChatStore.getState().setSessionKey(sessionKey);
      }
      void loadSessions();
      void loadHistory(sessionKey);
      void syncRunStatus(sessionKey);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gatewayStatus]);

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
