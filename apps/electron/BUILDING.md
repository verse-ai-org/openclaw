# Electron 客户端构建指南

## 快速开始

```bash
cd apps/electron

# macOS
make dev          # 本地开发
make package-fast # 本地打包测试（无签名）
make package      # 正式打包（签名 + 公证）
make clear        # 删除上次构建产物（release/、dist/）
make release      # 一键完整发布：会先 clear，再打包 + 上传 R2 + 验证

# Windows
make package-win      # 打包 Windows
make release-win      # 一键完整发布：会先 clear，再打包 + 上传 R2 + 验证

# 版本管理（根 package.json + apps/electron/package.json 同步）
make version                         # 默认设为今日 YYYY.M.DD（新日历日）
make version patch                   # patch / beta / major 子命令
make version VERSION=2026.3.31       # 显式版本
make release-with-version VERSION=2026.3.31
make release-win-with-version VERSION=2026.3.31
```

## 所有命令

```
开发
  dev              启动开发模式（Electron + React UI 热重载）
  dev-static       启动开发模式（仅静态 UI）

构建
  build            构建所有产物（CLI + UI + Electron 主进程）
  build-electron   仅构建 Electron 主进程（tsdown）

打包（macOS）
  package          完整打包当前架构（签名 + 公证，需配置 .env）
  package-fast     快速打包（无签名；仍执行 `pnpm build` + ui-react，跳过 Lit `ui:build`）
  package-arm64    打包 arm64（Apple Silicon）
  package-x64      打包 x64（Intel）

打包（Windows，在 macOS/Linux 交叉编译）
  package-win      打包 Windows x64
  package-win-fast 快速打包 Windows（仍执行 `pnpm build` + ui-react，跳过 Lit `ui:build`）

发布（上传到 Cloudflare R2）
  version          同步根目录 + electron 的 version（默认今日日期；子目标 patch / beta / major）
  patch            单独运行等价 make version patch
  beta             单独运行等价 make version beta
  major            单独运行等价 make version major
  r2-setup         首次配置 rclone r2 remote
  upload-r2        上传 macOS release/ 产物到 R2
  upload-r2-verify 验证 macOS latest-mac.yml 是否可公开访问
  upload-r2-win    上传 Windows 产物到 R2（exe + zip + yml）
  upload-r2-verify-win 验证 Windows latest.yml 是否可公开访问
  release          一键完整发布 macOS：构建前 clear → 打包 + 上传 R2 + 验证
  release-win      一键完整发布 Windows：构建前 clear → 打包 + 上传 R2 + 验证
  release-with-version 先更新 version 再执行完整发布（需传 VERSION=...）
  release-win-with-version 先更新 version 再执行 Windows 发布（需传 VERSION=...）

工具
  icons            从 icon.png 生成 macOS .icns（默认；见「应用图标」）
  icons-all        同时生成 .icns 与 .ico
  icons-ico        仅生成 .ico（Windows）
  setup            初次设置：复制 .env 模板
  clear            删除上次构建产物（release/、dist/）；release / release-win 会在打包前自动执行
  clean            与 clear 相同（清理 release/ 和 dist/，供 clean-all 链式调用）
  clean-all        深度清理（含 Node 二进制和运行时依赖）
  verify           验证已打包 .app 的签名和公证状态
```

运行 `make help` 查看带颜色的帮助信息。

---

## 应用图标

源图：`resources/icon.png`（黑底圆环；仅改图标时编辑此文件）。

生成脚本（唯一入口）：`scripts/generate-icons.sh` → `scripts/generate-icons.py`。

| 文件 | 用途 |
|------|------|
| `resources/icon.icns` | **macOS**：Dock / Finder / `.app`（`electron-builder.yml` → `mac.icon`） |
| `resources/icon.ico` | **Windows**：exe / 安装包（`win.icon`）；macOS 打包不使用 |
| `Icon.icon/` | Icon Composer 工程；`Assets/bossim-ring.png` 由脚本自动生成 |

**macOS 生成流程**（与原生 OpenClaw `scripts/build_icon.sh` 相同）：从 `Icon.icon` 用 Xcode Icon Composer（`ictool`）导出 824×824，再透明 padding 到 1024×1024，由系统应用 squircle 圆角。不要在资源里手画圆角白底方块，否则 Dock 会出现灰框套小白块。

```bash
make icons          # 默认只更新 icon.icns
make icons-all      # 更换 icon.png 后：.icns + .ico
make icons-ico      # 仅 .ico（Windows）
```

> `make` 不会把 `--ico-only` 传给脚本（会被当成 make 自己的参数）。请用上面的目标，或直接：`bash scripts/generate-icons.sh --ico-only`

