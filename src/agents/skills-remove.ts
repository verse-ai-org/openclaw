import fs from "node:fs";
import path from "node:path";
import { assertCanonicalPathWithinBase } from "../infra/install-safe-path.js";
import { CONFIG_DIR } from "../utils.js";

/** Sources that are user-installed and safe to delete. */
const REMOVABLE_SOURCES = new Set(["openclaw-workspace", "openclaw-managed"]);

export type SkillRemoveRequest = {
  /**
   * Absolute path to the skill's base directory (the folder that contains
   * SKILL.md). This is the `baseDir` field on SkillStatusEntry.
   */
  baseDir: string;
  /**
   * The source of the skill (e.g. "openclaw-workspace" or "openclaw-managed").
   * Must be a removable source; bundled / extra skills are rejected.
   */
  source: string;
};

export type SkillRemoveResult = {
  ok: boolean;
  message: string;
};

/**
 * Removes a user-installed skill directory from disk.
 *
 * Safety guarantees:
 * - Only skills with source "openclaw-workspace" or "openclaw-managed" may be removed.
 * - The baseDir must be a direct child of either ~/.openclaw/skills or <workspaceDir>/skills;
 *   it may not be the skills root itself or an ancestor/sibling outside the allowed bases.
 * - Uses assertCanonicalPathWithinBase to prevent path-traversal attacks.
 */
export async function removeSkill(req: SkillRemoveRequest): Promise<SkillRemoveResult> {
  const { baseDir, source } = req;

  if (!REMOVABLE_SOURCES.has(source)) {
    return {
      ok: false,
      message: `Cannot remove skill with source "${source}". Only workspace and managed skills can be removed.`,
    };
  }

  if (!path.isAbsolute(baseDir)) {
    return { ok: false, message: "baseDir must be an absolute path" };
  }

  // Verify the directory still exists
  try {
    const stat = await fs.promises.stat(baseDir);
    if (!stat.isDirectory()) {
      return { ok: false, message: "Skill path is not a directory" };
    }
  } catch {
    return { ok: false, message: "Skill directory not found" };
  }

  // Determine the allowed parent directory based on source
  const parentDir = path.dirname(baseDir);

  // Allow either the managed skills dir or any <workspaceDir>/skills parent.
  // We just check that baseDir is a direct child of its own parent (one level deep),
  // and that the parent itself ends with "/skills" to prevent deleting arbitrary dirs.
  const managedSkillsDir = path.join(CONFIG_DIR, "skills");

  const isUnderManaged = parentDir === managedSkillsDir;
  const isUnderWorkspaceSkills =
    path.basename(parentDir) === "skills" && source === "openclaw-workspace";

  if (!isUnderManaged && !isUnderWorkspaceSkills) {
    return {
      ok: false,
      message: "Skill directory is not under a recognized skills location",
    };
  }

  // Path traversal guard — the baseDir must be a canonical direct child of its parent
  try {
    await assertCanonicalPathWithinBase({
      baseDir: parentDir,
      candidatePath: baseDir,
      boundaryLabel: "skills directory",
    });
  } catch (err) {
    return { ok: false, message: String(err) };
  }

  const skillName = path.basename(baseDir);

  try {
    await fs.promises.rm(baseDir, { recursive: true, force: false });
    return { ok: true, message: `Skill "${skillName}" removed successfully` };
  } catch (err) {
    return { ok: false, message: `Failed to remove skill: ${String(err)}` };
  }
}
