#!/usr/bin/env node
/**
 * beforeBuild hook: skip electron-builder pnpm/npm dependency tree collection.
 *
 * OpenClaw Electron ships gateway runtime deps via extraResources (prod-node_modules)
 * and bundles main/preload with tsdown. Letting electron-builder walk the pnpm
 * workspace with `pnpm list --depth Infinity` can hit macOS EMFILE on large trees.
 */
exports.default = async function beforeBuild() {
  return false;
};
