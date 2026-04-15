import {
  applyAgentConfig,
  findAgentEntryIndex,
} from "../commands/agents.config.js";
import type { OpenClawConfig } from "../config/config.js";
import type { IdentityConfig } from "../config/types.base.js";
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
    ],
    tools: { profile: "full", deny: [] },
    identity: {
      name: "Travel Planner",
      emoji: "✈️",
      avatar: "https://files.aiverser.com/bossim/images/travel-planner.webp",
      video:
        "https://files.aiverser.com/bossim/vedio/kling_20260331_%E4%BD%9C%E5%93%81_%E4%B8%80%E5%8F%AA%E6%A9%98%E8%89%B2%E8%99%8E%E6%96%91%E7%8C%AB_%E5%8D%A1%E5%85%B6_5614_0.mp4",
      bio: 'Plan complete trips — flights, hotels, transport, and local activities in one go.\nReal-time search so you always get current availability and accurate pricing.\nDay-by-day itineraries tailored to your destination, pace, and interests.\n💬 Try: "Plan a 5-day trip to Shanghai in October, budget $2,000"',
    },
  },
  {
    id: "my-office-helper",
    name: "Office Helper",
    workspace: "~/.openclaw/agents/my-office-helper",
    templateSubdir: "agents/my-office-helper",
    skills: [
      "word-docx",
      "excel-xlsx",
      "my-pdf",
      "office-document-specialist-suite",
    ],
    tools: { profile: "full", deny: [] },
    identity: {
      name: "Office Helper",
      emoji: "💼",
      avatar: "https://files.aiverser.com/bossim/images/office-helper.webp",
      video: "https://files.aiverser.com/bossim/vedio/cat_office.mp4",
      bio: 'Create, edit, and convert Word, Excel, and PDF files with a simple description.\nComplex formatting, formulas, and multi-page layouts handled automatically.\nExport polished, ready-to-share documents in any format you need.\n💬 Try: "Create a project proposal in Word with a budget table"',
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
        // bio is always overwritten to keep it in sync with the built-in definition
        // (it is not user-editable, so overwriting is safe and ensures updates propagate).
        const bioDiffers =
          builtin.identity.bio && entry?.identity?.bio !== builtin.identity.bio;
        const missingBio = builtin.identity.bio && !entry?.identity?.bio;
        if (
          noIdentity ||
          missingAvatar ||
          missingVideo ||
          missingBio ||
          bioDiffers
        ) {
          next = applyAgentConfig(next, {
            agentId: id,
            identity: {
              // Preserve existing fields; only fill in what is missing.
              ...entry?.identity,
              ...(noIdentity
                ? builtin.identity
                : {
                    ...(missingAvatar
                      ? { avatar: builtin.identity.avatar }
                      : {}),
                    ...(missingVideo ? { video: builtin.identity.video } : {}),
                    ...(missingBio || bioDiffers
                      ? { bio: builtin.identity.bio }
                      : {}),
                  }),
            },
          });
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
    }
  }

  if (dirty) {
    await writeConfig(next);
  }

  return next;
}
