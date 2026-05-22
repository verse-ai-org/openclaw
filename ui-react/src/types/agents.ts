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
    /** Showcase video URL. Optional — rendered in the agent detail page when present. */
    video?: string;
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
  createdAtMs?: number;
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

// ── Scheduled Tasks UI types ──────────────────────────────────────────────────

/** Form data for the New / Edit Scheduled Task modal. */
export type ScheduledTaskFormData = {
  name: string;
  description?: string;
  /**
   * Schedule kind:
   * - "daily" / "weekly" / "monthly": shortcuts (map to cron)
   * - "every": repeat every N minutes/hours/days
   * - "one-time": run once at a specific date/time
   */
  scheduleKind: "daily" | "weekly" | "monthly" | "every" | "one-time";
  /** Preferred wall-clock time in "HH:mm" 24-hour format (used for daily/weekly/monthly). */
  preferredTime: string;
  /** Cron day-of-week (0=Sun … 6=Sat) for weekly schedules. */
  weeklyDayOfWeek: string;
  /** Day of month (1–31) for monthly schedules. */
  monthlyDayOfMonth: string;
  /** For scheduleKind=="every": amount of units (as string for input binding). */
  everyAmount: string;
  /** For scheduleKind=="every": time unit. */
  everyUnit: "minutes" | "hours" | "days";
  /** For scheduleKind=="one-time": datetime-local value e.g. "2026-04-15T09:00". */
  scheduleAt: string;
  /** Agent to run the task; empty uses gateway default agent. */
  agentId: string;
  /** Whether the job is enabled when saved. */
  enabled: boolean;
  sessionTarget: CronSessionTarget;
  wakeMode: CronWakeMode;
  /** Delivery mode. */
  deliveryMode: "none" | "announce" | "webhook";
  /**
   * Target channel for announce ("last" or channel id). "__auto__" = first configured.
   */
  deliveryChannel?: string;
  /** Announce: recipient id; Webhook: POST URL. */
  deliveryTo?: string;
  /** Optional channel account id for multi-account setups (announce). */
  deliveryAccountId?: string;
  /** Best-effort delivery when announce fails. */
  deliveryBestEffort: boolean;
  agentPrompt: string;
};

export type CronRunDeliveryStatus =
  | "delivered"
  | "not-delivered"
  | "unknown"
  | "not-requested";

export type CronRunUsage = {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  cache_read_tokens?: number;
  cache_write_tokens?: number;
};

/** A single run-history record from cron.runs. */
export type CronRunRecord = {
  id: string;
  jobId: string;
  jobName: string;
  status: "running" | "success" | "failed";
  /** Gateway run status when the run has finished. */
  runStatus?: "ok" | "error" | "skipped";
  /** Unix timestamp (ms) when the run finished. */
  executionTime: number;
  durationMs?: number;
  error?: string;
  /** Brief summary of the run result (assistant's last answer). */
  summary?: string;
  deliveryStatus?: CronRunDeliveryStatus;
  deliveryError?: string;
  model?: string;
  provider?: string;
  usage?: CronRunUsage;
  /** Scheduled run time (ms), when recorded separately from finish time. */
  runAtMs?: number;
  nextRunAtMs?: number;
  /** Session ID produced by this run (if available). */
  sessionId?: string;
  /** Session key produced by this run (if available). */
  sessionKey?: string;
};

export type CronRunHistoryResult = {
  records: CronRunRecord[];
  total: number;
};

// ── Channel recipients ────────────────────────────────────────────────────────

export type ChannelRecipientEntry = {
  channel: string;
  target: string;
  agentId: string;
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
  models?: {
    providers?: Record<
      string,
      {
        baseUrl?: string;
        apiKey?: unknown;
        auth?: string;
      }
    >;
  };
  tools?: {
    profile?: string;
    allow?: string[];
    alsoAllow?: string[];
    deny?: string[];
  };
};
