import {
  applyAgentConfig,
  findAgentEntryIndex,
} from "../commands/agents.config.js";
import type { OpenClawConfig } from "../config/config.js";
import type { IdentityConfig } from "../config/types.base.js";
import type { ToolProfileId } from "../config/types.tools.js";
import { normalizeAgentId } from "../routing/session-key.js";
import { listAgentEntries } from "./agent-scope.js";
import {
  DEFAULT_AGENT_WORKSPACE_DIR,
  ensureAgentWorkspace,
} from "./workspace.js";

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
  /**
   * Default identity for first-time creation, and backfilled on upgrade when
   * the existing config entry has no identity fields set.
   */
  readonly identity?: IdentityConfig;
};

export const BUILTIN_AGENTS: ReadonlyArray<BuiltinAgentDef> = [
  {
    // main is always the default; no workspace/name override — uses agents.defaults.workspace
    id: "main",
    name: "Your Assistant",
    templateSubdir: "agents/main",
    identity: {
      name: "Popeye",
      avatar: "https://files.aiverser.com/bossim/images/dog_front_1.0.webp",
      video:
        "https://files.aiverser.com/bossim/vedio/dog_kling_20260416_2901_0.mp4",
    },
  },
  {
    id: "travel-planner",
    name: "Travel Planner",
    workspace: "~/.openclaw/agents/travel-planner",
    templateSubdir: "agents/travel-planner",
    skills: [
      "travel-planner",
      "xiaohongshu",
      "flyai",
      "amap-lbs-skill",
      "12306",
      "weather",
      "openclaw-tool-ui",
      "openclaw-interactions"
    ],
    tools: { profile: "full", deny: [] },
    identity: {
      name: "Tom",
      emoji: "✈️",
      avatar: "https://files.aiverser.com/bossim/images/travel-planner.webp",
      video: "https://files.aiverser.com/bossim/vedio/cat_travel_planner.mp4",
      bio: 'Plan complete trips — flights, hotels, transport, and local activities in one go.\nReal-time search so you always get current availability and accurate pricing.\nDay-by-day itineraries tailored to your destination, pace, and interests.\n💬 Try: "Plan a 5-day trip to Shanghai in October, budget $2,000"',
    },
  },
  {
    id: "my-office-helper",
    name: "Office Helper",
    workspace: "~/.openclaw/agents/my-office-helper",
    templateSubdir: "agents/my-office-helper",
    skills: [
      "minimax-docx",
      "minimax-xlsx",
      "minimax-pdf",
      "html-ppt",
      "pptx-generator",
      "openclaw-tool-ui"
    ],
    tools: { profile: "full", deny: [] },
    identity: {
      name: "Felix",
      emoji: "💼",
      avatar: "https://files.aiverser.com/bossim/images/cat_office_2.0.webp",
      video: "https://files.aiverser.com/bossim/vedio/cat_office_2.0.mp4",
      bio: 'Create, edit, and convert Word, Excel, PowerPoint, and PDF files with a simple description.\nComplex formatting, formulas, slide layouts, and multi-page documents handled automatically.\nExport polished, ready-to-share files in the format you need.\n💬 Try: "Create a project proposal in Word with a budget table and a PPT summary deck"',
    },
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
  const arraysEqual = (a: readonly string[], b: readonly string[]) =>
    a.length === b.length && a.every((value, index) => value === b[index]);

  const existingList = listAgentEntries(cfg);
  const existingIds = new Set(existingList.map((e) => normalizeAgentId(e.id)));

  let next = cfg;
  let dirty = false;

  for (const builtin of BUILTIN_AGENTS) {
    const id = normalizeAgentId(builtin.id);
    if (existingIds.has(id)) {
      // Already present — backfill identity if the config entry has none set yet
      // (covers upgrades where the entry existed before identity was added).
      if (builtin.identity) {
        const entry = existingList[findAgentEntryIndex(existingList, id)];
        const noIdentity =
          !entry?.identity?.name &&
          !entry?.identity?.emoji &&
          !entry?.identity?.avatar;
        // Also backfill individual fields added in later releases (e.g. avatar, video, bio).
        const missingAvatar =
          builtin.identity.avatar && !entry?.identity?.avatar;
        const missingVideo = builtin.identity.video && !entry?.identity?.video;
        // For non-main built-in agents (travel-planner, my-office-helper), video/bio/name are
        // always overwritten to keep them in sync with the canonical built-in definition.
        // These fields are not user-editable for locked agents.
        const isMainAgent = id === "main";
        const missingName = builtin.identity.name && !entry?.identity?.name;
        const nameChanged =
          !isMainAgent &&
          builtin.identity.name &&
          entry?.identity?.name !== builtin.identity.name;
        const videoChanged =
          !isMainAgent &&
          builtin.identity.video &&
          entry?.identity?.video !== builtin.identity.video;
        const bioDiffers =
          !isMainAgent &&
          builtin.identity.bio &&
          entry?.identity?.bio !== builtin.identity.bio;
        const missingBio = builtin.identity.bio && !entry?.identity?.bio;
        if (
          noIdentity ||
          missingAvatar ||
          missingVideo ||
          missingName ||
          nameChanged ||
          videoChanged ||
          missingBio ||
          bioDiffers
        ) {
          next = applyAgentConfig(next, {
            agentId: id,
            identity: {
              // Preserve existing fields; only fill in what is missing or force-update locked fields.
              ...entry?.identity,
              ...(noIdentity
                ? builtin.identity
                : {
                    // name: backfill when missing for all; force-sync for locked built-ins.
                    ...(missingName || nameChanged
                      ? { name: builtin.identity.name }
                      : {}),
                    ...(missingAvatar
                      ? { avatar: builtin.identity.avatar }
                      : {}),
                    // For main: only backfill when missing. For locked built-ins: always sync.
                    ...(missingVideo || videoChanged
                      ? { video: builtin.identity.video }
                      : {}),
                    ...(missingBio || bioDiffers
                      ? { bio: builtin.identity.bio }
                      : {}),
                  }),
            },
          });
          dirty = true;
        }

        // Backfill the top-level name field when missing (used as subtitle in the agent list).
        if (builtin.name && !entry?.name) {
          next = applyAgentConfig(next, { agentId: id, name: builtin.name });
          dirty = true;
        }
      }
      // Keep locked built-in agent skills in sync with canonical definitions.
      // This upgrades users from legacy skill IDs (e.g. old office-helper skills)
      // to the latest built-in allowlist automatically.
      if (
        builtin.skills &&
        id !== "main" &&
        (id === "travel-planner" || id === "my-office-helper")
      ) {
        const entry = existingList[findAgentEntryIndex(existingList, id)];
        const currentSkills = (entry?.skills ?? []).filter(Boolean);
        if (!arraysEqual(currentSkills, builtin.skills)) {
          next = applyAgentConfig(next, { agentId: id, skills: [...builtin.skills] });
          dirty = true;
        }
      }
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
      } else if (id === "main") {
        // main has no explicit workspace — use agents.defaults.workspace or the global default.
        // Ensure bootstrap files (including IDENTITY.md) are written from the main template.
        const mainWorkspaceDir =
          cfg.agents?.defaults?.workspace?.trim() || DEFAULT_AGENT_WORKSPACE_DIR;
        await ensureAgentWorkspace({
          dir: mainWorkspaceDir,
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
      ...(builtin.tools
        ? {
            tools: {
              ...builtin.tools,
              deny: builtin.tools.deny ? [...builtin.tools.deny] : undefined,
            },
          }
        : {}),
      ...(builtin.identity ? { identity: builtin.identity } : {}),
    });
    dirty = true;

    // Initialize workspace with template files (skip for main — it uses defaults.workspace).
    if (builtin.workspace) {
      await ensureAgentWorkspace({
        dir: builtin.workspace,
        ensureBootstrapFiles: true,
        templateSubdir: builtin.templateSubdir,
      });
    } else if (id === "main") {
      const mainWorkspaceDir =
        cfg.agents?.defaults?.workspace?.trim() || DEFAULT_AGENT_WORKSPACE_DIR;
      await ensureAgentWorkspace({
        dir: mainWorkspaceDir,
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
