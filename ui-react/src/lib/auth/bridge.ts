export type BossimUser = {
  id: string;
  email: string;
  display_name: string;
  avatar_url: string;
};

export type AuthStatus = "idle" | "loading" | "authenticated" | "unauthenticated";

export type AuthBridge = {
  authStart?: () => Promise<{ ok: boolean; error?: string }>;
  authPoll?: () => Promise<{ ok: boolean; user?: BossimUser; error?: string }>;
  authCancel?: () => Promise<{ ok: boolean }>;
  authGetSession?: () => Promise<{
    user: BossimUser | null;
    status: "authenticated" | "unauthenticated";
  }>;
  authLogout?: () => Promise<{ ok: boolean }>;
  onAuthSessionChanged?: (
    callback: (payload: { user: BossimUser | null }) => void,
  ) => () => void;
};

export function getAuthBridge(): AuthBridge | null {
  if (typeof window === "undefined") {
    return null;
  }
  const bridge = (window as Window & { electronBridge?: AuthBridge }).electronBridge;
  if (!bridge?.authGetSession) {
    return null;
  }
  return bridge;
}

export function shouldSkipAuthGate(): boolean {
  return import.meta.env.VITE_SKIP_AUTH === "1";
}

export function isAuthAvailable(): boolean {
  return shouldSkipAuthGate() || getAuthBridge() !== null;
}
