/**
 * Plugin-related types for the React UI.
 * Mirrors PluginRecord from src/plugins/registry.ts.
 */

export type PluginConfigUiHint = {
  label?: string;
  help?: string;
  tags?: string[];
  advanced?: boolean;
  sensitive?: boolean;
  placeholder?: string;
};

export type PluginRecord = {
  id: string;
  name: string;
  version?: string;
  description?: string;
  kind?: string;
  source: string;
  origin: string;
  workspaceDir?: string;
  enabled: boolean;
  status: "loaded" | "disabled" | "error";
  error?: string;
  toolNames: string[];
  hookNames: string[];
  channelIds: string[];
  providerIds: string[];
  /** Populated by plugins.status from gatewayMethodDescriptors; may be absent on stale payloads. */
  gatewayMethods?: string[];
  cliCommands: string[];
  services: string[];
  commands: string[];
  httpRoutes: number;
  hookCount: number;
  configSchema: boolean;
  configUiHints?: Record<string, PluginConfigUiHint>;
  configJsonSchema?: Record<string, unknown>;
};

export type PluginDiagnostic = {
  level: "warn" | "error";
  message: string;
  pluginId?: string;
  source?: string;
};

export type PluginsStatusResult = {
  plugins: PluginRecord[];
  workspaceDir?: string;
  diagnostics?: PluginDiagnostic[];
};

export type PluginsEnableResult = {
  pluginId: string;
  enabled: boolean;
  reason?: string;
};

export type PluginsInstallResult = {
  ok: boolean;
  pluginId?: string;
  version?: string;
  error?: string;
  code?: string;
};
