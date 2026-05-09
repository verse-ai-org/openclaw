import { create } from "zustand";

type ComposerState = {
  /**
   * Pre-filled draft message for the composer — consumed once on mount and cleared.
   */
  pendingDraftMessage: string | null;
  setPendingDraftMessage: (msg: string | null) => void;
  clearPendingDraftMessage: () => void;
};

export const useComposerStore = create<ComposerState>()((set) => ({
  pendingDraftMessage: null,
  setPendingDraftMessage: (msg) => set({ pendingDraftMessage: msg }),
  clearPendingDraftMessage: () => set({ pendingDraftMessage: null }),
}));

