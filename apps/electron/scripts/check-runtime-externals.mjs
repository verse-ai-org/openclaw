#!/usr/bin/env node
/**
 * Verifies that all npm packages externalized by the tsdown dist bundle are
 * available in the Electron runtime (either listed in packaged-runtime.json
 * directly or installed as a transitive dependency of a listed package).
 *
 * Usage:
 *   node check-runtime-externals.mjs <distDir> <packagedRuntimeConfig> <repoRoot>
 *
 * Exits with code 1 if any gaps are found.
 */
import fs from "node:fs";
import module from "node:module";
import path from "node:path";

const distDir = process.argv[2];
const runtimeConfigPath = process.argv[3];
const repoRoot = process.argv[4];

if (!distDir || !runtimeConfigPath || !repoRoot) {
  console.error(
    "Usage: node check-runtime-externals.mjs <distDir> <packagedRuntimeConfig> <repoRoot>",
  );
  process.exit(1);
}

const NODE_BUILTINS = new Set(module.builtinModules.flatMap((m) => [m, `node:${m}`]));

const KNOWN_FALSE_POSITIVES = new Set([
  "openclaw",
  "vitest",
  "typescript",
  "prettier",
  "eslint",
  "vite",
]);

// UI-only packages bundled separately (control-ui-react, canvas-host) — not runtime gateway deps.
const UI_ONLY_PACKAGES = new Set([
  "@a2ui/markdown-it",
  "@emotion/is-prop-valid",
  "react",
  "react-dom",
  "react-router",
]);

// Valid npm package name: starts with letter/@, contains only valid chars
const VALID_PKG_NAME_RE = /^(@[a-z0-9][\w.-]*\/[a-z0-9][\w.-]*|[a-z0-9][\w.-]*)$/i;

function extractPackageName(specifier) {
  let pkg;
  if (specifier.startsWith("@")) {
    const parts = specifier.split("/");
    pkg = parts.length >= 2 ? `${parts[0]}/${parts[1]}` : null;
  } else {
    pkg = specifier.split("/")[0] || null;
  }
  if (!pkg || !VALID_PKG_NAME_RE.test(pkg)) return null;
  return pkg;
}

function collectDistExternals(distRoot) {
  const externals = new Map();
  const pending = [distRoot];

  while (pending.length > 0) {
    const dir = pending.pop();
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const entryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        pending.push(entryPath);
        continue;
      }
      if (!entry.name.endsWith(".js")) continue;

      const content = fs.readFileSync(entryPath, "utf8");
      const relativePath = path.relative(distRoot, entryPath);

      // Match require("pkg") and import ... from "pkg" patterns
      const requireRe = /require\s*\(\s*["']([^"'./][^"']*?)["']\s*\)/g;
      const importRe = /(?:import|export)\s+[\s\S]*?\s+from\s+["']([^"'./][^"']*?)["']/g;
      // Also match dynamic import("pkg")
      const dynamicImportRe = /import\s*\(\s*["']([^"'./][^"']*?)["']\s*\)/g;

      for (const re of [requireRe, importRe, dynamicImportRe]) {
        let match;
        while ((match = re.exec(content)) !== null) {
          const specifier = match[1];
          const pkg = extractPackageName(specifier);
          if (!pkg || NODE_BUILTINS.has(pkg) || NODE_BUILTINS.has(specifier)) continue;
          if (KNOWN_FALSE_POSITIVES.has(pkg)) continue;
          if (UI_ONLY_PACKAGES.has(pkg)) continue;
          if (!externals.has(pkg)) {
            externals.set(pkg, new Set());
          }
          externals.get(pkg).add(relativePath);
        }
      }
    }
  }
  return externals;
}

function loadRuntimePackageNames(configPath) {
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  const names = new Set([
    ...(config.coreRuntimeDependencies ?? []),
    ...(config.channelRuntimeDependencies ?? []),
    ...(config.providerRuntimeDependencies ?? []),
    ...(config.mediaRuntimeDependencies ?? []),
    ...(config.observabilityRuntimeDependencies ?? []),
    ...(config.extensionRuntimeDependencies ?? []),
    ...(config.nativeRuntimeDependencies ?? []),
    ...(config.runtimeDependencies ?? []),
  ]);
  const deferred = config.deferredDependencies ?? {};
  for (const value of Object.values(deferred)) {
    if (value && Array.isArray(value.packages)) {
      for (const pkg of value.packages) names.add(pkg);
    }
  }
  return names;
}

