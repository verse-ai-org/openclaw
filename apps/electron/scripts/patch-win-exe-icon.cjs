#!/usr/bin/env node
/**
 * afterPack: embed Windows app icon + version metadata without signAndEditExecutable.
 *
 * signAndEditExecutable: true pulls winCodeSign from GitHub and can fail on Windows when
 * 7zip cannot create symlinks (needs Developer Mode / admin) or when GitHub is unreachable.
 * This hook uses the `rcedit` npm package (bundled rcedit.exe) instead.
 */
const path = require("node:path");
const rcedit = require("rcedit");

/** @param {import("app-builder-lib").AfterPackContext} context */
exports.default = async function patchWinExeIcon(context) {
  if (context.electronPlatformName !== "win32") {
    return;
  }

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
};
