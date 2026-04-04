import {
  applyAgentConfig,
  findAgentEntryIndex,
} from "../commands/agents.config.js";
import type { OpenClawConfig } from "../config/config.js";
import type { ToolProfileId } from "../config/types.tools.js";
import { normalizeAgentId } from "../routing/session-key.js";
import { listAgentEntries } from "./agent-scope.js";
import { ensureAgentWorkspace } from "./workspace.js";

/**
 * Built-in agent definitions.
 *
 * - id: unique agent identifier (normalized to lowercase, no spaces)
 * - name: display name shown in the UI agent list
 * - workspace: workspace directory path (supports "~")
 * - templateSubdir: subdirectory under docs/reference/templates/ for agent-specific templates
 *
 * Order matters: the first entry that is not already the default agent will be
 * preceded by an implicit "main" entry when agents.list is empty. To avoid that,
 * "main" is listed first explicitly so the list always starts with main.
 */
type BuiltinAgentDef = {
  readonly id: string;
  readonly name?: string;
  readonly workspace?: string;
  readonly templateSubdir?: string;
  /** Default skill allowlist for first-time creation only. */
  readonly skills?: string[];
  /** Default tool restrictions for first-time creation only. */
  readonly tools?: {
    readonly profile?: ToolProfileId;
    readonly deny?: readonly string[];
  };
};

export const BUILTIN_AGENTS: ReadonlyArray<BuiltinAgentDef> = [
  {
    // main is always the default; no workspace/name override — uses agents.defaults.workspace
    id: "main",
  },
  {
    id: "travel-planner",
    name: "Travel Planner",
    workspace: "~/.openclaw/agents/travel-planner",
    templateSubdir: "agents/travel-planner",
    skills: ["travel-planner", "flyai", "amap-lbs-skill", "12306"],
    tools: { profile: "full", deny: ["browser"] },
  },
] as const;

/**
 * Idempotently ensure all built-in agents exist in the config and their
 * workspaces are initialized with template files.
 *
 * - Only writes config when at least one built-in agent is missing from agents.list.
 * - Skips agents whose id is already present in agents.list (preserves user edits).
 * - "main" never gets a workspace override here — it always uses agents.defaults.workspace.
 */
export async function ensureBuiltinAgents(
  cfg: OpenClawConfig,
  writeConfig: (cfg: OpenClawConfig) => Promise<void>,
): Promise<OpenClawConfig> {
  const existingList = listAgentEntries(cfg);
  const existingIds = new Set(existingList.map((e) => normalizeAgentId(e.id)));

  let next = cfg;
  let dirty = false;

  for (const builtin of BUILTIN_AGENTS) {
    const id = normalizeAgentId(builtin.id);
    if (existingIds.has(id)) {
      // Already present — check whether we need to initialize its workspace files.
      // For non-main agents, still ensure workspace bootstrap files exist even if
      // the config entry was already there (e.g. after an upgrade).
      if (builtin.workspace) {
        const entry = existingList[findAgentEntryIndex(existingList, id)];
        const workspaceDir = entry?.workspace ?? builtin.workspace;
        await ensureAgentWorkspace({
          dir: workspaceDir,
          ensureBootstrapFiles: true,
          templateSubdir: builtin.templateSubdir,
        });
      }
      continue;
    }

    // Write config entry for missing built-in agent.
    next = applyAgentConfig(next, {
      agentId: builtin.id,
      ...(builtin.name ? { name: builtin.name } : {}),
      ...(builtin.workspace ? { workspace: builtin.workspace } : {}),
      ...(builtin.skills ? { skills: builtin.skills } : {}),
      ...(builtin.tools ? { tools: { ...builtin.tools, deny: builtin.tools.deny ? [...builtin.tools.deny] : undefined } } : {}),
    });
    dirty = true;

    // Initialize workspace with template files (skip for main — it uses defaults.workspace).
    if (builtin.workspace) {
      await ensureAgentWorkspace({
        dir: builtin.workspace,
        ensureBootstrapFiles: true,
        templateSubdir: builtin.templateSubdir,
      });
    }
  }

  if (dirty) {
    await writeConfig(next);
  }

  return next;
}
