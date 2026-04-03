import fs from "node:fs/promises";
import path from "node:path";
import {
  listAgentIds,
  resolveAgentWorkspaceDir,
  resolveDefaultAgentId,
} from "../../agents/agent-scope.js";
import { importSkill } from "../../agents/skills-import.js";
import { installSkill } from "../../agents/skills-install.js";
import { removeSkill } from "../../agents/skills-remove.js";
import { buildWorkspaceSkillStatus } from "../../agents/skills-status.js";
import { loadWorkspaceSkillEntries, type SkillEntry } from "../../agents/skills.js";
import { bumpSkillsSnapshotVersion } from "../../agents/skills/refresh.js";
import { listAgentWorkspaceDirs } from "../../agents/workspace-dirs.js";
import type { OpenClawConfig } from "../../config/config.js";
import { loadConfig, writeConfigFile } from "../../config/config.js";
import { getRemoteSkillEligibility } from "../../infra/skills-remote.js";
import {
  SafeOpenError,
  readFileWithinRoot,
  writeFileWithinRoot,
} from "../../infra/fs-safe.js";
import { normalizeAgentId } from "../../routing/session-key.js";
import { normalizeSecretInput } from "../../utils/normalize-secret-input.js";
import {
  ErrorCodes,
  errorShape,
  formatValidationErrors,
  validateSkillsBinsParams,
  validateSkillsFileGetParams,
  validateSkillsFileSetParams,
  validateSkillsImportParams,
  validateSkillsRemoveParams,
  validateSkillsInstallParams,
  validateSkillsStatusParams,
  validateSkillsUpdateParams,
} from "../protocol/index.js";
import type { GatewayRequestHandlers } from "./types.js";

function collectSkillBins(entries: SkillEntry[]): string[] {
  const bins = new Set<string>();
  for (const entry of entries) {
    const required = entry.metadata?.requires?.bins ?? [];
    const anyBins = entry.metadata?.requires?.anyBins ?? [];
    const install = entry.metadata?.install ?? [];
    for (const bin of required) {
      const trimmed = bin.trim();
      if (trimmed) {
        bins.add(trimmed);
      }
    }
    for (const bin of anyBins) {
      const trimmed = bin.trim();
      if (trimmed) {
        bins.add(trimmed);
      }
    }
    for (const spec of install) {
      const specBins = spec?.bins ?? [];
      for (const bin of specBins) {
        const trimmed = String(bin).trim();
        if (trimmed) {
          bins.add(trimmed);
        }
      }
    }
  }
  return [...bins].toSorted();
}

function resolveSkillStatusEntry(baseDir: string, source: string):
  | {
      baseDir: string;
      source: string;
      filePath: string;
    }
  | undefined {
  const cfg = loadConfig();
  const workspaceDir = resolveAgentWorkspaceDir(cfg, resolveDefaultAgentId(cfg));
  const report = buildWorkspaceSkillStatus(workspaceDir, {
    config: cfg,
    eligibility: { remote: getRemoteSkillEligibility() },
  });
  const entry = report.skills.find((skill) => skill.baseDir === baseDir && skill.source === source);
  if (!entry) {
    return undefined;
  }
  return { baseDir: entry.baseDir, source: entry.source, filePath: entry.filePath };
}

function isWritableSkillSource(source: string): boolean {
  return source === "openclaw-workspace" || source === "openclaw-managed";
}

