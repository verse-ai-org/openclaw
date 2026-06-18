import type { BossimUser } from "@/lib/auth/bridge";
import { CONFIG } from "@/data/config";

/** Dev-only mock Bossim auth IPC for browser testing without Electron. */
export function installDevAuthMock(): void {
  if (!import.meta.env.DEV) {
    return;
  }
  const win = window as Window & { electronBridge?: Record<string, unknown> };
  if (win.electronBridge?.authGetSession) {
    return;
  }

  let mockUser: BossimUser | null = null;
  let authPending = false;
  let authStartedAt = 0;
  const listeners: Array<(payload: { user: BossimUser | null }) => void> = [];

  const notify = (user: BossimUser | null) => {
    for (const listener of listeners) {
      listener({ user });
    }
  };

  win.electronBridge = {
    ...win.electronBridge,
    isElectron: false,
    authStart: async () => {
      authPending = true;
      authStartedAt = Date.now();
      window.open(CONFIG.authAppUrl, "_blank");
      return { ok: true };
    },
    authPoll: async () => {
      if (!authPending) {
        return mockUser ? { ok: true, user: mockUser } : { ok: false, error: "No active auth session." };
      }
      if (Date.now() - authStartedAt > 5 * 60 * 1000) {
        authPending = false;
        return { ok: false, error: "timeout" };
      }
      if (Date.now() - authStartedAt > 4000) {
        authPending = false;
        mockUser = {
          id: "mock-user-id",
          email: "mock@bossim.local",
          display_name: "Mock User",
          avatar_url: "",
        };
        notify(mockUser);
        return { ok: true, user: mockUser };
      }
      return { ok: false, error: "pending" };
    },
    authCancel: async () => {
      authPending = false;
      return { ok: true };
    },
    authGetSession: async () => {
      if (mockUser) {
        return { user: mockUser, status: "authenticated" as const };
      }
      return { user: null, status: "unauthenticated" as const };
    },
    authLogout: async () => {
      mockUser = null;
      authPending = false;
      notify(null);
      return { ok: true };
    },
    onAuthSessionChanged: (callback: (payload: { user: BossimUser | null }) => void) => {
      listeners.push(callback);
      return () => {
        const idx = listeners.indexOf(callback);
        if (idx >= 0) {
          listeners.splice(idx, 1);
        }
      };
    },
  };
}
