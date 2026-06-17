import { create } from "zustand";
import {
  getAuthBridge,
  shouldSkipAuthGate,
  type AuthStatus,
  type BossimUser,
} from "@/lib/auth/bridge";

type AuthState = {
  user: BossimUser | null;
  status: AuthStatus;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
  setUser: (user: BossimUser | null) => void;
  setStatus: (status: AuthStatus) => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  status: "idle",

  setUser: (user) => set({ user }),
  setStatus: (status) => set({ status }),

  refresh: async () => {
    if (shouldSkipAuthGate()) {
      set({
        user: {
          id: "dev-skip",
          email: "dev@bossim.local",
          display_name: "Dev User",
          avatar_url: "",
        },
        status: "authenticated",
      });
      return;
    }

    const bridge = getAuthBridge();
    if (!bridge?.authGetSession) {
      set({ user: null, status: "unauthenticated" });
      return;
    }

    const previous = useAuthStore.getState();
    const showLoading = previous.status === "idle" || previous.status === "unauthenticated";
    if (showLoading) {
      set({ status: "loading" });
    }

    try {
      const session = await bridge.authGetSession();
      if (session.status === "authenticated" && session.user) {
        set({ user: session.user, status: "authenticated" });
      } else if (showLoading || previous.status === "authenticated") {
        set({ user: null, status: "unauthenticated" });
      }
    } catch {
      if (showLoading || previous.status !== "authenticated") {
        set({ user: null, status: "unauthenticated" });
      }
    }
  },

  logout: async () => {
    const bridge = getAuthBridge();
    if (bridge?.authLogout) {
      await bridge.authLogout();
    }
    set({ user: null, status: "unauthenticated" });
  },
}));
