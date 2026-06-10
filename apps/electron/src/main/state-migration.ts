import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  BOSSIM_STATE_DIR,
  isUsingOpenclawState,
  legacyOpenclawStateDir,
} from "./bossim-state.js";
import { DEFAULT_GATEWAY_PORT_BOSSIM } from "./gateway/constants.js";

/**
 * On first launch, if the user has CLI `~/.openclaw/` data but no `~/.bossim/`,
 * copy a curated subset over so Bossim picks up the same config / API keys /
 * agent history. The CLI directory is left untouched so `openclaw` keeps
 * working alongside Bossim.
 *
 * Skipped entirely when:
 *  - `BOSSIM_USE_OPENCLAW_STATE=1` (escape hatch — same dir intentionally).
 *  - `~/.bossim/` already exists (not a fresh install).
 *  - `~/.openclaw/` does not exist (nothing to migrate).
 *
 * After copying we rewrite a couple of config fields so the new install
 * routes its Gateway to the Bossim default port and points the default
 * agent workspace at the new location.
 */

const MARKER_FILE = ".migrated-from-openclaw";

/** Things we copy. Everything else (caches, logs, npm) stays in `.openclaw`. */
const WHITELIST: readonly string[] = [
  // Single-file state
  "openclaw.json",
  "openclaw.json.last-good",
  "openclaw.json.bak",
  "gateway-instance-id",
  "exec-approvals.json",
  "update-check.json",
  // Long-lived state directories
  "agents",
  "credentials",
  "workspace",
  "skills",
  "plugin-skills",
  "identity",
  "devices",
  "service-env",
  "memory",
  "flows",
  "tasks",
  "cron",
  "delivery-queue",
  "session-delivery-queue",
];

/** Single files matched by prefix (e.g. rolling backups `openclaw.json.bak.1`). */
const WHITELIST_PREFIXES: readonly string[] = ["openclaw.json.bak."];

/** Only copy `installs.json` out of `plugins/`; leave heavy cache subdirs alone. */
const PLUGIN_FILES_TO_COPY: readonly string[] = ["installs.json"];

export type MigrationResult = {
  status: "skipped" | "migrated" | "failed";
  reason?: string;
  copiedEntries?: number;
  source?: string;
  target?: string;
};

/**
 * Idempotent entry point — call once near the top of main().
 *
 * Logging goes through `console.warn` only on failure; the very early
 * call site predates the structured logger.
 */
export function maybeMigrateOpenclawToBossim(
  env: NodeJS.ProcessEnv = process.env,
  homedir: () => string = os.homedir,
): MigrationResult {
  if (isUsingOpenclawState(env)) {
    return { status: "skipped", reason: "escape-hatch" };
  }
  const target = BOSSIM_STATE_DIR;
  const source = legacyOpenclawStateDir(homedir);
  if (path.resolve(source) === path.resolve(target)) {
    return { status: "skipped", reason: "same-dir" };
  }
  if (fs.existsSync(target)) {
    return { status: "skipped", reason: "target-exists", target };
  }
  if (!fs.existsSync(source)) {
    return { status: "skipped", reason: "no-source", source };
  }
  return runMigration({ source, target });
}

export function runMigration(params: {
  source: string;
  target: string;
}): MigrationResult {
  const { source, target } = params;
  try {
    fs.mkdirSync(target, { recursive: true });
    let copiedEntries = 0;
    for (const name of listSourceEntries(source)) {
      const from = path.join(source, name);
      const to = path.join(target, name);
      if (name === "plugins") {
        copiedEntries += copyPluginsDir(from, to);
        continue;
      }
      if (!fs.existsSync(from)) {
        continue;
      }
      copyAny(from, to);
      copiedEntries += 1;
    }

    rewriteBossimConfig(target);
    writeMigrationMarker(target, source, copiedEntries);
    return {
      status: "migrated",
      copiedEntries,
      source,
      target,
    };
  } catch (err) {
    console.warn(
      `[state-migration] failed to migrate ${source} → ${target}: ${String(err)}`,
    );
    return { status: "failed", reason: String(err), source, target };
  }
}

