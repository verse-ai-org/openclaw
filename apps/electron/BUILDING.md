# Electron 客户端构建指南

## 快速开始

```bash
cd apps/electron

# macOS
make dev          # 本地开发
make package-fast # 本地打包测试（无签名）
make package      # 正式打包（签名 + 公证）
make release      # 一键完整发布 macOS：双架构打包 + 上传 R2 + 验证

# Windows
make package-win      # 打包 Windows
make release-win      # 一键完整发布 Windows：打包 + 上传 R2 + 验证

# 版本管理
make bump-version VERSION=2026.3.31
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
  package-fast     快速打包（无签名，用于本地验证安装流程）
  package-arm64    打包 arm64（Apple Silicon）
  package-x64      打包 x64（Intel）

打包（Windows，在 macOS/Linux 交叉编译）
  package-win      打包 Windows x64
  package-win-fast 快速打包 Windows（跳过构建，复用产物）

发布（上传到 Cloudflare R2）
  bump-version     自动递增版本号（支持 TYPE=major|beta|patch）
  r2-setup         首次配置 rclone r2 remote
  upload-r2        上传 macOS release/ 产物到 R2
  upload-r2-verify 验证 macOS latest-mac.yml 是否可公开访问
  upload-r2-win    上传 Windows 产物到 R2（exe + zip + yml）
  upload-r2-verify-win 验证 Windows latest.yml 是否可公开访问
  release          一键完整发布 macOS：双架构打包 + 上传 R2 + 验证
  release-win      一键完整发布 Windows：打包 + 上传 R2 + 验证
  release-with-version 先更新 version 再执行完整发布（需传 VERSION=...）
  release-win-with-version 先更新 version 再执行 Windows 发布（需传 VERSION=...）

工具
  setup            初次设置：复制 .env 模板
  clean            清理 release/ 和 dist/
  clean-all        深度清理（含 Node 二进制和运行时依赖）
  verify           验证已打包 .app 的签名和公证状态
```

运行 `make help` 查看带颜色的帮助信息。

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
make package-win-fast # 跳过构建步骤，复用现有产物
```

产物：`apps/electron/release/` 下的 `.exe` 安装包和 `.zip`。

### 版本号管理（发布前）

Electron 安装包版本来自 `apps/electron/package.json` 的 `version` 字段。

**版本格式：** `YYYY.M.DD[-patch.N | -beta.N]`

可用以下命令管理版本：

```bash
# 1. 自动递增（推荐）
make bump-version                    # 自动检测并递增
make bump-version TYPE=major         # 强制升级到主版本（YYYY.M.DD）
make bump-version TYPE=beta          # 创建/递增 beta 版本
make bump-version TYPE=patch         # 创建/递增 patch 版本

# 2. 手动指定版本
make bump-version VERSION=2026.3.31

# 3. 更新版本并执行完整发布
# macOS：更新版本并执行完整发布
make release-with-version VERSION=2026.3.31

# Windows：更新版本并执行完整发布
make release-win-with-version VERSION=2026.3.31
```

**自动递增规则示例：**

| 当前版本 | 命令 | 递增后 | 说明 |
|---------|------|--------|------|
| `2026.4.1` | `make bump-version` | `2026.4.1-patch.1` | 同一天第 2 次发布 |
| `2026.4.1-patch.1` | `make bump-version` | `2026.4.1-patch.2` | 补丁版本递增 |
| `2026.4.1` | `make bump-version TYPE=beta` | `2026.4.1-beta.1` | 创建 beta 版本 |
| `2026.4.1-beta.1` | `make bump-version TYPE=beta` | `2026.4.1-beta.2` | Beta 版本递增 |
| `2026.4.1-beta.2` | `make bump-version TYPE=major` | `2026.4.1` | Beta 转正 |

> **注意：** 
> - `make release` 本身不会自动改版本，需要先用 `bump-version` 更新
> - 默认行为会自动检测当天版本并递增（优先 patch → beta → major）
> `make release` / `make release-win` 本身不会自动改版本；如果不走 `*-with-version`，请先手动改 version。

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
# 等价于：package-arm64 → package-x64 → upload-r2 → upload-r2-verify
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
# 等价于：package-win → upload-r2-win → upload-r2-verify-win
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
make clean-all  # 删除所有构建产物和下载的二进制
make package    # 重新打包
```
