# Electron 自动更新机制

本文档描述 Bossim Electron 客户端的自动更新实现，包括架构设计、发布流程、关键文件和维护指南。

---

## 架构概览

```
开发者推 git tag v*
        │
        ▼
GitHub Actions (electron-release.yml)
        │
        ├─ macOS arm64 打包、签名、公证
        ├─ macOS x64  打包、签名、公证
        │
        └─ 上传到 Cloudflare R2
               https://files.aiverser.com/bossim/releases/
               ├─ Bossim-x.y.z-arm64.dmg
               ├─ Bossim-x.y.z-x64.dmg
               ├─ Bossim-x.y.z-arm64-mac.zip   ← autoUpdater 差量更新包
               ├─ Bossim-x.y.z-x64-mac.zip
               ├─ Bossim-x.y.z-arm64-mac.zip.blockmap
               ├─ Bossim-x.y.z-x64-mac.zip.blockmap
               └─ latest-mac.yml               ← 版本描述文件（最后上传）

用户端 app
        │
        ├─ 启动后 10s 检查 latest-mac.yml
        ├─ 每 4 小时定时检查
        │
        ├─ 发现新版本 → 后台静默下载 .zip
        │
        └─ 下载完成 → UI 顶部出现「Update」
                       用户点击 Update → stopGateway + quitAndInstall()
                       直接退出应用 → 不安装（更新包保留，下次仍可安装）
```

---

## 更新服务器

| 项目 | 值 |
|------|----|
| 存储服务 | Cloudflare R2（bucket: `aiverse-storage`） |
| 公网访问域名 | `https://files.aiverser.com` |
| 更新描述文件路径 | `https://files.aiverser.com/bossim/releases/latest-mac.yml` |
| R2 Endpoint | `https://f3add25f595daf0c1deda724c8c7ac45.r2.cloudflarestorage.com` |

> **重要**：`latest-mac.yml` 的 URL 路径一旦上线不可更改，否则旧版 app 找不到更新。

---

## 关键文件索引

| 文件 | 作用 |
|------|------|
| `apps/electron/electron-builder.yml` | `publish` 字段配置更新服务器 URL |
| `apps/electron/src/main/updater.ts` | autoUpdater 封装（初始化、检查、下载、安装） |
| `apps/electron/src/main/index.ts` | 挂载 updater、注册 `app:install-update` IPC handler |
| `apps/electron/src/preload/index.ts` | 通过 contextBridge 暴露 `onUpdateReady` / `installUpdate` |
| `ui-react/src/components/layout/UpdateBanner.tsx` | 更新提示条 UI 组件 |
| `ui-react/src/components/layout/AppShell.tsx` | 挂载 UpdateBanner |
| `.github/workflows/electron-release.yml` | CI 打包 + 上传 R2 的完整 workflow |

---

## 各模块详解

### 1. `electron-builder.yml` — publish 配置

```yaml
publish:
  provider: generic
  url: https://files.aiverser.com/bossim/releases/
  channel: latest
```

electron-builder 打包时会根据此配置自动生成 `latest-mac.yml`，内含版本号、文件名、SHA512 校验值。

### 2. `updater.ts` — autoUpdater 封装

**导出的三个函数：**

| 函数 | 调用时机 |
|------|----------|
| `initAutoUpdater(mainWindow)` | `main()` 创建主窗口后，`app.isPackaged` 时调用 |
| `checkForUpdates()` | 启动后 10s 首次调用；之后每 4 小时定时调用 |
| `quitAndInstall()` | 用户点击「重启安装」时，由 IPC handler 调用 |

**行为说明：**
- `autoDownload = false`：发现新版本后手动触发下载，避免非预期带宽消耗
- `autoInstallOnAppQuit = false`：**禁止**退出时自动安装（Windows NSIS 在退出瞬间安装可能删空安装目录；必须由用户点击「Update」）
- `disableDifferentialDownload = true`：Windows 使用完整安装包，避免差量更新失败
- 下载完成后发送 `app:update-ready` IPC 事件通知渲染进程
- `quitAndInstall()` 前先 `stopGatewayForUpdate()`，释放 `node.exe` 文件锁

### 3. `index.ts` — IPC 注册

```typescript
// 启动 10s 后检查，每 4 小时定时检查
if (app.isPackaged) {
  initAutoUpdater(mainWindow);
  setTimeout(() => checkForUpdates(), 10_000);
  setInterval(() => checkForUpdates(), 4 * 60 * 60 * 1_000);
}

// 用户确认后停止 Gateway、退出并安装
ipcMain.handle("app:install-update", async () => {
  await quitAndInstall();
});
```

### 4. `preload/index.ts` — contextBridge 暴露

渲染进程通过 `window.electronBridge` 访问：

```typescript
// 订阅"新版本已下载"事件，返回取消订阅函数
onUpdateReady(callback: (info: { version, releaseNotes }) => void): () => void

// 触发退出并安装新版本
installUpdate(): Promise<void>
```

### 5. `UpdateBanner.tsx` — 提示条 UI

- 挂载在 `AppShell` 的 `ConnectionBanner` 下方
- 仅在 Electron 环境（`window.electronBridge?.onUpdateReady` 存在）时生效
- 下载完成后顶部出现蓝色提示条，显示新版本号
- 用户可点击「重启安装」立即更新，或点击 × 稍后提示
- 组件卸载时自动取消 IPC 监听，无内存泄漏

---

## CI/CD 发布流程

### 触发条件

推送 `v*` 格式的 git tag 时自动触发 `electron-release.yml`。

### 发布步骤

