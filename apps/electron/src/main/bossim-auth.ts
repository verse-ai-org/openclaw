/**
 * Bossim user account auth for the desktop app.
 * Tokens live in the main process only (safeStorage); renderer gets user profile via IPC.
 */

import { safeStorage, shell } from "electron";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";

function bffBaseUrl(): string {
  return (process.env.BOSSIM_BFF_URL?.trim() || "https://aiverser.com").replace(/\/$/, "");
}

function serviceBaseUrl(): string {
  return (
    process.env.BOSSIM_SERVICE_URL?.trim() ||
    "https://bossim-service-production.up.railway.app"
  ).replace(/\/$/, "");
}

function authAppUrl(): string {
  return process.env.BOSSIM_AUTH_APP_URL?.trim() || `${bffBaseUrl()}/auth/app`;
}

const AUTH_POLL_TIMEOUT_MS = 5 * 60 * 1000;

export type BossimUser = {
  id: string;
  email: string;
  display_name: string;
  avatar_url: string;
};

type BossimAuthStore = {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  user: BossimUser;
};

type AuthPollResult = {
  ok: boolean;
  user?: BossimUser;
  error?: string;
};

type PendingAuthSession = {
  startedAt: number;
  completed?: AuthPollResult;
};

let pendingSession: PendingAuthSession | null = null;
let sessionChangedListeners: Array<(user: BossimUser | null) => void> = [];

function authStorePath(): string {
  const base = process.env.OPENCLAW_CONFIG_DIR?.trim() || path.join(os.homedir(), ".openclaw");
  return path.join(base, "bossim-auth.json");
}

function normalizeUser(raw: unknown): BossimUser | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const u = raw as Record<string, unknown>;
  const id = typeof u.id === "string" ? u.id : "";
  if (!id) {
    return null;
  }
  return {
    id,
    email: typeof u.email === "string" ? u.email : "",
    display_name:
      typeof u.display_name === "string"
        ? u.display_name
        : typeof u.name === "string"
          ? u.name
          : "",
    avatar_url: typeof u.avatar_url === "string" ? u.avatar_url : "",
  };
}

function readStoreFile(): BossimAuthStore | null {
  const filePath = authStorePath();
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const outer = JSON.parse(raw) as { encrypted?: string; plain?: BossimAuthStore };
    if (outer.plain && typeof outer.plain === "object") {
      return outer.plain;
    }
    if (outer.encrypted && safeStorage.isEncryptionAvailable()) {
      const decrypted = safeStorage.decryptString(Buffer.from(outer.encrypted, "base64"));
      return JSON.parse(decrypted) as BossimAuthStore;
    }
    return null;
  } catch {
    return null;
  }
}

function writeStoreFile(store: BossimAuthStore | null): void {
  const filePath = authStorePath();
  if (!store) {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    return;
  }
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(JSON.stringify(store)).toString("base64");
    fs.writeFileSync(filePath, JSON.stringify({ encrypted }), "utf8");
  } else {
    fs.writeFileSync(filePath, JSON.stringify({ plain: store }), "utf8");
  }
}

function notifySessionChanged(user: BossimUser | null): void {
  for (const listener of sessionChangedListeners) {
    try {
      listener(user);
    } catch {
      // ignore listener errors
    }
  }
}

async function fetchJson(
  url: string,
  init?: RequestInit,
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const res = await fetch(url, init);
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { ok: res.ok, status: res.status, data };
}

function parseTokenPair(data: unknown): {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  user: BossimUser | null;
} | null {
  if (!data || typeof data !== "object") {
    return null;
  }
  const root = data as Record<string, unknown>;
  const payload =
    root.data && typeof root.data === "object"
      ? (root.data as Record<string, unknown>)
      : root;

  const accessToken =
    (typeof payload.access_token === "string" && payload.access_token) ||
    (typeof payload.accessToken === "string" && payload.accessToken) ||
    "";
  const refreshToken =
    (typeof payload.refresh_token === "string" && payload.refresh_token) ||
    (typeof payload.refreshToken === "string" && payload.refreshToken) ||
    "";

  if (!accessToken || !refreshToken) {
    return null;
  }

  let expiresAt = "";
  if (typeof payload.expires_at === "string") {
    expiresAt = payload.expires_at;
  } else if (typeof payload.expires_in === "number") {
    expiresAt = new Date(Date.now() + payload.expires_in * 1000).toISOString();
  } else {
    expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  }

  const user = normalizeUser(payload.user);
  return { accessToken, refreshToken, expiresAt, user };
}

