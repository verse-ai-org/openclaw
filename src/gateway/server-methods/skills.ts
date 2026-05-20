import fs from "node:fs/promises";
import path from "node:path";
import {
  listAgentIds,
  resolveAgentWorkspaceDir,
  resolveDefaultAgentId,
} from "../../agents/agent-scope.js";
import { canExecRequestNode } from "../../agents/exec-defaults.js";
import { importSkill } from "../../agents/skills-import.js";
import {
  installSkillFromClawHub,
  searchSkillsFromClawHub,
  updateSkillsFromClawHub,
} from "../../agents/skills-clawhub.js";
import { installSkill } from "../../agents/skills-install.js";
import { removeSkill } from "../../agents/skills-remove.js";
import { buildWorkspaceSkillStatus } from "../../agents/skills-status.js";
import { loadWorkspaceSkillEntries, type SkillEntry } from "../../agents/skills.js";
import { bumpSkillsSnapshotVersion } from "../../agents/skills/refresh.js";
import { loadConfig } from "../../config/config.js";
import {
  SafeOpenError,
  readFileWithinRoot,
  writeFileWithinRoot,
} from "../../infra/fs-safe.js";
import { listAgentWorkspaceDirs } from "../../agents/workspace-dirs.js";
import { redactConfigObject } from "../../config/redact-snapshot.js";
import { fetchClawHubSkillDetail } from "../../infra/clawhub.js";
import { formatErrorMessage } from "../../infra/errors.js";
import { getRemoteSkillEligibility } from "../../infra/skills-remote.js";
import { normalizeAgentId } from "../../routing/session-key.js";
import { normalizeOptionalString } from "../../shared/string-coerce.js";
import {
  ErrorCodes,
  errorShape,
  formatValidationErrors,
  validateSkillsBinsParams,
  validateSkillsDetailParams,
  validateSkillsFileGetParams,
  validateSkillsFileSetParams,
  validateSkillsImportParams,
  validateSkillsRemoveParams,
  validateSkillsInstallParams,
  validateSkillsSearchParams,
  validateSkillsStatusParams,
  validateSkillsUpdateParams,
} from "../protocol/index.js";
import { updateSkillConfigEntry } from "./skills-config-mutations.js";
import { installUploadedSkillArchive, skillsUploadHandlers } from "./skills-upload.js";
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
        const trimmed = normalizeOptionalString(bin) ?? "";
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
  ...skillsUploadHandlers,
  "skills.status": ({ params, respond, context }) => {
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
    const cfg = context.getRuntimeConfig();
    const agentIdRaw = normalizeOptionalString(params?.agentId) ?? "";
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
      eligibility: {
        remote: getRemoteSkillEligibility({
          advertiseExecNode: canExecRequestNode({
            cfg,
            agentId,
          }),
        }),
      },
    });
    respond(true, report, undefined);
  },
  "skills.bins": ({ params, respond, context }) => {
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
    const cfg = context.getRuntimeConfig();
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
  "skills.search": async ({ params, respond }) => {
    if (!validateSkillsSearchParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid skills.search params: ${formatValidationErrors(validateSkillsSearchParams.errors)}`,
        ),
      );
      return;
    }
    try {
      const results = await searchSkillsFromClawHub({
        query: (params as { query?: string }).query,
        limit: (params as { limit?: number }).limit,
      });
      respond(true, { results }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, formatErrorMessage(err)));
    }
  },
  "skills.detail": async ({ params, respond }) => {
    if (!validateSkillsDetailParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid skills.detail params: ${formatValidationErrors(validateSkillsDetailParams.errors)}`,
        ),
      );
      return;
    }
    try {
      const detail = await fetchClawHubSkillDetail({
        slug: (params as { slug: string }).slug,
      });
      respond(true, detail, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, formatErrorMessage(err)));
    }
  },
  "skills.install": async ({ params, respond, context }) => {
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
    const cfg = context.getRuntimeConfig();
    const workspaceDirRaw = resolveAgentWorkspaceDir(cfg, resolveDefaultAgentId(cfg));
    if (params && typeof params === "object" && "source" in params && params.source === "clawhub") {
      const p = params as {
        source: "clawhub";
        slug: string;
        version?: string;
        force?: boolean;
      };
      const result = await installSkillFromClawHub({
        workspaceDir: workspaceDirRaw,
        slug: p.slug,
        version: p.version,
        force: Boolean(p.force),
      });
      respond(
        result.ok,
        result.ok
          ? {
              ok: true,
              message: `Installed ${result.slug}@${result.version}`,
              stdout: "",
              stderr: "",
              code: 0,
              slug: result.slug,
              version: result.version,
              targetDir: result.targetDir,
            }
          : result,
        result.ok ? undefined : errorShape(ErrorCodes.UNAVAILABLE, result.error),
      );
      return;
    }
    if (params && typeof params === "object" && "source" in params && params.source === "upload") {
      const p = params as {
        source: "upload";
        uploadId: string;
        slug: string;
        force?: boolean;
        sha256?: string;
        timeoutMs?: number;
      };
      const result = await installUploadedSkillArchive({
        uploadId: p.uploadId,
        slug: p.slug,
        force: Boolean(p.force),
        sha256: p.sha256,
        timeoutMs: p.timeoutMs,
        workspaceDir: workspaceDirRaw,
        context,
      });
      respond(
        result.ok,
        result,
        result.ok ? undefined : errorShape(result.errorCode, result.error),
      );
      return;
    }
    const p = params as {
      name: string;
      installId: string;
      dangerouslyForceUnsafeInstall?: boolean;
      timeoutMs?: number;
    };
    const result = await installSkill({
      workspaceDir: workspaceDirRaw,
      skillName: p.name,
      installId: p.installId,
      dangerouslyForceUnsafeInstall: p.dangerouslyForceUnsafeInstall,
      timeoutMs: p.timeoutMs,
      config: cfg,
    });
    respond(
      result.ok,
      result,
      result.ok ? undefined : errorShape(ErrorCodes.UNAVAILABLE, result.message),
    );
  },
  "skills.update": async ({ params, respond, context }) => {
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
    if (params && typeof params === "object" && "source" in params && params.source === "clawhub") {
      const p = params as {
        source: "clawhub";
        slug?: string;
        all?: boolean;
      };
      if (!p.slug && !p.all) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, 'clawhub skills.update requires "slug" or "all"'),
        );
        return;
      }
      if (p.slug && p.all) {
        respond(
          false,
          undefined,
          errorShape(
            ErrorCodes.INVALID_REQUEST,
            'clawhub skills.update accepts either "slug" or "all", not both',
          ),
        );
        return;
      }
      const cfg = context.getRuntimeConfig();
      const workspaceDir = resolveAgentWorkspaceDir(cfg, resolveDefaultAgentId(cfg));
      const results = await updateSkillsFromClawHub({
        workspaceDir,
        slug: p.slug,
      });
      const errors = results.filter((result) => !result.ok);
      respond(
        errors.length === 0,
        {
          ok: errors.length === 0,
          skillKey: p.slug ?? "*",
          config: {
            source: "clawhub",
            results,
          },
        },
        errors.length === 0
          ? undefined
          : errorShape(ErrorCodes.UNAVAILABLE, errors.map((result) => result.error).join("; ")),
      );
      return;
    }
    const p = params as {
      skillKey: string;
      enabled?: boolean;
      apiKey?: string;
      env?: Record<string, string>;
    };
    const updated = await updateSkillConfigEntry(p);
    respond(
      true,
      { ok: true, skillKey: p.skillKey, config: redactConfigObject(updated) },
      undefined,
    );
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
    const target = p.target ?? "managed";
    let skillsBaseDir: string | undefined;
    if (target === "workspace") {
      const workspaceDir = resolveAgentWorkspaceDir(cfg, resolveDefaultAgentId(cfg));
      if (workspaceDir) {
        skillsBaseDir = path.join(workspaceDir, "skills");
      }
    }
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