`icon.icns` / `icon.ico` 已提交到 git；`make package` / `package-win` / `release*` **不会**自动生成图标。更换 `icon.png` 后请本地执行 `make icons-all`（或分别 `make icons` + `make icons-ico`），并将生成的 `.icns` / `.ico` 一并提交。macOS `.icns` 需本机 Xcode（Icon Composer / `ictool`）；无 `ictool` 时会回退 Pillow 并打印警告（Dock 显示可能不正确）。

---

## 正式签名打包（需要 Apple 开发者账号）

### 第一步：初次设置

```bash
make setup
```

这会创建 `apps/electron/.env` 文件（已被 `.gitignore` 忽略）。

### 第二步：生成 App Store Connect API Key

1. 打开 [App Store Connect → Users and Access → Integrations → API Keys](https://appstoreconnect.apple.com/access/integrations/api)
2. 点击 `+` 生成 Key，角色选 **Developer**
3. 记录 **Issuer ID** 和 **Key ID**，下载 `.p8` 文件（只能下载一次，妥善保存）

> 如果页面无内容：确认你的账号角色是 Account Holder，或先在 [developer.apple.com/account](https://developer.apple.com/account) 接受最新协议。

### 第三步：配置 .env

编辑 `apps/electron/.env`：

```bash
APP_STORE_CONNECT_ISSUER_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
APP_STORE_CONNECT_KEY_ID=XXXXXXXXXX
APP_STORE_CONNECT_TEAM_ID=XXXXXXXXXX

# 推荐：填 .p8 文件的绝对路径
APP_STORE_CONNECT_API_KEY_PATH=/Users/你的用户名/Downloads/AuthKey_KEYID.p8
```

> **注意**：.env 文件不支持 `export` 前缀和 `$(...)` 命令替换，直接写 `KEY=VALUE`。

### 第四步：确认证书在 Keychain 中

```bash
security find-identity -p codesigning -v
# 应看到："Developer ID Application: Your Name (TEAMID)"
```

如果没有，在 Xcode 中创建：
`Xcode → Settings → Accounts → 选 Apple ID → Manage Certificates → + → Developer ID Application`

### 第五步：打包

```bash
make package          # 当前架构（通常 arm64）
make package-arm64    # 指定 Apple Silicon
make package-x64      # 指定 Intel
```

产物输出到 `apps/electron/release/`。

### 第六步：验证

```bash
make verify
# 预期最后一行：source=Notarized Developer ID
```

---

## 本地测试打包（无需证书）

```bash
make package-fast
```

生成的 `.dmg` 可以安装和运行，但没有签名，打开时 macOS 会提示"无法验证开发者"。  
右键点击 `.app` → 打开 → 仍然打开，即可绕过提示。

---

## 打包 Windows（交叉编译）

在 macOS 或 Linux 上均可编译 Windows 版本：

```bash
make package-win      # 正式打包（Windows 不需要签名配置）
make package-win-fast # 与 package-fast 相同策略：跳过 Lit ui:build，仍构建 dist/
```

产物：`apps/electron/release/` 下的 `.exe` 安装包和 `.zip`。

内嵌 Gateway 的运行时 `node_modules` 在 `pnpm install` 前会写入 `node-linker=hoisted`（见 `scripts/electron-prod.npmrc`），避免 electron-builder 把 pnpm 的 symlink 布局拷贝成实体目录后，传递依赖无法从 `@mariozechner/pi-ai` 等包内解析。

### 版本号管理（发布前）

`make version` 会**同时**写入仓库根目录 `package.json`（内嵌 openclaw / Gateway `hello` 版本）与 `apps/electron/package.json`（electron-builder、自动更新元数据），保持两者一致。脚本：`apps/electron/scripts/bump-version-sync.mjs`。

Electron 安装包对外版本仍由 `apps/electron/package.json` 的 `version` 提供给 electron-builder。

**版本格式：** `YYYY.M.DD[-patch.N | -beta.N]`

可用以下命令管理版本：

```bash
# 1. 默认对齐今日日期 YYYY.M.DD（新日历日）
make version                         # 设为今日；若已是当日基础版则失败（需显式 patch/beta）
make version patch                   # patch：同日二次发版 / 递增 patch.N
make version beta                    # beta：创建或递增 beta.N
make version major                   # 当日强制回到纯日期版（无后缀）

# 单字简写（等价于上面带 version）
make patch
make beta
make major

# 2. 手动指定版本
make version VERSION=2026.3.31

# 3. 更新版本并执行完整发布
make release-with-version VERSION=2026.3.31
make release-win-with-version VERSION=2026.3.31
```

**规则示例：**

| 当前版本 | 命令 | 结果 | 说明 |
|---------|------|--------|------|
| `2026.4.1`（已是当日基础版） | `make version` | 失败（退出码 1） | 需 `make version patch` 等 |
| `2026.4.1`（已是当日基础版） | `make version patch` / `make patch` | `2026.4.1-patch.1` | 同日第二次发版 |
| `2026.4.1-patch.1` | `make version` | `2026.4.1-patch.2` | 已在 patch 梯子上时无参仍递增 |
| `2026.4.1` | `make version beta` | `2026.4.1-beta.1` | 创建 beta |
| `2026.4.1-beta.1` | `make version beta` | `2026.4.1-beta.2` | 递增 beta |
| `2026.4.1-beta.2` | `make version major` | `2026.4.1` | 去掉后缀，回到当日主版本号 |

> **注意：**
> - `make release` / `make release-win` **不会**自动改版本；不走 `*-with-version` 时请先 `make version`，或手动把**根目录**与 **`apps/electron/package.json`** 的 `version` 改成一致。
> - `make version` 在新日历日会设为当日 `YYYY.M.DD`；若**当前已是当日基础版**（无 `-patch`/`-beta` 后缀），须使用 `make version patch` / `make version beta` 等。
> - 若当前已是 `YYYY.M.DD-patch.N`，无参 `make version` 仍会递增为 `patch.N+1`。
> - `make release` / `make release-win` 会在打包前执行 `make clear`，删除 `release/` 与 `dist/`，避免混入旧产物。

---

## 手动发布到 Cloudflare R2（替代 GitHub Actions）

GitHub Actions 构建有问题时，可在本地完成打包并手动上传到 R2，自动更新流程完全一致。

### 第一步：在 .env 中补充 R2 配置

编辑 `apps/electron/.env`，在已有的签名配置下方加入：

```bash
# Cloudflare R2
R2_ACCESS_KEY_ID=your-access-key-id
R2_SECRET_ACCESS_KEY=your-secret-access-key
R2_ENDPOINT=https://<accountid>.r2.cloudflarestorage.com
R2_BUCKET_NAME=your-bucket-name
```

R2 API Token 在 Cloudflare 控制台 → R2 → Manage R2 API Tokens 创建，权限选 **Object Read & Write**。

### 第二步：首次配置 rclone（只需做一次）

```bash
# 若未安装 rclone
brew install rclone

# 自动读取 .env 中的 R2 变量并配置 remote
make r2-setup
```

### 第三步：本地打包

```bash
# 双架构正式打包（含签名 + 公证）
make package-arm64
make package-x64
```

产物在 `apps/electron/release/`，包含 `.dmg`、`.zip`、`.blockmap` 和 `latest-mac.yml`。

### 第四步：上传到 R2

```bash
make upload-r2
```

脚本会自动：
1. 先上传 `.dmg` / `.zip` / `.blockmap`（安装包）
2. 最后上传 `latest-mac.yml`（更新描述文件）

> **顺序很重要**：`latest-mac.yml` 必须在安装包全部上传完毕后才能上传，否则 electron-updater 会因找不到包文件而报错。

### 第五步：验证

```bash
make upload-r2-verify
# 输出 latest-mac.yml 前几行，确认可正常访问
```

### 一键完整发布

上述步骤可用一个命令完成：

```bash
make release
# 等价于：clear → package-arm64 → upload-r2 → upload-r2-verify
# （当前 Makefile 中 package-x64 已注释；若需 Intel 包请单独 make package-x64）
```

### Windows 发布

Windows 使用 `electron-updater` 自动更新机制，从 R2 的 `latest.yml` 检查更新。

```bash
# 打包 Windows
make package-win

# 上传到 R2
make upload-r2-win

# 验证
make upload-r2-verify-win

# 或一键完成
make release-win
# 等价于：clear → package-win → upload-r2-win → upload-r2-verify-win
```

> 注意：Windows 发布使用 `release-win` 而不是 `release`，后者是 macOS 专用的。

---

## 常见问题

**公证超时或失败**  
检查网络连接，Apple 公证服务器有时响应较慢（通常 1-5 分钟）。也可以检查 API Key 是否正确。

**codesign 找不到证书**  
运行 `security find-identity -p codesigning -v` 确认证书存在；  
如在 CI 环境，需要先导入证书：`security import cert.p12 -k ~/Library/Keychains/login.keychain`。

**App 启动后找不到 Node 运行时**  
说明用了 `pnpm package:mac` 而不是 `make package`，前者跳过了 Node 二进制下载步骤。  
始终使用 `make package` 或 `make package-fast`。

**清理重来**  
```bash
make clear      # 仅删除 release/ 与 dist/（与 make clean 相同）
make clean-all  # 在 clear 基础上再删 prod-node_modules、下载的 Node 二进制等
make package    # 重新打包
```
