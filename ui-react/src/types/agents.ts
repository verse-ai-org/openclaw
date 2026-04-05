/**
 * Agents page types – mirrors ui/src/ui/types.ts agent-related exports.
 */

// ── Agent list ────────────────────────────────────────────────────────────────

export type GatewayAgentRow = {
  id: string;
  name?: string;
  skills?: string[];
  identity?: {
    name?: string;
    emoji?: string;
    avatar?: string;
    avatarUrl?: string;
    theme?: string;
    description?: string;
    bio?: string;
    summary?: string;
  };
  [key: string]: unknown;
};

export type AgentsListResult = {
  defaultId: string;
  mainKey: string;
  scope: string;
  agents: GatewayAgentRow[];
};

// ── Agent identity ────────────────────────────────────────────────────────────

export type AgentIdentityResult = {
  agentId: string;
  name: string;
  avatar: string;
  emoji?: string;
};

// ── Agent files ───────────────────────────────────────────────────────────────

export type AgentFileEntry = {
  name: string;
  path: string;
  missing: boolean;
  size?: number;
  updatedAtMs?: number;
  content?: string;
};

export type AgentsFilesListResult = {
  agentId: string;
  workspace: string;
  files: AgentFileEntry[];
};

export type AgentsFilesGetResult = {
  agentId: string;
  workspace: string;
  file: AgentFileEntry;
};

export type AgentsFilesSetResult = {
  ok: true;
  agentId: string;
  workspace: string;
  file: AgentFileEntry;
};

// ── Agent CRUD ────────────────────────────────────────────────────────────────

export type AgentsCreateResult = {
  ok: true;
  agentId: string;
  name: string;
  workspace: string;
};

export type AgentsDeleteResult = {
  ok: true;
  agentId: string;
  removedBindings: number;
};

// ── Tools catalog ─────────────────────────────────────────────────────────────

export type ToolCatalogProfile = {
  id: "minimal" | "coding" | "messaging" | "full";
  label: string;
};

export type ToolCatalogEntry = {
  id: string;
  label: string;
  description: string;
  source: "core" | "plugin";
  pluginId?: string;
  optional?: boolean;
  defaultProfiles: Array<"minimal" | "coding" | "messaging" | "full">;
};

export type ToolCatalogGroup = {
  id: string;
  label: string;
  source: "core" | "plugin";
  pluginId?: string;
  tools: ToolCatalogEntry[];
};

export type ToolsCatalogResult = {
  agentId: string;
  profiles: ToolCatalogProfile[];
  groups: ToolCatalogGroup[];
};

// ── Skills ────────────────────────────────────────────────────────────────────

export type SkillsStatusConfigCheck = {
  path: string;
  satisfied: boolean;
};

export type SkillInstallOption = {
  id: string;
  kind: "brew" | "node" | "go" | "uv";
  label: string;
  bins: string[];
};

export type AgentSkillStatusEntry = {
  name: string;
  description: string;
  source: string;
  filePath: string;
  baseDir: string;
  skillKey: string;
  bundled?: boolean;
  primaryEnv?: string;
  emoji?: string;
  homepage?: string;
  always: boolean;
  disabled: boolean;
  blockedByAllowlist: boolean;
  eligible: boolean;
  requirements: {
    bins: string[];
    env: string[];
    config: string[];
    os: string[];
  };
  missing: {
    bins: string[];
    env: string[];
    config: string[];
    os: string[];
  };
  configChecks: SkillsStatusConfigCheck[];
  install: SkillInstallOption[];
};

export type AgentSkillStatusReport = {
  workspaceDir: string;
  managedSkillsDir: string;
  skills: AgentSkillStatusEntry[];
};

// ── Cron ─────────────────────────────────────────────────────────────────────

export type CronSchedule =
  | { kind: "at"; at: string }
  | { kind: "every"; everyMs: number; anchorMs?: number }
  | { kind: "cron"; expr: string; tz?: string; staggerMs?: number };

export type CronSessionTarget = "main" | "isolated";
export type CronWakeMode = "next-heartbeat" | "now";

export type CronPayload =
  | { kind: "systemEvent"; text: string }
  | {
      kind: "agentTurn";
      message: string;
      model?: string;
      thinking?: string;
      timeoutSeconds?: number;
      lightContext?: boolean;
    };

export type CronDelivery = {
  mode: "none" | "announce" | "webhook";
  channel?: string;
  to?: string;
  accountId?: string;
  bestEffort?: boolean;
};

export type CronFailureAlert = {
  after?: number;
  channel?: string;
  to?: string;
  cooldownMs?: number;
  mode?: "announce" | "webhook";
  accountId?: string;
};

export type CronJobState = {
  nextRunAtMs?: number;
  runningAtMs?: number;
  lastRunAtMs?: number;
  lastStatus?: "ok" | "error" | "skipped";
  lastError?: string;
  lastDurationMs?: number;
};

export type CronJob = {
  id: string;
  name: string;
  description?: string;
  agentId?: string;
  sessionKey?: string;
  enabled: boolean;
  deleteAfterRun?: boolean;
  schedule: CronSchedule;
  sessionTarget: CronSessionTarget;
  wakeMode: CronWakeMode;
  payload: CronPayload;
  delivery?: CronDelivery;
  failureAlert?: CronFailureAlert | false;
  state?: CronJobState;
  updatedAtMs?: number;
};

export type CronStatus = {
  enabled: boolean;
  jobs: number;
  nextWakeAtMs?: number | null;
};

export type CronJobsListResult = {
  jobs?: CronJob[];
  total?: number;
  offset?: number;
  limit?: number;
  hasMore?: boolean;
  nextOffset?: number | null;
};

// ── Panel tabs ────────────────────────────────────────────────────────────────

export type AgentsPanel =
  | "overview"
  | "files"
  | "tools"
  | "skills"
  | "channels"
  | "cron";

// ── Config helpers ────────────────────────────────────────────────────────────

export type AgentConfigEntry = {
  id: string;
  name?: string;
  workspace?: string;
  agentDir?: string;
  model?: unknown;
  skills?: string[];
  tools?: {
    profile?: string;
    allow?: string[];
    alsoAllow?: string[];
    deny?: string[];
  };
};

export type AgentConfigDefaults = {
  workspace?: string;
  model?: unknown;
  models?: Record<string, { alias?: string }>;
};

export type AgentConfigSnapshot = {
  agents?: {
    defaults?: AgentConfigDefaults;
    list?: AgentConfigEntry[];
  };
  tools?: {
    profile?: string;
    allow?: string[];
    alsoAllow?: string[];
    deny?: string[];
  };
};
