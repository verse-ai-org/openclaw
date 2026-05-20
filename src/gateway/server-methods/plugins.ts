import { loadConfig, writeConfigFile } from "../../config/config.js";
import { enablePluginInConfig } from "../../plugins/enable.js";
import { setPluginEnabledInConfig } from "../../plugins/toggle-config.js";
import { installPluginFromNpmSpec, installPluginFromPath } from "../../plugins/install.js";
import { buildPluginStatusReport, enrichPluginsForStatusApi } from "../../plugins/status.js";
import {
  ErrorCodes,
  errorShape,
  formatValidationErrors,
  validatePluginsEnableParams,
  validatePluginsInstallParams,
  validatePluginsStatusParams,
} from "../protocol/index.js";
import type { GatewayRequestHandlers } from "./types.js";

export const pluginsHandlers: GatewayRequestHandlers = {
  // ── plugins.status ─────────────────────────────────────────────────────────
  "plugins.status": ({ params, respond }) => {
    if (!validatePluginsStatusParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid plugins.status params: ${formatValidationErrors(validatePluginsStatusParams.errors)}`,
        ),
      );
      return;
    }
    try {
      const report = buildPluginStatusReport();
      respond(true, {
        plugins: enrichPluginsForStatusApi(report),
        workspaceDir: report.workspaceDir,
        diagnostics: report.diagnostics,
      });
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  // ── plugins.enable ─────────────────────────────────────────────────────────
  "plugins.enable": async ({ params, respond }) => {
    if (!validatePluginsEnableParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid plugins.enable params: ${formatValidationErrors(validatePluginsEnableParams.errors)}`,
        ),
      );
      return;
    }
    const { pluginId, enabled } = params as { pluginId: string; enabled: boolean };
    try {
      const cfg = loadConfig();
      let nextCfg: import("../../config/config.js").OpenClawConfig;
      let actualEnabled: boolean;
      let reason: string | undefined;
      if (enabled) {
        const result = enablePluginInConfig(cfg, pluginId);
        nextCfg = result.config;
        actualEnabled = result.enabled;
        reason = result.reason;
      } else {
        nextCfg = setPluginEnabledInConfig(cfg, pluginId, false);
        actualEnabled = false;
      }
      await writeConfigFile(nextCfg);
      respond(true, { pluginId, enabled: actualEnabled, reason });
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  // ── plugins.install ────────────────────────────────────────────────────────
  "plugins.install": async ({ params, respond }) => {
    if (!validatePluginsInstallParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid plugins.install params: ${formatValidationErrors(validatePluginsInstallParams.errors)}`,
        ),
      );
      return;
    }
    const { spec } = params as { spec: string };
    try {
      // Path installs start with . / ~; everything else is treated as an npm spec.
      const isPath = spec.startsWith(".") || spec.startsWith("/") || spec.startsWith("~");
      const result = isPath
        ? await installPluginFromPath({ path: spec })
        : await installPluginFromNpmSpec({ spec });
      if (result.ok) {
        respond(true, { ok: true, pluginId: result.pluginId, version: result.version });
      } else {
        respond(true, { ok: false, error: result.error, code: result.code });
      }
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },
};