function readPackageJsonDirect(pkg, rootDir) {
  // Try direct filesystem path first (bypasses package.json "exports" restrictions)
  const directPath = path.join(rootDir, "node_modules", pkg, "package.json");
  if (fs.existsSync(directPath)) {
    return JSON.parse(fs.readFileSync(directPath, "utf8"));
  }
  // pnpm hoists to node_modules/.pnpm — try scope patterns
  const pnpmBase = path.join(rootDir, "node_modules", ".pnpm");
  if (!fs.existsSync(pnpmBase)) return null;
  const safeName = pkg.replace("/", "+");
  try {
    for (const entry of fs.readdirSync(pnpmBase)) {
      if (entry.startsWith(`${safeName}@`)) {
        const nested = path.join(pnpmBase, entry, "node_modules", pkg, "package.json");
        if (fs.existsSync(nested)) {
          return JSON.parse(fs.readFileSync(nested, "utf8"));
        }
      }
    }
  } catch {
    // ignore
  }
  return null;
}

function collectTransitiveDeps(directDeps, rootDir, maxDepth = 4) {
  const available = new Set(directDeps);
  const queue = [...directDeps];
  const visited = new Set();

  for (let depth = 0; depth < maxDepth && queue.length > 0; depth++) {
    const batch = queue.splice(0);
    for (const pkg of batch) {
      if (visited.has(pkg)) continue;
      visited.add(pkg);
      const pkgJson = readPackageJsonDirect(pkg, rootDir);
      if (!pkgJson) continue;
      const deps = {
        ...pkgJson.dependencies,
        ...pkgJson.optionalDependencies,
      };
      for (const dep of Object.keys(deps)) {
        available.add(dep);
        if (!visited.has(dep)) queue.push(dep);
      }
    }
  }
  return available;
}

function isResolvablePackage(pkg, rootDir) {
  // Check if package actually exists in the monorepo's node_modules
  const directPath = path.join(rootDir, "node_modules", pkg);
  if (fs.existsSync(directPath)) return true;
  try {
    const requireFromRoot = module.createRequire(path.join(rootDir, "package.json"));
    requireFromRoot.resolve(pkg);
    return true;
  } catch {
    return false;
  }
}

// Main
const distRoot = path.resolve(distDir);
if (!fs.existsSync(distRoot)) {
  console.error(`dist directory not found: ${distRoot}`);
  process.exit(1);
}

console.log(`Scanning ${distRoot} for external imports...`);
const externals = collectDistExternals(distRoot);
console.log(`Found ${externals.size} unique external package imports.`);

const directDeps = loadRuntimePackageNames(path.resolve(runtimeConfigPath));
console.log(`packaged-runtime.json lists ${directDeps.size} direct packages.`);

const availablePackages = collectTransitiveDeps(directDeps, path.resolve(repoRoot));
console.log(`Total available (with transitives): ${availablePackages.size} packages.`);

const rootDir = path.resolve(repoRoot);
const missing = [];
for (const [pkg, importers] of externals) {
  if (!availablePackages.has(pkg)) {
    // Only flag packages that actually exist in the monorepo's node_modules.
    // Unresolvable "packages" are regex false positives (JSDoc @import, comments, etc.)
    if (!isResolvablePackage(pkg, rootDir)) continue;
    missing.push({ pkg, importers: [...importers].slice(0, 3) });
  }
}

if (missing.length === 0) {
  console.log("\n✅ All dist externals are covered by packaged-runtime.json.");
  process.exit(0);
}

console.error(`\n❌ ${missing.length} external package(s) NOT covered by packaged-runtime.json:\n`);
for (const { pkg, importers } of missing.toSorted((a, b) => a.pkg.localeCompare(b.pkg))) {
  const files = importers.join(", ");
  console.error(`  ${pkg}  (imported by: ${files})`);
}
console.error(
  "\nFix: add missing packages to apps/electron/packaged-runtime.json in the appropriate tier.",
);
process.exit(1);
