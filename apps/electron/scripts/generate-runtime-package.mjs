#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const packagedRuntimeConfigPath = process.argv[2];
const rootPackagePath = process.argv[3];
const outputDir = process.argv[4];
const rootDir = process.argv[5];

if (!packagedRuntimeConfigPath || !rootPackagePath || !outputDir || !rootDir) {
  console.error(
    "Usage: node generate-runtime-package.mjs <packagedRuntimeConfigPath> <rootPackagePath> <outputDir> <rootDir>",
  );
  process.exit(1);
}

const packagedRuntimeConfig = JSON.parse(fs.readFileSync(packagedRuntimeConfigPath, "utf8"));
const names = new Set([
  ...(packagedRuntimeConfig.coreRuntimeDependencies ?? []),
  ...(packagedRuntimeConfig.runtimeDependencies ?? []),
]);

const rootPkg = JSON.parse(fs.readFileSync(rootPackagePath, "utf8"));
const requireFromRoot = createRequire(path.join(rootDir, "package.json"));
const manifestVersionMap = {
  ...(rootPkg.dependencies ?? {}),
  ...(rootPkg.peerDependencies ?? {}),
  ...(rootPkg.devDependencies ?? {}),
};

function resolveInstalledVersion(name) {
  try {
    const manifestPath = requireFromRoot.resolve(`${name}/package.json`);
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    return manifest.version ? `${manifest.version}` : null;
  } catch {
    return null;
  }
}

function resolveVersionFromLockfile(name) {
  try {
    const yaml = requireFromRoot("yaml");
    const lockfilePath = path.join(rootDir, "pnpm-lock.yaml");
    const lockfile = yaml.parse(fs.readFileSync(lockfilePath, "utf8"));

    const importers = lockfile?.importers ?? {};
    for (const importer of Object.values(importers)) {
      const sections = [
        importer?.dependencies ?? {},
        importer?.optionalDependencies ?? {},
        importer?.devDependencies ?? {},
      ];

      for (const section of sections) {
        const entry = section?.[name];
        const version = entry?.version ?? entry?.specifier;
        if (typeof version === "string" && version.length > 0) {
          const match = version.match(/^([^()]+)/);
          return match?.[1] ?? version;
        }
      }
    }

    const packages = lockfile?.packages ?? {};
    for (const key of Object.keys(packages)) {
      if (key === name) {
        const pkg = packages[key];
        if (pkg?.version) {
          return `${pkg.version}`;
        }
      }

      if (key.startsWith(`${name}@`)) {
        const suffix = key.slice(name.length + 1);
        const match = suffix.match(/^([^()]+)/);
        if (match?.[1]) {
          return match[1];
        }
      }
    }

    return null;
  } catch {
    return null;
  }
}

const resolvedEntries = [...names].map((name) => {
  const spec =
    manifestVersionMap[name] ??
    resolveInstalledVersion(name) ??
    resolveVersionFromLockfile(name);
  return [name, spec];
});

const missing = resolvedEntries.filter(([, spec]) => !spec).map(([name]) => name);
if (missing.length > 0) {
  console.error(
    `Missing runtime dependency versions from package.json, installed node_modules, and pnpm-lock.yaml: ${missing.join(", ")}`,
  );
  process.exit(1);
}

const electronPnpmOverrides = packagedRuntimeConfig.electronPnpmOverrides ?? {};
const pkg = {
  name: "openclaw-electron-runtime",
  private: true,
  type: "module",
  dependencies: Object.fromEntries(resolvedEntries),
  ...(Object.keys(electronPnpmOverrides).length > 0
    ? { pnpm: { overrides: electronPnpmOverrides } }
    : {}),
};

fs.writeFileSync(path.join(outputDir, "package.json"), `${JSON.stringify(pkg, null, 2)}\n`, "utf8");
