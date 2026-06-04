import { create } from "zustand";
import type { ArtifactSummary } from "@/components/chat/types";

type ArtifactCacheState = {
  /** sessionKey → artifactId → summary */
  bySession: Record<string, Record<string, ArtifactSummary>>;
  /** Bumped when a session cache changes so chat can re-project attachments. */
  versionBySession: Record<string, number>;
  mergeSummaries: (sessionKey: string, summaries: ArtifactSummary[]) => void;
  getSummary: (sessionKey: string, artifactId: string) => ArtifactSummary | undefined;
  clearSession: (sessionKey: string) => void;
};

export const useArtifactCacheStore = create<ArtifactCacheState>()((set, get) => ({
  bySession: {},
  versionBySession: {},

  mergeSummaries: (sessionKey, summaries) => {
    const key = sessionKey.trim();
    if (!key || summaries.length === 0) {
      return;
    }
    set((state) => {
      const prev = state.bySession[key] ?? {};
      const next = { ...prev };
      for (const summary of summaries) {
        next[summary.id] = summary;
      }
      return {
        bySession: { ...state.bySession, [key]: next },
        versionBySession: {
          ...state.versionBySession,
          [key]: (state.versionBySession[key] ?? 0) + 1,
        },
      };
    });
  },

  getSummary: (sessionKey, artifactId) => {
    const key = sessionKey.trim();
    const id = artifactId.trim();
    if (!key || !id) {
      return undefined;
    }
    return get().bySession[key]?.[id];
  },

  clearSession: (sessionKey) => {
    const key = sessionKey.trim();
    if (!key) {
      return;
    }
    set((state) => {
      if (!(key in state.bySession)) {
        return state;
      }
      const { [key]: _removed, ...bySession } = state.bySession;
      const { [key]: _v, ...versionBySession } = state.versionBySession;
      return { bySession, versionBySession };
    });
  },
}));
