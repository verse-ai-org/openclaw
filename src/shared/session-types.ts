export type GatewayAgentIdentity = {
  name?: string;
  theme?: string;
  emoji?: string;
  avatar?: string;
  avatarUrl?: string;
  /** Showcase video URL. Optional — forwarded from IdentityConfig.video. */
  video?: string;
  /** Short bio shown in agent detail UI. */
  bio?: string;
};

export type GatewayAgentModel = {
  primary?: string;
  fallbacks?: string[];
};

export type GatewayAgentRuntime = {
  id: string;
  fallback?: "pi" | "none";
  source: "env" | "agent" | "defaults" | "model" | "provider" | "implicit" | "session-key";
};

export type GatewayAgentRow = {
  id: string;
  name?: string;
  identity?: GatewayAgentIdentity;
  skills?: string[];
  workspace?: string;
  model?: GatewayAgentModel;
  agentRuntime?: GatewayAgentRuntime;
};

export type SessionsListResultBase<TDefaults, TRow> = {
  ts: number;
  path: string;
  count: number;
  totalCount?: number;
  limitApplied?: number;
  hasMore?: boolean;
  defaults: TDefaults;
  sessions: TRow[];
};

export type SessionsPatchResultBase<TEntry> = {
  ok: true;
  path: string;
  key: string;
  entry: TEntry;
};
