import { create } from "zustand";
import type { ThemeMode, UiSettings } from "@/types/gateway";
import { getElectronBridge } from "@/utils/electron-env";

// ---------------------------------------------------------------------------
// localStorage helpers (mirrors ui/src/ui/storage.ts without Lit dependency)
// ---------------------------------------------------------------------------
const STORAGE_KEY = "openclaw.control.settings.v1";
const TOKEN_SESSION_KEY_PREFIX = "openclaw.control.token.v1:";
const LEGACY_TOKEN_SESSION_KEY = "openclaw.control.token.v1";
// Persists the gateway URL injected by Electron so it survives page refresh
// even when the static server port changes between launches.
const ELECTRON_GATEWAY_URL_KEY = "openclaw.control.electron-gateway-url.v1";

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
      parsed.pathname === "/"
        ? ""
        : parsed.pathname.replace(/\/+$/, "") || parsed.pathname;
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
  // Port is read from VITE_GATEWAY_PORT env var so it stays in sync with
  // the Electron main process (which may use 18790 to avoid conflicts).
  if (
    import.meta !== undefined &&
    import.meta.env?.DEV &&
    location.hostname === "localhost" &&
    location.port === "5174"
  ) {
    const port = import.meta.env.VITE_GATEWAY_PORT ?? "18789";
    return `ws://127.0.0.1:${port}`;
  }
  // file:// protocol (Electron packaged): location.host is empty, default to loopback
  if (location.protocol === "file:") {
    return "ws://127.0.0.1:18789";
  }
  // Electron packaged with embedded static HTTP server: the page is served from
  // http://127.0.0.1:<static-server-port>/ which is NOT the Gateway port.
  // Using location.host here would produce ws://127.0.0.1:<static-port>, which
  // is wrong and causes the sessionStorage token key to mismatch on refresh.
  // Instead, prefer the Gateway URL persisted by Electron on first load, then
  // fall back to the default loopback Gateway port.
  if (location.protocol === "http:" && location.hostname === "127.0.0.1") {
    try {
      const persisted = localStorage.getItem(ELECTRON_GATEWAY_URL_KEY);
      if (persisted?.trim()) {
        return persisted.trim();
      }
    } catch {
      // best-effort
    }
    return "ws://127.0.0.1:18789";
  }
  const proto = location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${location.host}`;
}

function isDevGatewayOverrideActive(): boolean {
  return (
    import.meta !== undefined &&
    !!import.meta.env?.DEV &&
    typeof location !== "undefined" &&
    location.hostname === "localhost" &&
    location.port === "5174"
  );
}

function isElectronRenderer(): boolean {
  return getElectronBridge()?.isElectron === true;
}

/** Vite on :5174 in a plain browser (no Electron shell). */
function isBrowserOnlyViteDev(): boolean {
  return isDevGatewayOverrideActive() && !isElectronRenderer();
}

function resolveDevToken(): string {
  // In Vite dev mode, read VITE_GATEWAY_TOKEN baked at build time.
  // Users configure this in ui-react/.env.local (git-ignored).
  // Returns empty string in production so it never leaks into packaged builds.
  if (import.meta !== undefined && import.meta.env?.DEV) {
    return (
      (import.meta.env.VITE_GATEWAY_TOKEN as string | undefined)?.trim() ?? ""
    );
  }
  return "";
}

/** Token priority for Control UI gateway auth. Exported for tests. */
export function resolveGatewayToken(params: {
  urlToken: string;
  gatewayUrl: string;
  devToken: string;
  /** When true, Electron ?token= beats VITE_GATEWAY_TOKEN (.env.local). */
  inElectron?: boolean;
}): string {
  const inElectron = params.inElectron === true;
  // Browser-only dev on :5174 — .env.local beats sessionStorage.
  // Inside Electron+Vite, main process injects the live token via ?token=.
  if (isDevGatewayOverrideActive() && !inElectron && params.devToken.trim()) {
    const devToken = params.devToken.trim();
    const cached = loadSessionToken(params.gatewayUrl);
    if (cached && cached !== devToken) {
      persistSessionToken(params.gatewayUrl, devToken);
    }
    return devToken;
  }
  if (params.urlToken.trim()) {
    return params.urlToken.trim();
  }
  return loadSessionToken(params.gatewayUrl) || params.devToken.trim();
}

export function loadSettings(): UiSettings {
  const defaultUrl = resolveDefaultGatewayUrl();

  // Read gatewayUrl and token from URL hash injected by Electron main process.
  // (#gatewayUrl=ws://...&token=xxx)
  // Strip them from the URL immediately so they never appear in history.
  let urlToken = "";
  let urlGatewayUrl = "";
  try {
    // Read gatewayUrl and token from URL query string injected by Electron main process.
    // (?gatewayUrl=ws://...&token=xxx) — query string avoids conflict with createHashRouter.
    const searchParams = new URLSearchParams(location.search);
    const rawToken = searchParams.get("token");
    const rawGatewayUrl = searchParams.get("gatewayUrl");
    if (rawToken?.trim()) {
      urlToken = rawToken.trim();
      searchParams.delete("token");
    }
    if (rawGatewayUrl?.trim()) {
      urlGatewayUrl = rawGatewayUrl.trim();
      searchParams.delete("gatewayUrl");
    }
    if (urlToken || urlGatewayUrl) {
      const newSearch = searchParams.toString();
      history.replaceState(
        null,
        "",
        newSearch ? `?${newSearch}` : location.pathname,
      );
      // Persist the Electron-injected gateway URL to localStorage so that
      // resolveDefaultGatewayUrl() can recover it on page refresh, even when
      // the embedded static server port changes between launches.
      if (urlGatewayUrl) {
        try {
          localStorage.setItem(ELECTRON_GATEWAY_URL_KEY, urlGatewayUrl);
        } catch {
          // best-effort
        }
      }
      // Persist token to sessionStorage so it survives page refresh.
      // Skip stale Electron session tokens only in browser-only Vite dev.
      if (urlToken) {
        const devToken = resolveDevToken();
        const skipStaleElectronToken =
          isBrowserOnlyViteDev() &&
          devToken.trim() &&
          urlToken.trim() !== devToken.trim();
        if (!skipStaleElectronToken) {
          persistSessionToken(urlGatewayUrl || defaultUrl, urlToken);
        }
      }
    }
  } catch {
    // best-effort
  }

  // Effective gateway URL: hash param > localStorage > default
  const resolvedGatewayUrl = urlGatewayUrl || defaultUrl;
  // Token priority: URL param > sessionStorage > VITE_GATEWAY_TOKEN (dev-only env)
  const devToken = resolveDevToken();
  const inElectron = isElectronRenderer();
  const defaults: UiSettings = {
    gatewayUrl: resolvedGatewayUrl,
    token: resolveGatewayToken({
      urlToken,
      gatewayUrl: resolvedGatewayUrl,
      devToken,
      inElectron,
    }),
    sessionKey: "main",
    lastActiveSessionKey: "main",
    theme: "light",
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
    const gatewayUrl = (() => {
      // Hash param (injected by Electron) takes highest priority.
      if (urlGatewayUrl) {
        return urlGatewayUrl;
      }
      // In dev mode (port 5174) always use the gateway override — never trust
      // a stale localStorage URL that may point back at the Vite dev server.
      if (isDevGatewayOverrideActive()) {
        return defaultUrl;
      }
      return typeof parsed.gatewayUrl === "string" && parsed.gatewayUrl.trim()
        ? parsed.gatewayUrl.trim()
        : defaultUrl;
    })();
    return {
      gatewayUrl,
      token: resolveGatewayToken({ urlToken, gatewayUrl, devToken, inElectron }),
      sessionKey:
        typeof parsed.sessionKey === "string" && parsed.sessionKey.trim()
          ? parsed.sessionKey.trim()
          : "main",
      lastActiveSessionKey:
        typeof parsed.lastActiveSessionKey === "string" &&
        parsed.lastActiveSessionKey.trim()
          ? parsed.lastActiveSessionKey.trim()
          : "main",
      theme: parsed.theme === "dark" ? "dark" : "light",
      chatFocusMode:
        typeof parsed.chatFocusMode === "boolean"
          ? parsed.chatFocusMode
          : false,
      chatShowThinking:
        typeof parsed.chatShowThinking === "boolean"
          ? parsed.chatShowThinking
          : true,
      splitRatio:
        typeof parsed.splitRatio === "number" &&
        parsed.splitRatio >= 0.4 &&
        parsed.splitRatio <= 0.7
          ? parsed.splitRatio
          : 0.6,
      navCollapsed:
        typeof parsed.navCollapsed === "boolean" ? parsed.navCollapsed : false,
      navGroupsCollapsed:
        typeof parsed.navGroupsCollapsed === "object" &&
        parsed.navGroupsCollapsed !== null
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
function applyThemeToDom(theme: ThemeMode) {
  document.documentElement.classList.toggle("dark", theme === "dark");
}

/** Appearance saved in UI settings — used as ThemeProvider defaultTheme. */
export function getPersistedAppearance(): ThemeMode {
  return loadSettings().theme;
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
  },
}));
