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
// a symlink (macOS/Linux) or copy (Windows) of the Electron binary there,
// `hasBinary("node")` succeeds and skills with `requires.bins: [node]`
// are no longer silently filtered out.
// ---------------------------------------------------------------------------

/** @param {import("app-builder-lib").AfterPackContext} context */
async function ensureNodeShim(context) {
  const platform = context.electronPlatformName;
  const appOutDir = context.appOutDir;
  const appName = context.packager.appInfo.productFilename;

  let nodeDir;
  let shimPath;
  let target;

  if (platform === "darwin") {
    // macOS: Contents/Resources/node/node → Helper binary (avoids Dock bounce)
    const contentsDir = path.join(appOutDir, `${appName}.app`, "Contents");
    nodeDir = path.join(contentsDir, "Resources", "node");
    shimPath = path.join(nodeDir, "node");
    const helperBin = path.join(
      contentsDir,
      "Frameworks",
      `${appName} Helper.app`,
      "Contents",
      "MacOS",
      `${appName} Helper`,
    );
    if (fs.existsSync(helperBin)) {
      target = path.relative(nodeDir, helperBin);
    } else {
      // Fallback to main binary
      target = path.relative(nodeDir, path.join(contentsDir, "MacOS", appName));
    }
  } else if (platform === "win32") {
    // Windows: resources/node/node.exe — hardlink to the main exe.
    // Symlinks on Windows require Developer Mode; hardlinks are more reliable.
    nodeDir = path.join(appOutDir, "resources", "node");
    shimPath = path.join(nodeDir, "node.exe");
    target = path.join(appOutDir, `${appName}.exe`);
  } else {
    // Linux: resources/node/node → main binary
    nodeDir = path.join(appOutDir, "resources", "node");
    shimPath = path.join(nodeDir, "node");
    target = path.relative(nodeDir, path.join(appOutDir, appName));
  }

  fs.mkdirSync(nodeDir, { recursive: true });

  if (platform === "win32") {
    // Use hardlink on Windows to avoid symlink privilege requirements
    try {
      fs.linkSync(target, shimPath);
      console.log(`🔗 Created node.exe hardlink: ${shimPath}`);
    } catch {
      // Fallback: copy the exe
      fs.copyFileSync(target, shimPath);
      console.log(`📋 Copied node.exe shim: ${shimPath}`);
    }
  } else {
    // macOS / Linux: relative symlink
    fs.symlinkSync(target, shimPath);
    console.log(`🔗 Created node symlink: ${shimPath} → ${target}`);
  }
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
