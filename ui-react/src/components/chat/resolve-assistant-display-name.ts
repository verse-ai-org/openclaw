import { parseAgentIdFromSessionKey } from "@/lib/agent-starter-prompts";
import type { AgentsListResult } from "@/types/agents";

export function resolveAssistantDisplayName(
  sessionKey: string,
  agentsList: AgentsListResult | null | undefined,
): string {
  const defaultAgentId = agentsList?.defaultId ?? "main";
  const agentId = parseAgentIdFromSessionKey(sessionKey, defaultAgentId);
  const row = agentsList?.agents.find((a) => a.id === agentId);
  return row?.identity?.name ?? row?.name ?? agentId;
}

/** Safe segment for download filenames (no path separators). */
export function sanitizeExportFilenameSegment(name: string): string {
  const trimmed = name.trim() || "assistant";
  return trimmed.replace(/[/\\?%*:|"<>]/g, "-").replace(/\s+/g, "-");
}
