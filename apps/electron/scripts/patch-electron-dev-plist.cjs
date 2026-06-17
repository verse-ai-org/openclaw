/**
 * Dev-only: patch node_modules/electron Electron.app Info.plist so macOS / Chrome
 * show "Bossim" (not "Electron") when opening bossim:// deep links from the browser.
 * Packaged Bossim.app already uses productName from electron-builder.yml.
 */
const fs = require("node:fs");
const path = require("node:path");

const DISPLAY_NAME = "Bossim";

function resolveElectronPlistPath() {
  const roots = [
    path.join(__dirname, "../../.."), // openclaw monorepo root
    path.join(__dirname, "../.."),
    process.cwd(),
  ];
  for (const root of roots) {
    const candidate = path.join(
      root,
      "node_modules/electron/dist/Electron.app/Contents/Info.plist",
    );
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function patchPlist(plistPath) {
  let content = fs.readFileSync(plistPath, "utf8");
  const before = content;

  content = content.replace(
    /(<key>CFBundleDisplayName<\/key>\s*<string>)([^<]*)(<\/string>)/,
    `$1${DISPLAY_NAME}$3`,
  );
  content = content.replace(
    /(<key>CFBundleName<\/key>\s*<string>)([^<]*)(<\/string>)/,
    `$1${DISPLAY_NAME}$3`,
  );

  if (!content.includes("<key>CFBundleURLTypes</key>")) {
    const urlTypes = `
	<key>CFBundleURLTypes</key>
	<array>
		<dict>
			<key>CFBundleURLName</key>
			<string>Bossim Auth</string>
			<key>CFBundleURLSchemes</key>
			<array>
				<string>bossim</string>
			</array>
		</dict>
		<dict>
			<key>CFBundleURLName</key>
			<string>OpenClaw OAuth</string>
			<key>CFBundleURLSchemes</key>
			<array>
				<string>openclaw</string>
			</array>
		</dict>
	</array>`;
    content = content.replace("</dict>\n</plist>", `${urlTypes}\n</dict>\n</plist>`);
  }

  if (content === before) {
    console.log(`[patch-electron-dev-plist] already patched: ${plistPath}`);
    return;
  }

  fs.writeFileSync(plistPath, content);
  console.log(`[patch-electron-dev-plist] updated display name to "${DISPLAY_NAME}": ${plistPath}`);
}

const plistPath = resolveElectronPlistPath();
if (!plistPath) {
  console.warn("[patch-electron-dev-plist] Electron.app Info.plist not found; skip");
  process.exit(0);
}

patchPlist(plistPath);