export const skillsHandlers: GatewayRequestHandlers = {
  "skills.status": ({ params, respond }) => {
    if (!validateSkillsStatusParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid skills.status params: ${formatValidationErrors(validateSkillsStatusParams.errors)}`,
        ),
      );
      return;
    }
    const cfg = loadConfig();
    const agentIdRaw = typeof params?.agentId === "string" ? params.agentId.trim() : "";
    const agentId = agentIdRaw ? normalizeAgentId(agentIdRaw) : resolveDefaultAgentId(cfg);
    if (agentIdRaw) {
      const knownAgents = listAgentIds(cfg);
      if (!knownAgents.includes(agentId)) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, `unknown agent id "${agentIdRaw}"`),
        );
        return;
      }
    }
    const workspaceDir = resolveAgentWorkspaceDir(cfg, agentId);
    const report = buildWorkspaceSkillStatus(workspaceDir, {
      config: cfg,
      eligibility: { remote: getRemoteSkillEligibility() },
    });
    respond(true, report, undefined);
  },
  "skills.bins": ({ params, respond }) => {
    if (!validateSkillsBinsParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid skills.bins params: ${formatValidationErrors(validateSkillsBinsParams.errors)}`,
        ),
      );
      return;
    }
    const cfg = loadConfig();
    const workspaceDirs = listAgentWorkspaceDirs(cfg);
    const bins = new Set<string>();
    for (const workspaceDir of workspaceDirs) {
      const entries = loadWorkspaceSkillEntries(workspaceDir, { config: cfg });
      for (const bin of collectSkillBins(entries)) {
        bins.add(bin);
      }
    }
    respond(true, { bins: [...bins].toSorted() }, undefined);
  },
  "skills.file.get": async ({ params, respond }) => {
    if (!validateSkillsFileGetParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid skills.file.get params: ${formatValidationErrors(validateSkillsFileGetParams.errors)}`,
        ),
      );
      return;
    }
    const p = params as { baseDir: string; source: string };
    const entry = resolveSkillStatusEntry(p.baseDir, p.source);
    if (!entry) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "skill not found in current workspace"),
      );
      return;
    }

    const skillMdPath = path.join(entry.baseDir, "SKILL.md");
    const relativePath = path.relative(entry.baseDir, skillMdPath);
    try {
      const read = await readFileWithinRoot({
        rootDir: entry.baseDir,
        relativePath,
        rejectHardlinks: true,
      });
      respond(
        true,
        {
          baseDir: entry.baseDir,
          source: entry.source,
          file: {
            name: "SKILL.md",
            path: entry.filePath,
            size: read.stat.size,
            updatedAtMs: Math.floor(read.stat.mtimeMs),
            content: read.buffer.toString("utf-8"),
          },
        },
        undefined,
      );
    } catch (err) {
      if (err instanceof SafeOpenError && err.code === "not-found") {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "SKILL.md not found"),
        );
        return;
      }
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "unable to read SKILL.md safely"),
      );
    }
  },
  "skills.file.set": async ({ params, respond }) => {
    if (!validateSkillsFileSetParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid skills.file.set params: ${formatValidationErrors(validateSkillsFileSetParams.errors)}`,
        ),
      );
      return;
    }
    const p = params as { baseDir: string; source: string; content: string };
    const entry = resolveSkillStatusEntry(p.baseDir, p.source);
    if (!entry) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "skill not found in current workspace"),
      );
      return;
    }
    if (!isWritableSkillSource(entry.source)) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "this skill source is read-only"),
      );
      return;
    }

    const skillMdPath = path.join(entry.baseDir, "SKILL.md");
    const relativePath = path.relative(entry.baseDir, skillMdPath);
    try {
      await fs.mkdir(entry.baseDir, { recursive: true });
      await writeFileWithinRoot({
        rootDir: entry.baseDir,
        relativePath,
        data: p.content,
        encoding: "utf8",
      });
      const stat = await fs.stat(skillMdPath);
      respond(
        true,
        {
          ok: true,
          baseDir: entry.baseDir,
          source: entry.source,
          file: {
            name: "SKILL.md",
            path: entry.filePath,
            size: stat.size,
            updatedAtMs: Math.floor(stat.mtimeMs),
            content: p.content,
          },
        },
        undefined,
      );
    } catch {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "unable to write SKILL.md safely"),
      );
    }
  },
  "skills.install": async ({ params, respond }) => {
    if (!validateSkillsInstallParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid skills.install params: ${formatValidationErrors(validateSkillsInstallParams.errors)}`,
        ),
      );
      return;
    }
    const p = params as {
      name: string;
      installId: string;
      timeoutMs?: number;
    };
    const cfg = loadConfig();
    const workspaceDirRaw = resolveAgentWorkspaceDir(cfg, resolveDefaultAgentId(cfg));
    const result = await installSkill({
      workspaceDir: workspaceDirRaw,
      skillName: p.name,
      installId: p.installId,
      timeoutMs: p.timeoutMs,
      config: cfg,
    });
    respond(
      result.ok,
      result,
      result.ok ? undefined : errorShape(ErrorCodes.UNAVAILABLE, result.message),
    );
  },
  "skills.update": async ({ params, respond }) => {
    if (!validateSkillsUpdateParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid skills.update params: ${formatValidationErrors(validateSkillsUpdateParams.errors)}`,
        ),
      );
      return;
    }
    const p = params as {
      skillKey: string;
      enabled?: boolean;
      apiKey?: string;
      env?: Record<string, string>;
    };
    const cfg = loadConfig();
    const skills = cfg.skills ? { ...cfg.skills } : {};
    const entries = skills.entries ? { ...skills.entries } : {};
    const current = entries[p.skillKey] ? { ...entries[p.skillKey] } : {};
    if (typeof p.enabled === "boolean") {
      current.enabled = p.enabled;
    }
    if (typeof p.apiKey === "string") {
      const trimmed = normalizeSecretInput(p.apiKey);
      if (trimmed) {
        current.apiKey = trimmed;
      } else {
        delete current.apiKey;
      }
    }
    if (p.env && typeof p.env === "object") {
      const nextEnv = current.env ? { ...current.env } : {};
      for (const [key, value] of Object.entries(p.env)) {
        const trimmedKey = key.trim();
        if (!trimmedKey) {
          continue;
        }
        const trimmedVal = value.trim();
        if (!trimmedVal) {
          delete nextEnv[trimmedKey];
        } else {
          nextEnv[trimmedKey] = trimmedVal;
        }
      }
      current.env = nextEnv;
    }
    entries[p.skillKey] = current;
    skills.entries = entries;
    const nextConfig: OpenClawConfig = {
      ...cfg,
      skills,
    };
    await writeConfigFile(nextConfig);
    respond(true, { ok: true, skillKey: p.skillKey, config: current }, undefined);
  },
  "skills.import": async ({ params, respond }) => {
    if (!validateSkillsImportParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid skills.import params: ${formatValidationErrors(validateSkillsImportParams.errors)}`,
        ),
      );
      return;
    }
    const p = params as {
      kind: "url" | "upload";
      target?: "workspace" | "managed";
      url?: string;
      data?: string;
      filename?: string;
      skillName?: string;
      timeoutMs?: number;
    };
    const cfg = loadConfig();
    // target=managed (default): ~/.openclaw/skills/ — global, shared across all workspaces
    // target=workspace: <workspaceDir>/skills/  — project-scoped, highest priority for same-name skills
    const target = p.target ?? "managed";
    let skillsBaseDir: string | undefined;
    if (target === "workspace") {
      const workspaceDir = resolveAgentWorkspaceDir(cfg, resolveDefaultAgentId(cfg));
      if (workspaceDir) {
        skillsBaseDir = path.join(workspaceDir, "skills");
      }
    }
    // skillsBaseDir left undefined => importSkill falls back to managed dir
    const result = await importSkill({
      kind: p.kind,
      url: p.url,
      data: p.data,
      filename: p.filename,
      skillName: p.skillName,
      timeoutMs: p.timeoutMs,
      skillsBaseDir,
    });
    if (result.ok) {
      // Notify all sessions that skills have changed
      bumpSkillsSnapshotVersion({ reason: "manual" });
    }
    respond(
      result.ok,
      result,
      result.ok ? undefined : errorShape(ErrorCodes.UNAVAILABLE, result.message),
    );
  },
  "skills.remove": async ({ params, respond }) => {
    if (!validateSkillsRemoveParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid skills.remove params: ${formatValidationErrors(validateSkillsRemoveParams.errors)}`,
        ),
      );
      return;
    }
    const p = params as { baseDir: string; source: string };
    const result = await removeSkill({ baseDir: p.baseDir, source: p.source });
    if (result.ok) {
      bumpSkillsSnapshotVersion({ reason: "manual" });
    }
    respond(
      result.ok,
      result,
      result.ok ? undefined : errorShape(ErrorCodes.UNAVAILABLE, result.message),
    );
  },
};
