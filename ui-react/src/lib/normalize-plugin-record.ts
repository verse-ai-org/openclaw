import type { PluginRecord } from "@/types/plugins";

/** Gateway plugins.status may omit array fields on older or slim plugin rows. */
export function normalizePluginRecord(plugin: PluginRecord): PluginRecord {
  return {
    ...plugin,
    toolNames: plugin.toolNames ?? [],
    hookNames: plugin.hookNames ?? [],
    channelIds: plugin.channelIds ?? [],
    providerIds: plugin.providerIds ?? [],
    gatewayMethods: plugin.gatewayMethods ?? [],
    cliCommands: plugin.cliCommands ?? [],
    services: plugin.services ?? [],
    commands: plugin.commands ?? [],
    httpRoutes: plugin.httpRoutes ?? 0,
    hookCount: plugin.hookCount ?? 0,
    configSchema: plugin.configSchema ?? false,
  };
}
