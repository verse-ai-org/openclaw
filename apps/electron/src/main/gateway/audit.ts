import fs from "node:fs";
import path from "node:path";
import { logAuditOk, logEvent } from "./logging.js";
import { resolveBundledExtensionsDir } from "./paths.js";

/**
 * 启动时扫描并报告 bundled extensions 的状态。
 * 帮助诊断"plugin not found"问题。
 */
export function auditBundledExtensions(): void {
  const extensionsDir = resolveBundledExtensionsDir();

  if (!fs.existsSync(extensionsDir)) {
    logEvent("audit-extensions", { status: "missing", path: extensionsDir }, "warn");
    return;
  }

  try {
    const entries = fs.readdirSync(extensionsDir, { withFileTypes: true });
    const extensions: Array<{
      id: string;
      hasManifest: boolean;
      hasPackageJson: boolean;
    }> = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      const id = entry.name;
      const extDir = path.join(extensionsDir, id);
      extensions.push({
        id,
        hasManifest: fs.existsSync(path.join(extDir, "openclaw.plugin.json")),
        hasPackageJson: fs.existsSync(path.join(extDir, "package.json")),
      });
    }

    const issues = extensions.filter((e) => !e.hasManifest || !e.hasPackageJson);
    if (issues.length > 0) {
      logEvent(
        "audit-extensions",
        {
          status: "issues",
          count: issues.length,
          ids: issues.map((e) => e.id).join(","),
        },
        "warn",
      );
    } else {
      logAuditOk("audit-extensions", `ok count=${extensions.length}`);
    }
  } catch (err) {
    logEvent("audit-extensions", { status: "error", error: String(err) }, "warn");
  }
}

/** 检查配置中引用的插件是否存在。 */
export function auditConfigPlugins(cfg: Record<string, unknown>): void {
  const plugins = cfg.plugins as Record<string, unknown> | undefined;
  if (!plugins) {
    logEvent("audit-config-plugins", { status: "no-plugins-section" });
    return;
  }

  const entries = (plugins.entries as Record<string, unknown>) ?? {};
  const entryIds = Object.keys(entries);

  if (entryIds.length === 0) {
    logEvent("audit-config-plugins", { status: "no-entries" });
    return;
  }

  const extensionsDir = resolveBundledExtensionsDir();
  const missing: string[] = [];
  const found: string[] = [];

  for (const id of entryIds) {
    const manifestPath = path.join(extensionsDir, id, "openclaw.plugin.json");
    if (fs.existsSync(manifestPath)) {
      found.push(id);
    } else {
      missing.push(id);
    }
  }

  if (missing.length > 0) {
    logEvent(
      "audit-config-plugins",
      {
        status: "missing",
        total: entryIds.length,
        found: found.length,
        missing: missing.join(","),
      },
      "warn",
    );
  } else {
    logAuditOk("audit-config-plugins", `ok total=${entryIds.length}`);
  }
}
