import { create } from "zustand";
import type { ArtifactSummary } from "@/components/chat/types";

export type CachedArtifactDownload = {
  encoding?: "base64";
  data?: string;
  url?: string;
  mimeType?: string;
};

type ArtifactCacheState = {
  /** sessionKey → artifactId → summary */
  bySession: Record<string, Record<string, ArtifactSummary>>;
  /** sessionKey → artifactId → downloaded bytes/url */
  downloadsBySession: Record<string, Record<string, CachedArtifactDownload>>;
  /** Bumped when a session cache changes so chat can re-project attachments. */
  versionBySession: Record<string, number>;
  mergeSummaries: (sessionKey: string, summaries: ArtifactSummary[]) => void;
  getSummary: (sessionKey: string, artifactId: string) => ArtifactSummary | undefined;
  setDownload: (
    sessionKey: string,
    artifactId: string,
    payload: CachedArtifactDownload,
  ) => void;
  getDownload: (sessionKey: string, artifactId: string) => CachedArtifactDownload | undefined;
  clearSession: (sessionKey: string) => void;
};

export const useArtifactCacheStore = create<ArtifactCacheState>()((set, get) => ({
  bySession: {},
  downloadsBySession: {},
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

  setDownload: (sessionKey, artifactId, payload) => {
    const key = sessionKey.trim();
    const id = artifactId.trim();
    if (!key || !id) {
      return;
    }
    const hasBytes = payload.encoding === "base64" && typeof payload.data === "string";
    const hasUrl = typeof payload.url === "string" && payload.url.trim().length > 0;
    if (!hasBytes && !hasUrl) {
      return;
    }
    set((state) => {
      const prev = state.downloadsBySession[key] ?? {};
      return {
        downloadsBySession: {
          ...state.downloadsBySession,
          [key]: {
            ...prev,
            [id]: {
              ...(hasBytes ? { encoding: "base64" as const, data: payload.data } : {}),
              ...(hasUrl ? { url: payload.url!.trim() } : {}),
              ...(payload.mimeType?.trim() ? { mimeType: payload.mimeType.trim() } : {}),
            },
          },
        },
      };
    });
  },

  getDownload: (sessionKey, artifactId) => {
    const key = sessionKey.trim();
    const id = artifactId.trim();
    if (!key || !id) {
      return undefined;
    }
    return get().downloadsBySession[key]?.[id];
  },

  clearSession: (sessionKey) => {
    const key = sessionKey.trim();
    if (!key) {
      return;
    }
    set((state) => {
      const hasSummaries = key in state.bySession;
      const hasDownloads = key in state.downloadsBySession;
      const hasVersion = key in state.versionBySession;
      if (!hasSummaries && !hasDownloads && !hasVersion) {
        return state;
      }
      const { [key]: _removed, ...bySession } = state.bySession;
      const { [key]: _downloads, ...downloadsBySession } = state.downloadsBySession;
      const { [key]: _v, ...versionBySession } = state.versionBySession;
      return { bySession, downloadsBySession, versionBySession };
    });
  },
}));