function listSourceEntries(source: string): string[] {
  const present = new Set<string>();
  try {
    for (const entry of fs.readdirSync(source)) {
      present.add(entry);
    }
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const name of WHITELIST) {
    if (present.has(name)) {
      out.push(name);
    }
  }
  // Pull in `plugins` only if present — handled specially.
  if (present.has("plugins") && !out.includes("plugins")) {
    out.push("plugins");
  }
  for (const name of present) {
    if (WHITELIST_PREFIXES.some((prefix) => name.startsWith(prefix))) {
      out.push(name);
    }
  }
  return out;
}

function copyPluginsDir(from: string, to: string): number {
  if (!fs.existsSync(from)) {
    return 0;
  }
  fs.mkdirSync(to, { recursive: true });
  let copied = 0;
  for (const name of PLUGIN_FILES_TO_COPY) {
    const src = path.join(from, name);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(to, name));
      copied += 1;
    }
  }
  return copied;
}

function copyAny(from: string, to: string): void {
  const stat = fs.lstatSync(from);
  if (stat.isDirectory()) {
    fs.cpSync(from, to, { recursive: true, force: true });
  } else if (stat.isSymbolicLink()) {
    // Materialize symlinks at copy time so the new dir is fully self-contained.
    const target = fs.readlinkSync(from);
    try {
      const resolved = path.isAbsolute(target) ? target : path.resolve(path.dirname(from), target);
      if (fs.existsSync(resolved)) {
        const st = fs.statSync(resolved);
        if (st.isDirectory()) {
          fs.cpSync(resolved, to, { recursive: true });
        } else {
          fs.copyFileSync(resolved, to);
        }
        return;
      }
    } catch {
      // fall through to copyFile of the link itself
    }
    fs.copyFileSync(from, to);
  } else {
    fs.copyFileSync(from, to);
  }
}

/**
 * After copying, touch up a couple of config fields so the migrated install
 * picks the Bossim defaults (port 18790, workspace under `.bossim`) without
 * silently inheriting CLI-specific values.
 */
function rewriteBossimConfig(target: string): void {
  const cfgPath = path.join(target, "openclaw.json");
  if (!fs.existsSync(cfgPath)) {
    return;
  }
  let raw: string;
  try {
    raw = fs.readFileSync(cfgPath, "utf8");
  } catch {
    return;
  }
  let cfg: Record<string, unknown>;
  try {
    cfg = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return;
  }

  let dirty = false;

  // 1. Bump gateway.port → Bossim default if it still points at the CLI 18789.
  const gw = (cfg.gateway ?? {}) as Record<string, unknown>;
  if (gw.port === 18789) {
    gw.port = DEFAULT_GATEWAY_PORT_BOSSIM;
    cfg.gateway = gw;
    dirty = true;
  }

  // 2. Drop stale controlUi.allowedOrigins — they reference dead static ports
  // from the prior Electron install and will get rebuilt by patchConfigForElectron.
  const controlUi = (gw.controlUi ?? {}) as Record<string, unknown>;
  if (Array.isArray(controlUi.allowedOrigins)) {
    delete controlUi.allowedOrigins;
    if (Object.keys(controlUi).length === 0) {
      const { controlUi: _drop, ...rest } = gw;
      cfg.gateway = rest;
    } else {
      gw.controlUi = controlUi;
      cfg.gateway = gw;
    }
    dirty = true;
  }

  // 3. Repoint default agent workspace from ~/.openclaw/workspace → ~/.bossim/workspace.
  const agents = (cfg.agents ?? {}) as Record<string, unknown>;
  const defaults = (agents.defaults ?? {}) as Record<string, unknown>;
  if (
    typeof defaults.workspace === "string" &&
    defaults.workspace === "~/.openclaw/workspace"
  ) {
    defaults.workspace = "~/.bossim/workspace";
    agents.defaults = defaults;
    cfg.agents = agents;
    dirty = true;
  }

  if (dirty) {
    fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2), "utf8");
  }
}

function writeMigrationMarker(
  target: string,
  source: string,
  copiedEntries: number,
): void {
  const payload = {
    migratedAt: new Date().toISOString(),
    source,
    copiedEntries,
  };
  try {
    fs.writeFileSync(
      path.join(target, MARKER_FILE),
      JSON.stringify(payload, null, 2),
      "utf8",
    );
  } catch {
    // best-effort marker
  }
}

export const __test = {
  MARKER_FILE,
  WHITELIST,
  WHITELIST_PREFIXES,
  PLUGIN_FILES_TO_COPY,
  rewriteBossimConfig,
};
