import { create } from "zustand";
import type { SessionEntry, SessionsListDefaults } from "@/hooks/session-manager/types";

interface SessionsState {
  sessions: SessionEntry[];
  defaults: SessionsListDefaults | null;
  loading: boolean;
  setSessions: (updater: SessionEntry[] | ((prev: SessionEntry[]) => SessionEntry[])) => void;
  setDefaults: (defaults: SessionsListDefaults | null) => void;
  setLoading: (loading: boolean) => void;
}

export const useSessionsStore = create<SessionsState>()((set) => ({
  sessions: [],
  defaults: null,
  loading: false,
  setSessions: (updater) =>
    set((state) => ({
      sessions: typeof updater === "function" ? updater(state.sessions) : updater,
    })),
  setDefaults: (defaults) => set({ defaults }),
  setLoading: (loading) => set({ loading }),
}));

export function resolveActiveSessionEntry(
  sessions: SessionEntry[],
  sessionKey: string,
): SessionEntry | undefined {
  return sessions.find((s) => s.key === sessionKey);
}
