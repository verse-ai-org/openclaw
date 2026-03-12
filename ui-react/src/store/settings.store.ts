import { create } from "zustand";
import type { ThemeMode, UiSettings } from "@/types/gateway";

// ---------------------------------------------------------------------------
// localStorage helpers (mirrors ui/src/ui/storage.ts without Lit dependency)
// ---------------------------------------------------------------------------
const STORAGE_KEY = "openclaw.control.settings.v1";
const TOKEN_SESSION_KEY_PREFIX = "openclaw.control.token.v1:";
const LEGACY_TOKEN_SESSION_KEY = "openclaw.control.token.v1";

function normalizeGatewayTokenScope(gatewayUrl: string): string {
  const trimmed = gatewayUrl.trim();
  if (!trimmed) {
    return "default";
  }
  try {
    const base =
      typeof location !== "undefined"
        ? `${location.protocol}//${location.host}${location.pathname || "/"}`
        : undefined;
    const parsed = base ? new URL(trimmed, base) : new URL(trimmed);
    const pathname =
      parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/+$/, "") || parsed.pathname;
    return `${parsed.protocol}//${parsed.host}${pathname}`;
  } catch {
    return trimmed;
  }
}

function tokenSessionKey(gatewayUrl: string) {
  return `${TOKEN_SESSION_KEY_PREFIX}${normalizeGatewayTokenScope(gatewayUrl)}`;
}

function loadSessionToken(gatewayUrl: string): string {
  try {
    const storage = sessionStorage;
    storage.removeItem(LEGACY_TOKEN_SESSION_KEY);
    return (storage.getItem(tokenSessionKey(gatewayUrl)) ?? "").trim();
  } catch {
    return "";
  }
}

function persistSessionToken(gatewayUrl: string, token: string) {
  try {
    const storage = sessionStorage;
    storage.removeItem(LEGACY_TOKEN_SESSION_KEY);
    const key = tokenSessionKey(gatewayUrl);
    const v = token.trim();
    if (v) {
      storage.setItem(key, v);
    } else {
      storage.removeItem(key);
    }
  } catch {
    // best-effort
  }
}

function resolveDefaultGatewayUrl(): string {
  // In development (Vite on :5174), default to the gateway directly so we
  // don't need a WebSocket proxy and avoid Vite EPIPE noise.
  if (
    typeof import.meta !== "undefined" &&
    import.meta.env?.DEV &&
    location.hostname === "localhost" &&
    location.port === "5174"
  ) {
    return "ws://127.0.0.1:18789";
  }
  const proto = location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${location.host}`;
}

export function loadSettings(): UiSettings {
  const defaultUrl = resolveDefaultGatewayUrl();
  const defaults: UiSettings = {
    gatewayUrl: defaultUrl,
    token: loadSessionToken(defaultUrl),
    sessionKey: "main",
    lastActiveSessionKey: "main",
    theme: "system",
    chatFocusMode: false,
    chatShowThinking: true,
    splitRatio: 0.6,
    navCollapsed: false,
    navGroupsCollapsed: {},
  };

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return defaults;
    }
    const parsed = JSON.parse(raw) as Partial<UiSettings>;
    const gatewayUrl =
      typeof parsed.gatewayUrl === "string" && parsed.gatewayUrl.trim()
        ? parsed.gatewayUrl.trim()
        : defaultUrl;
    return {
      gatewayUrl,
      token: loadSessionToken(gatewayUrl),
      sessionKey:
        typeof parsed.sessionKey === "string" && parsed.sessionKey.trim()
          ? parsed.sessionKey.trim()
          : "main",
      lastActiveSessionKey:
        typeof parsed.lastActiveSessionKey === "string" && parsed.lastActiveSessionKey.trim()
          ? parsed.lastActiveSessionKey.trim()
          : "main",
      theme:
        parsed.theme === "light" || parsed.theme === "dark" || parsed.theme === "system"
          ? parsed.theme
          : "system",
      chatFocusMode: typeof parsed.chatFocusMode === "boolean" ? parsed.chatFocusMode : false,
      chatShowThinking:
        typeof parsed.chatShowThinking === "boolean" ? parsed.chatShowThinking : true,
      splitRatio:
        typeof parsed.splitRatio === "number" &&
        parsed.splitRatio >= 0.4 &&
        parsed.splitRatio <= 0.7
          ? parsed.splitRatio
          : 0.6,
      navCollapsed: typeof parsed.navCollapsed === "boolean" ? parsed.navCollapsed : false,
      navGroupsCollapsed:
        typeof parsed.navGroupsCollapsed === "object" && parsed.navGroupsCollapsed !== null
          ? parsed.navGroupsCollapsed
          : {},
      locale: parsed.locale,
    };
  } catch {
    return defaults;
  }
}

function persistSettings(settings: UiSettings) {
  persistSessionToken(settings.gatewayUrl, settings.token);
  const { token: _token, ...toSave } = settings;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
}

// ---------------------------------------------------------------------------
// Theme helpers
// ---------------------------------------------------------------------------
function resolveSystemTheme(): "light" | "dark" {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyThemeToDom(theme: ThemeMode) {
  const resolved = theme === "system" ? resolveSystemTheme() : theme;
  document.documentElement.classList.toggle("dark", resolved === "dark");
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------
interface SettingsState {
  settings: UiSettings;
  password: string;

  updateSettings: (next: Partial<UiSettings>) => void;
  setPassword: (pw: string) => void;
  applyTheme: (theme: ThemeMode) => void;
}

export const useSettingsStore = create<SettingsState>()((set, get) => ({
  settings: loadSettings(),
  password: "",

  updateSettings: (next) => {
    const updated = { ...get().settings, ...next };
    persistSettings(updated);
    set({ settings: updated });
    if (next.theme !== undefined) {
      applyThemeToDom(updated.theme);
    }
  },

  setPassword: (pw) => set({ password: pw }),

  applyTheme: (theme) => {
    get().updateSettings({ theme });
    applyThemeToDom(theme);
  },
}));
