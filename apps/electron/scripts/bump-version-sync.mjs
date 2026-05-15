/**
 * Sync semver across repo root `package.json` (openclaw core) and
 * `apps/electron/package.json` (electron-builder / auto-update).
 * Invoked from apps/electron/Makefile `version`.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const next = process.argv[2]?.trim();
if (!next) {
  console.error("usage: bump-version-sync.mjs <version>");
  process.exit(1);
}

const here = path.dirname(fileURLToPath(import.meta.url));
const electronDir = path.dirname(here);
const rootDir = path.join(electronDir, "..", "..");

const targets = [
  { file: path.join(electronDir, "package.json"), label: "apps/electron" },
  { file: path.join(rootDir, "package.json"), label: "root (openclaw)" },
];

for (const { file, label } of targets) {
  const pkg = JSON.parse(fs.readFileSync(file, "utf8"));
  const prev = pkg.version;
  pkg.version = next;
  fs.writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`);
  console.log(`✅ ${label}: ${prev} -> ${pkg.version}`);
}
