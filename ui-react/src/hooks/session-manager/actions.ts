import { useChatStore } from "@/store/chat.store";
import { useSettingsStore } from "@/store/settings.store";
import type { IGatewayClient } from "@/store/gateway.store";
import type { SessionEntry } from "./types";

export async function switchSessionAction(params: {
  key: string;
  loadHistory: (key: string, silent?: boolean) => Promise<void>;
  syncRunStatus?: (key: string) => Promise<void>;
  persistSessionKey?: (key: string) => void;
}) {
  const { key, loadHistory, syncRunStatus, persistSessionKey } = params;
  useChatStore.getState().setSessionKey(key);
  useSettingsStore
    .getState()
    .updateSettings({ sessionKey: key, lastActiveSessionKey: key });
  persistSessionKey?.(key);
  await loadHistory(key);
  await syncRunStatus?.(key);
}

export async function deleteSessionAction(params: {
  key: string;
  client: IGatewayClient | null;
  setSessions: (updater: SessionEntry[] | ((prev: SessionEntry[]) => SessionEntry[])) => void;
  switchSession: (key: string) => Promise<void>;
}): Promise<{ ok: boolean; error?: string }> {
  const { key, client, setSessions, switchSession } = params;
  if (!client?.connected) {
    return { ok: false, error: "Not connected" };
  }
  try {
    await client.request("sessions.delete", {
      key,
      deleteTranscript: true,
    });
    setSessions((prev) => prev.filter((s) => s.key !== key));
    if (key === useChatStore.getState().sessionKey) {
      const match = /^agent:([^:]+):/.exec(key);
      const fallbackKey = match ? `agent:${match[1]}:main` : "main";
      await switchSession(fallbackKey);
    }
    return { ok: true };
  } catch (err) {
    console.error("[session] delete failed:", err);
    return { ok: false, error: String(err) };
  }
}

export async function newSessionAction(params: {
  agentId?: string;
  client: IGatewayClient | null;
  setSessions: (updater: SessionEntry[] | ((prev: SessionEntry[]) => SessionEntry[])) => void;
  switchSession: (key: string) => Promise<void>;
}) {
  const { agentId, client, setSessions, switchSession } = params;
  if (!client?.connected) {
    return;
  }
  const newKey = agentId
    ? `agent:${agentId}:${crypto.randomUUID().slice(0, 8)}`
    : crypto.randomUUID().slice(0, 8);
  setSessions((prev) => [{ key: newKey, label: "New Session" }, ...prev]);
  await switchSession(newKey);
}
