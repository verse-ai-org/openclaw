import { useCallback, useEffect, useRef, useState } from "react";
import { getAuthBridge, shouldSkipAuthGate, type BossimUser } from "@/lib/auth/bridge";
import { useAuthStore } from "@/store/auth.store";

export type BrowserAuthPhase = "idle" | "opening" | "polling" | "success" | "error";

export function useAuth() {
  const user = useAuthStore((s) => s.user);
  const status = useAuthStore((s) => s.status);
  const refresh = useAuthStore((s) => s.refresh);
  const logout = useAuthStore((s) => s.logout);

  useEffect(() => {
    const state = useAuthStore.getState();
    if (state.status === "idle") {
      void refresh();
    }

    const bridge = getAuthBridge();
    if (!bridge?.onAuthSessionChanged) {
      return;
    }
    const unsubscribe = bridge.onAuthSessionChanged(({ user: nextUser }) => {
      useAuthStore.getState().setUser(nextUser);
      useAuthStore.getState().setStatus(nextUser ? "authenticated" : "unauthenticated");
    });
    return unsubscribe;
  }, [refresh]);

  return { user, status, refresh, logout, isAuthenticated: status === "authenticated" };
}

export function useBrowserAuth(onSuccess?: (user: BossimUser) => void) {
  const bridge = getAuthBridge();
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [phase, setPhase] = useState<BrowserAuthPhase>("idle");
  const [error, setError] = useState<string | null>(null);

  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      stopPolling();
      const status = useAuthStore.getState().status;
      if (status !== "authenticated") {
        void bridge?.authCancel?.();
      }
    };
  }, [bridge, stopPolling]);

  const startPolling = useCallback(() => {
    pollIntervalRef.current = setInterval(() => {
      void (async () => {
        if (!bridge?.authPoll) {
          stopPolling();
          return;
        }
        try {
          const result = await bridge.authPoll();
          if (result.ok && result.user) {
            stopPolling();
            setPhase("success");
            useAuthStore.getState().setUser(result.user);
            useAuthStore.getState().setStatus("authenticated");
            setTimeout(() => onSuccess?.(result.user!), 600);
          } else if (result.error === "pending") {
            // keep polling
          } else if (result.error === "timeout") {
            stopPolling();
            setPhase("error");
            setError("Authentication timed out. Please try again.");
          } else {
            stopPolling();
            setPhase("error");
            setError(result.error ?? "Authentication failed.");
          }
        } catch (err) {
          stopPolling();
          setPhase("error");
          setError(err instanceof Error ? err.message : "Unexpected error.");
        }
      })();
    }, 2000);
  }, [bridge, onSuccess, stopPolling]);

  const startBrowserAuth = useCallback(async () => {
    if (shouldSkipAuthGate()) {
      await useAuthStore.getState().refresh();
      setPhase("success");
      return;
    }

    if (!bridge?.authStart) {
      setPhase("error");
      setError("Authentication is only available in the Bossim desktop app.");
      return;
    }

    setPhase("opening");
    setError(null);
    try {
      const result = await bridge.authStart();
      if (!result.ok) {
        setPhase("error");
        setError(result.error ?? "Failed to open browser.");
        return;
      }
      setPhase("polling");
      startPolling();
    } catch (err) {
      setPhase("error");
      setError(err instanceof Error ? err.message : "Unexpected error.");
    }
  }, [bridge, startPolling]);

  const retry = useCallback(async () => {
    stopPolling();
    await bridge?.authCancel?.();
    setPhase("idle");
    setError(null);
  }, [bridge, stopPolling]);

  return { phase, error, startBrowserAuth, retry };
}