async function fetchCurrentUser(accessToken: string): Promise<BossimUser | null> {
  const { ok, data } = await fetchJson(`${serviceBaseUrl()}/api/v1/users/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!ok) {
    return null;
  }
  const root = data as Record<string, unknown>;
  const payload =
    root.data && typeof root.data === "object" ? root.data : data;
  return normalizeUser(payload);
}

async function refreshTokens(refreshToken: string): Promise<BossimAuthStore | null> {
  const { ok, data } = await fetchJson(`${serviceBaseUrl()}/api/v1/auth/token/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  if (!ok) {
    return null;
  }
  const parsed = parseTokenPair(data);
  if (!parsed) {
    return null;
  }
  const user =
    parsed.user ?? (await fetchCurrentUser(parsed.accessToken));
  if (!user) {
    return null;
  }
  return {
    accessToken: parsed.accessToken,
    refreshToken: parsed.refreshToken,
    expiresAt: parsed.expiresAt,
    user,
  };
}

function isExpired(expiresAt: string): boolean {
  const ts = Date.parse(expiresAt);
  if (Number.isNaN(ts)) {
    return true;
  }
  return Date.now() >= ts - 60_000;
}

async function loadValidStore(): Promise<BossimAuthStore | null> {
  const store = readStoreFile();
  if (!store) {
    return null;
  }
  if (!isExpired(store.expiresAt)) {
    return store;
  }
  const refreshed = await refreshTokens(store.refreshToken);
  if (refreshed) {
    writeStoreFile(refreshed);
    return refreshed;
  }
  writeStoreFile(null);
  return null;
}

async function exchangeDesktopCode(code: string): Promise<BossimAuthStore | null> {
  const { ok, data } = await fetchJson(`${bffBaseUrl()}/api/auth/desktop/exchange`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
  if (!ok) {
    return null;
  }
  const parsed = parseTokenPair(data);
  if (!parsed) {
    return null;
  }
  const user =
    parsed.user ?? (await fetchCurrentUser(parsed.accessToken));
  if (!user) {
    return null;
  }
  return {
    accessToken: parsed.accessToken,
    refreshToken: parsed.refreshToken,
    expiresAt: parsed.expiresAt,
    user,
  };
}

export function subscribeAuthSessionChanged(
  listener: (user: BossimUser | null) => void,
): () => void {
  sessionChangedListeners.push(listener);
  return () => {
    sessionChangedListeners = sessionChangedListeners.filter((l) => l !== listener);
  };
}

export function getAuthSessionChangedChannel(): string {
  return "auth:sessionChanged";
}

export async function authStart(): Promise<{ ok: boolean; error?: string }> {
  pendingSession = { startedAt: Date.now() };
  try {
    const url = authAppUrl();
    console.log(`[bossim-auth] opening auth URL: ${url}`);
    await shell.openExternal(url);
    return { ok: true };
  } catch (err) {
    pendingSession = null;
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Failed to open browser: ${msg}` };
  }
}

export async function authPoll(): Promise<AuthPollResult> {
  if (!pendingSession) {
    const store = await loadValidStore();
    if (store) {
      return { ok: true, user: store.user };
    }
    return { ok: false, error: "No active auth session." };
  }

  if (pendingSession.completed) {
    const result = pendingSession.completed;
    pendingSession = null;
    return result;
  }

  const elapsed = Date.now() - pendingSession.startedAt;
  if (elapsed > AUTH_POLL_TIMEOUT_MS) {
    pendingSession = null;
    return { ok: false, error: "timeout" };
  }

  return { ok: false, error: "pending" };
}

export function authCancel(): { ok: boolean } {
  pendingSession = null;
  return { ok: true };
}

export async function authGetSession(): Promise<{
  user: BossimUser | null;
  status: "authenticated" | "unauthenticated";
}> {
  const store = await loadValidStore();
  if (store) {
    return { user: store.user, status: "authenticated" };
  }
  return { user: null, status: "unauthenticated" };
}

export async function authLogout(): Promise<{ ok: boolean }> {
  const store = readStoreFile();
  if (store?.refreshToken) {
    try {
      await fetchJson(`${serviceBaseUrl()}/api/v1/auth/logout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: store.refreshToken }),
      });
    } catch {
      // best-effort revoke
    }
  }
  writeStoreFile(null);
  notifySessionChanged(null);
  return { ok: true };
}

export async function handleAuthProtocolCallback(url: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    console.warn(`[bossim-auth] invalid callback URL: ${url}`);
    return;
  }

  if (parsed.hostname !== "auth" || !parsed.pathname.startsWith("/callback")) {
    return;
  }

  const error = parsed.searchParams.get("error");
  const code = parsed.searchParams.get("code");

  if (error) {
    if (pendingSession) {
      pendingSession.completed = { ok: false, error: `OAuth error: ${error}` };
    }
    return;
  }

  if (!code) {
    if (pendingSession) {
      pendingSession.completed = { ok: false, error: "Missing auth code in callback." };
    }
    return;
  }

  try {
    const store = await exchangeDesktopCode(code);
    if (!store) {
      console.warn("[bossim-auth] desktop code exchange failed");
      if (pendingSession) {
        pendingSession.completed = { ok: false, error: "Failed to exchange auth code." };
      }
      notifySessionChanged(null);
      return;
    }
    writeStoreFile(store);
    console.log(`[bossim-auth] session established for ${store.user.email || store.user.id}`);
    notifySessionChanged(store.user);
    if (pendingSession) {
      pendingSession.completed = { ok: true, user: store.user };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[bossim-auth] protocol callback error: ${msg}`);
    if (pendingSession) {
      pendingSession.completed = { ok: false, error: msg };
    }
  }
}

/** Dev-only: simulate successful auth without browser (VITE mock). */
export async function authDevMockLogin(user?: Partial<BossimUser>): Promise<void> {
  const mockUser: BossimUser = {
    id: user?.id ?? randomBytes(16).toString("hex"),
    email: user?.email ?? "dev@bossim.local",
    display_name: user?.display_name ?? "Dev User",
    avatar_url: user?.avatar_url ?? "",
  };
  const store: BossimAuthStore = {
    accessToken: "dev-access-token",
    refreshToken: "dev-refresh-token",
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    user: mockUser,
  };
  writeStoreFile(store);
  notifySessionChanged(mockUser);
  if (pendingSession) {
    pendingSession.completed = { ok: true, user: mockUser };
  }
}
