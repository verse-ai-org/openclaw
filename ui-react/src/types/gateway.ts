/**
 * Re-export gateway types used across the React UI.
 * The actual GatewayBrowserClient lives in ui/src/ui/gateway.ts and is
 * referenced directly – we avoid duplicating the implementation.
 */

// Storage / settings types (re-implemented to avoid Lit dependency)
export type ThemeMode = "light" | "dark" | "system";

export type UiSettings = {
  gatewayUrl: string;
  token: string;
  sessionKey: string;
  lastActiveSessionKey: string;
  theme: ThemeMode;
  chatFocusMode: boolean;
  chatShowThinking: boolean;
  splitRatio: number;
  navCollapsed: boolean;
  navGroupsCollapsed: Record<string, boolean>;
  locale?: string;
};

// Navigation tabs (mirrors ui/src/ui/navigation.ts)
export type Tab =
  | "agents"
  | "employees"
  | "overview"
  | "channels"
  | "instances"
  | "sessions"
  | "usage"
  | "cron"
  | "skills"
  | "plugins"
  | "nodes"
  | "chat"
  | "config"
  | "settings"
  | "debug"
  | "logs";

export type TabGroup = {
  label: string;
  tabs: readonly Tab[];
};

export const TAB_GROUPS: TabGroup[] = [
  { label: "Message", tabs: ["chat"] },
  { label: "Team", tabs: ["employees", "skills"] },
  { label: "Tools", tabs: ["channels", "plugins"] },
  { label: "settings", tabs: ["overview", "settings"] },
];

export const TAB_PATHS: Record<Tab, string> = {
  agents: "/agents",
  employees: "/employees",
  overview: "/overview",
  channels: "/channels",
  skills: "/skills",
  plugins: "/plugins",
  chat: "/chat",
  config: "/config",
  settings: "/settings",
  debug: "/debug",
  instances: "/instances",
  sessions: "/sessions",
  usage: "/usage",
  nodes: "/nodes",
  logs: "/logs",
  cron: "/cron",
};

// Gateway protocol types (minimal, enough for Phase 1)
export type GatewayHelloOk = {
  type: "hello-ok";
  protocol: number;
  server?: { version?: string; connId?: string };
  features?: { methods?: string[]; events?: string[] };
  snapshot?: unknown;
  auth?: {
    deviceToken?: string;
    role?: string;
    scopes?: string[];
    issuedAtMs?: number;
  };
  policy?: { tickIntervalMs?: number };
};

export type GatewayEventFrame = {
  type: "event";
  event: string;
  payload?: unknown;
  seq?: number;
  stateVersion?: { presence: number; health: number };
};

export type GatewayErrorInfo = {
  code: string;
  message: string;
  details?: unknown;
};

export type PresenceEntry = {
  nodeId?: string;
  clientId?: string;
  name?: string;
  platform?: string;
  online?: boolean;
  [key: string]: unknown;
};

export type UpdateAvailable = {
  version?: string;
  releaseUrl?: string;
  [key: string]: unknown;
};

export type HealthSnapshot = Record<string, unknown>;
export type StatusSummary = Record<string, unknown>;
