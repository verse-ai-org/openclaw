#!/usr/bin/env node
/**
 * afterPack hook: runs after electron-builder places files but before code signing.
 *
 * 1. Patch Windows exe icon/metadata (replaces signAndEditExecutable).
 * 2. Create a `node` shim in Resources/node/ so that skills declaring
 *    `requires.bins: [node]` pass the eligibility check inside the
 *    packaged Gateway subprocess (which runs via ELECTRON_RUN_AS_NODE=1).
 */
const fs = require("node:fs");
const path = require("node:path");

/** @param {import("app-builder-lib").AfterPackContext} context */
exports.default = async function afterPack(context) {
  await ensureNodeShim(context);
  await patchWinExeIcon(context);
};

// ---------------------------------------------------------------------------
// Node shim: make `node` discoverable on PATH inside the packaged app.
//
// gateway/paths.ts appends `Resources/node/` to the subprocess PATH. By placing
// a hardlink/copy (macOS/Windows) or symlink (Linux) of the Electron binary there,
// `hasBinary("node")` succeeds and skills with `requires.bins: [node]`
// are no longer silently filtered out.
// ---------------------------------------------------------------------------

/** @param {string} shimPath @param {string} targetPath @param {string} label */
function installNodeShim(shimPath, targetPath, label) {
  fs.mkdirSync(path.dirname(shimPath), { recursive: true });
  if (fs.existsSync(shimPath)) {
    fs.rmSync(shimPath, { force: true });
  }

  try {
    fs.linkSync(targetPath, shimPath);
    console.log(`🔗 Created ${label} hardlink: ${shimPath}`);
    return;
  } catch {
    // Hardlink failed (cross-device or quota); copy is codesign-safe but larger.
  }

  fs.copyFileSync(targetPath, shimPath);
  console.log(`📋 Copied ${label} shim: ${shimPath}`);
}

/** @param {import("app-builder-lib").AfterPackContext} context */
async function ensureNodeShim(context) {
  const platform = context.electronPlatformName;
  const appOutDir = context.appOutDir;
  const appName = context.packager.appInfo.productFilename;

  if (platform === "darwin") {
    // macOS: hardlink/copy Helper binary — symlinks into Frameworks break codesign --strict.
    const contentsDir = path.join(appOutDir, `${appName}.app`, "Contents");
    const shimPath = path.join(contentsDir, "Resources", "node", "node");
    const helperBin = path.join(
      contentsDir,
      "Frameworks",
      `${appName} Helper.app`,
      "Contents",
      "MacOS",
      `${appName} Helper`,
    );
    const target = fs.existsSync(helperBin)
      ? helperBin
      : path.join(contentsDir, "MacOS", appName);
    installNodeShim(shimPath, target, "node");
    return;
  }

  if (platform === "win32") {
    const shimPath = path.join(appOutDir, "resources", "node", "node.exe");
    const target = path.join(appOutDir, `${appName}.exe`);
    installNodeShim(shimPath, target, "node.exe");
    return;
  }

  // Linux: relative symlink to main binary
  const nodeDir = path.join(appOutDir, "resources", "node");
  const shimPath = path.join(nodeDir, "node");
  const target = path.relative(nodeDir, path.join(appOutDir, appName));
  fs.mkdirSync(nodeDir, { recursive: true });
  if (fs.existsSync(shimPath)) {
    fs.rmSync(shimPath, { force: true });
  }
  fs.symlinkSync(target, shimPath);
  console.log(`🔗 Created node symlink: ${shimPath} → ${target}`);
}

// ---------------------------------------------------------------------------
// Windows exe icon/metadata patch (moved from patch-win-exe-icon.cjs)
// ---------------------------------------------------------------------------

/** @param {import("app-builder-lib").AfterPackContext} context */
async function patchWinExeIcon(context) {
  if (context.electronPlatformName !== "win32") {
    return;
  }

  const rcedit = require("rcedit");
  const packager = context.packager;
  const exeName = `${packager.appInfo.productFilename}.exe`;
  const exePath = path.join(context.appOutDir, exeName);
  const iconPath = path.join(packager.buildResourcesDir, "icon.ico");
  const version = packager.appInfo.version;
  const productName = packager.appInfo.productName;
  const copyright = packager.config.copyright ?? "";

  console.log(`🎨 Patching Windows exe icon: ${exePath}`);

  await rcedit(exePath, {
    icon: iconPath,
    "product-version": version,
    "file-version": version,
    "version-string": {
      ProductName: productName,
      FileDescription: productName,
      CompanyName: productName,
      LegalCopyright: copyright,
      InternalName: packager.appInfo.productFilename,
      OriginalFilename: exeName,
    },
  });

  console.log("✅ Windows exe icon/metadata patched");
}