```bash
# 1. 更新根目录 package.json 中的版本号
# 手动编辑 "version" 字段，例如 "1.0.1"

# 2. 提交并推送
git add package.json
git commit -m "chore: bump version to 1.0.1"
git push origin main

# 3. 推 tag 触发 CI
git tag v1.0.1
git push origin v1.0.1
```

### CI 执行内容

1. **macOS arm64 + x64 并行构建**（`macos-latest` runner）
   - 导入 Developer ID 证书（从 `APPLE_CERTIFICATE_P12_BASE64` secret）
   - 执行 `package-electron.sh`（构建 → 下载 Node → 安装依赖 → 打包 → 签名 → 公证）
   - 上传产物为 GitHub Actions artifact

2. **上传到 Cloudflare R2**（`ubuntu-latest` runner）
   - 用 rclone 将 `.dmg`、`.zip`、`.blockmap` 上传到 R2
   - **最后**上传 `latest-mac.yml`，确保安装包已就绪再更新版本描述文件
   - 验证 `latest-mac.yml` 可公网访问

---

## GitHub Actions Secrets 配置

在仓库 **Settings → Secrets and variables → Actions → Repository secrets** 中配置：

| Secret 名称 | 说明 |
|-------------|------|
| `R2_ACCESS_KEY_ID` | Cloudflare R2 Access Key ID |
| `R2_SECRET_ACCESS_KEY` | Cloudflare R2 Secret Access Key |
| `R2_ENDPOINT` | R2 Endpoint URL（格式：`https://<account_id>.r2.cloudflarestorage.com`） |
| `R2_BUCKET_NAME` | R2 Bucket 名称（`aiverse-storage`） |
| `APPLE_CERTIFICATE_P12_BASE64` | Developer ID Application 证书 + 私钥，.p12 格式，base64 编码 |
| `APPLE_CERTIFICATE_PASSWORD` | .p12 导出时设置的密码 |
| `APP_STORE_CONNECT_ISSUER_ID` | App Store Connect API Issuer ID（公证用） |
| `APP_STORE_CONNECT_KEY_ID` | App Store Connect API Key ID（公证用） |
| `APP_STORE_CONNECT_API_KEY_P8` | App Store Connect API 私钥完整内容，含 `-----BEGIN/END PRIVATE KEY-----` |

**获取 `APPLE_CERTIFICATE_P12_BASE64`：**

```bash
# 在 Keychain Access → 登录钥匙串 → 我的证书 中
# 右键 Developer ID Application 证书（需展开显示私钥的那行）→ 导出 → .p12

# 转为 base64
base64 -i /path/to/developer-id.p12 | pbcopy
# 剪贴板内容即为 APPLE_CERTIFICATE_P12_BASE64
```

---

## Cloudflare R2 公开访问配置

`latest-mac.yml` 和安装包需要可公网 GET 访问（无需认证）：

1. Cloudflare Dashboard → R2 → `aiverse-storage` → Settings → Custom Domains
2. 确认 `files.aiverser.com` 已绑定且状态为 Active
3. 验证：`curl -I https://files.aiverser.com/bossim/releases/latest-mac.yml`
   - 应返回 `200 OK`

---

## 版本号管理

`electron-builder` 读取**根目录 `package.json`** 的 `version` 字段作为 app 版本号（非 `apps/electron/package.json`）。

`latest-mac.yml` 中的版本号与此一致，autoUpdater 通过比对该版本号决定是否下载更新。

---

## 常见问题

### 推 tag 后 CI 报签名错误

检查 `APPLE_CERTIFICATE_P12_BASE64` 和 `APPLE_CERTIFICATE_PASSWORD` 是否正确。
验证方式：
```bash
echo "$APPLE_CERTIFICATE_P12_BASE64" | base64 --decode > /tmp/test.p12
openssl pkcs12 -in /tmp/test.p12 -noout -passin pass:"$APPLE_CERTIFICATE_PASSWORD"
```

### autoUpdater 在开发模式下不工作

正常现象。`updater.ts` 中 `initAutoUpdater` 仅在 `app.isPackaged === true` 时被调用，开发模式下跳过。

### latest-mac.yml 访问 403 / 404

检查 Cloudflare R2 自定义域名绑定状态，以及 bucket 是否开启了公开读取权限。

### 用户看不到更新提示条

1. 确认 app 是打包版本（非开发模式）
2. 检查 `https://files.aiverser.com/bossim/releases/latest-mac.yml` 中的版本号是否大于当前版本
3. 查看主进程日志（`~/.openclaw/logs/electron-main.log`）中 `[updater]` 前缀的条目（更新日志默认落盘，无需 `BOSSIM_LOG_VERBOSE`）

### Windows：退出后安装目录变空、无法启动

**原因：** 旧版在 `autoInstallOnAppQuit = true` 时，用户下载完成后直接关闭应用会触发 NSIS「先删后装」；若安装未完成则目录被清空。

**当前策略：**
- 仅当用户点击 UI「Update」时调用 `quitAndInstall()`
- 关闭应用**不会**自动安装；已下载的更新保留在缓存，下次启动仍可提示安装
- `electron-builder.yml` 中 `nsis.differentialPackage: false`，运行时 `disableDifferentialDownload: true`

**已损坏的安装：** 从 R2 下载完整 `Bossim Setup x.y.z.exe` 重新安装。

### 需要立即推送紧急更新

直接推新 tag 即可，CI 会自动覆盖 R2 上的旧描述文件，正在运行的 app 最多 4 小时内会检测到更新。
如需立即生效，可通知用户手动触发：`Help → Check for Updates`（如有实现此菜单项）。

---

## 恢复其他 Workflow

当前仅 `electron-release.yml` 自动触发，其余 workflow 已改为 `workflow_dispatch` 手动触发。
恢复方式：将对应 `.github/workflows/*.yml` 中的 `on:` 部分改回原始触发条件即可。