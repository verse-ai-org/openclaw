import { create } from "zustand";
import { useGatewayStore } from "./gateway.store";

export type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

export interface LogEntry {
  level?: LogLevel;
  message: string;
  subsystem?: string;
  timestamp?: string;
  raw: string;
}

interface LogsState {
  loading: boolean;
  error: string | null;
  file: string | null;
  entries: LogEntry[];
  filterText: string;
  levelFilters: Record<LogLevel, boolean>;
  autoFollow: boolean;
  truncated: boolean;

  loadLogs: () => Promise<void>;
  setFilterText: (text: string) => void;
  toggleLevel: (level: LogLevel) => void;
  setAutoFollow: (enabled: boolean) => void;
  exportLogs: (entries: LogEntry[], label: string) => void;
}

function getClient() {
  return useGatewayStore.getState().client;
}

function isConnected() {
  return useGatewayStore.getState().status === "connected";
}

export const useLogsStore = create<LogsState>()((set) => ({
  loading: false,
  error: null,
  file: null,
  entries: [],
  filterText: "",
  levelFilters: {
    trace: true,
    debug: true,
    info: true,
    warn: true,
    error: true,
    fatal: true,
  },
  autoFollow: false,
  truncated: false,

  loadLogs: async () => {
    const client = getClient();
    if (!client || !isConnected()) {
      return;
    }

    set({ loading: true, error: null });
    try {
      const result = await client.request<{
        file?: string;
        entries?: LogEntry[];
        truncated?: boolean;
      }>("logs.read", { tail: 500 });

      set({
        file: result?.file ?? null,
        entries: result?.entries ?? [],
        truncated: result?.truncated ?? false,
      });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
    } finally {
      set({ loading: false });
    }
  },

  setFilterText: (text) => set({ filterText: text }),

  toggleLevel: (level) =>
    set((state) => ({
      levelFilters: {
        ...state.levelFilters,
        [level]: !state.levelFilters[level],
      },
    })),

  setAutoFollow: (enabled) => set({ autoFollow: enabled }),

  exportLogs: (entries, label) => {
    const lines = entries.map((e) => e.raw);
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `openclaw-logs-${label}-${Date.now()}.jsonl`;
    a.click();
    URL.revokeObjectURL(url);
  },
}));
