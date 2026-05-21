# Bossim Gateway 生命周期

本文档描述 Bossim（Electron 桌面端）如何启动、探测就绪、停止与重启 OpenClaw Gateway。实现集中在主进程 `apps/electron/src/main/gateway.ts`，由 `apps/electron/src/main/index.ts` 在应用启动/退出时调用。

---

## 架构概览

Bossim **不在** Electron 进程内跑 Gateway，而是通过 `child_process.spawn` 拉起独立的 Node 子进程：

```
┌─────────────────────────────────────────────────────────────┐
│  Bossim 主进程 (Electron)                                      │
│  index.ts → gateway.ts                                       │
│    · patchConfigForElectron()                                  │
│    · startGateway() / stopGateway() / restartGateway()         │
│    · gatewayProcess: ChildProcess | null                       │
└──────────────────────────┬──────────────────────────────────┘
                           │ spawn
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  Gateway 子进程                                               │
│  Resources/node/node  Resources/openclaw/openclaw.mjs        │
│    gateway run --port <port> --allow-unconfigured [--force]    │
│  监听: ws://127.0.0.1:<port>  HTTP: /health, /__openclaw__/…   │
└──────────────────────────┬──────────────────────────────────┘
                           │ WebSocket
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  渲染进程 (ui-react，经内嵌静态 HTTP Server)                    │
│  http://127.0.0.1:<staticPort>/?gatewayUrl=ws://…&token=…    │
└─────────────────────────────────────────────────────────────┘
```

| 组件 | 路径 / 说明 |
|------|-------------|
| Gateway 管理逻辑 | `apps/electron/src/main/gateway.ts` |
| 应用入口与 quit 钩子 | `apps/electron/src/main/index.ts` |
| 捆绑 Node | `Resources/node/node`（Windows 为 `node.exe`） |
| OpenClaw 入口 | `Resources/openclaw/openclaw.mjs` |
| 用户配置 | `~/.openclaw/openclaw.json`（`gateway.auth.token`、`gateway.port`） |
| 主进程日志 | `~/.openclaw/logs/electron-main.log` |
| Gateway 自身日志 | 子进程 stdout/stderr → 同上日志；另见 `/tmp/openclaw/openclaw-*.log` |

默认 Gateway 端口：**18789**（可由配置 `gateway.port` 覆盖）。

---

## 应用启动时的调用顺序

`main()` 在 `app.whenReady()` 之后大致按以下顺序执行（见 `index.ts` + `startup.ts`）：

```
app.whenReady()
  → generateToken()
  → startStaticServer(control-ui-react)   // 打包 / dev:static
  → configureSession (初始端口)
  → createWindow() + show()
  → loadSplashPage()                      // 回访用户；首次安装直接 load setup.html
  → runStartupPipeline()（异步，不阻塞窗口）
        → warmLoginShellEnv
        → patchConfigForElectron + startGateway
        → onGatewayCrash
        → loadRendererPage(index|setup)
```

启动阶段通过 IPC `startup:phase` 推送到 `splash.html`（`ui-react` 独立入口）。**首次安装**（`isFirstLaunch()`）跳过 Splash，直接加载 `setup.html`；Gateway 仍在后台 `runStartupPipeline` 中启动，但不向安装向导推送 `starting` / `gateway` 等启动文案。回访用户：Splash 加载完成后再跑 pipeline（`waitForSplashReady`），并可用 `startup:get-phase` 补发当前阶段。

短步骤（静态服务、shell 环境、配置同步）合并为单次 `starting`，避免 Splash 闪烁。`gateway` 阶段通过 `startGateway({ onProgress })` 推送子文案。

| phase | 时机 | 默认文案（英文） |
|-------|------|------------------|
| `starting` | `warmLoginShellEnv` + `patchConfigForElectron`（合并） | Starting application… |
| `gateway` | `startGateway()` | Starting local service… → 子状态见下 |
| `workspace` | `loadRendererPage(setup\|index)` | Starting setup wizard… / Starting workspace… |
| `ready` | 主界面 `did-finish-load` | Starting Bossim… |
| `failed` | Gateway 启动失败 | Failed to start service（可 `startup:retry`） |

**`gateway` 子状态**（同一 `phase`，仅 `message` 变化）：

| 子文案 | 时机 |
|--------|------|
| Starting local service… | `startGateway` 开始 |
| Connecting to existing service… | 开发模式复用已在跑的 Gateway |
| Preparing service port… | 打包 `--force` 前清理端口 |
| Starting Gateway process… | 子进程已 spawn |
| Connecting to service… | 轮询 `/health` 等待就绪 |

Gateway 启动失败时停留在 Splash，不进入主界面，直至用户重试成功。

---

## `startGateway()` 决策树

每次调用会将 `reusingExternalGateway = false`，再按配置分支处理。

### 是否已有 `gateway.auth.token`？

从 `~/.openclaw/openclaw.json`（或 `OPENCLAW_CONFIG_PATH`）读取。

#### 分支 A：已有 token（用户已完成向导）

| 条件 | 行为 |
|------|------|
| **开发模式**（`!app.isPackaged`）且 `GET /health` 成功 | **`reuse-gateway`**：不 spawn，不持有 `gatewayProcess` |
| **打包模式**（`app.isPackaged`） | **永不 reuse**；若 `/health` 仍通，打 `replace-stale-gateway` 后仍 spawn |
| 需要 spawn 时 | `spawnGateway({ port: configPort, token, force })` |

#### 分支 B：无 token（首次启动 / 向导前）

- 端口：`opts.port ?? 18789`
- Token：本次 `sessionToken`（`index.ts` 生成）
- 始终 `spawnGateway`，`reason=no-config-token`

### 打包 vs 开发：关键开关

| 函数 | 打包 Bossim | 开发 `electron .` |
|------|-------------|-------------------|
| `canReuseExistingGateway()` | `false` | `true` |
| `shouldForceGatewaySpawn()` | `true` | 仅 `win32` 为 `true` |

设计意图：

- **打包版**由 Bossim 独占 Gateway 生命周期（退出再开、清残留端口）。
- **开发版**可复用终端里已运行的 `openclaw gateway`，避免与 CLI 调试冲突。

---

## `spawnGateway()` 详细流程

### 1. 解析可执行文件

| 环境 | Node | OpenClaw 入口 |
|------|------|----------------|
| 打包 | `process.resourcesPath/node/node` | `…/openclaw/openclaw.mjs` |
| 开发 | 系统 `node` | 仓库根 `openclaw.mjs` |

打包时会做 `path-check`；缺失则抛错。

### 2. 命令行参数

等价命令：

```bash
node openclaw.mjs gateway run --port <port> --allow-unconfigured [--force]
```

- `--allow-unconfigured`：允许未设置 `gateway.mode=local` 时启动（桌面场景）。
- `--force`：子进程内再次尝试释放端口（主进程已做 `preFree` 时通常为 `no listeners`）。

### 3. `preFreeGatewayPort()`（`force=true` 时，在 spawn **之前**）

避免「旧 Gateway 仍答 `/health`，新子进程尚未 listening」导致 UI 闪断（1006）。

步骤：

1. `lsof`（macOS/Linux）或 `netstat -ano`（Windows）列出占用端口的 PID。
2. `SIGTERM` → 等待 600ms → 仍占用则 `SIGKILL`。
3. 轮询直到 `GET http://127.0.0.1:<port>/health` **不再** 返回 200（最多约 3s）。

日志关键字：`[gateway][pre-free-port]`，`status=begin|done|already-free`。

### 4. 子进程环境变量

| 变量 | 作用 |
|------|------|
| `OPENCLAW_GATEWAY_TOKEN` | 认证 token（不进 argv） |
| `OPENCLAW_GATEWAY_PORT` | 端口 |
| `OPENCLAW_NO_RESPAWN=1` | 禁止 Gateway 自行 fork/launchd 复活；由 Bossim 管生命周期 |
| `PATH` | 前置 bundled `Resources/node`，便于 exec 找到 node |
| `HOME` + login shell 快照 | macOS 打包应用从 GUI 启动时补全 API Key 等 |

### 5. 就绪等待 `waitForGatewayReady()`

**探测 URL**：`http://127.0.0.1:<port>/health`（不用 `GET /`，缺 Control UI 资源时 `/` 会 503）。

**成功条件**（同时满足）：

1. `/health` 返回 HTTP 2xx（`res.ok`）。
2. 子进程 **stdout 或 stderr** 已出现就绪日志（`childWaitState.sawListening`），匹配任一：
   - `listening on ws://`（旧版 Gateway）
   - `http server listening`（当前 Gateway，常出现在 stderr）
   
   避免仅凭 `/health` 误判残留进程。ANSI 颜色码会先剥离再匹配。

**超时**：

| 环境 | 超时 |
|------|------|
| macOS / Linux 打包或开发 | 15s |
| Windows 打包 | 60s（冷启动 + 插件多 + Defender） |

子进程提前退出 → 立即失败，错误信息附带 stderr 尾部（最近 30 行）。

就绪后打 `[gateway][ready]`，`index.ts` 才创建窗口并注入 `gatewayUrl` + `token`。

---

## 应用退出与停止

### 何时调用 `stopGateway()`

仅在 `app.on("before-quit")`（用户 **退出应用**，如 macOS Cmd+Q）。

| 场景 | macOS | Windows |
|------|--------|---------|
| 关闭所有窗口 | 应用常仍在 Dock，**不一定** quit | `window-all-closed` → quit → `before-quit` |
| Cmd+Q / 退出菜单 | `before-quit` → `stopGateway()` | 同左 |

### `stopGateway()` 逻辑

1. 若 `reusingExternalGateway && !app.isPackaged` → 跳过（不关 CLI Gateway）。
2. 若无 `gatewayProcess` → 跳过（`no-process`）。
3. 否则 `_intentionalStop = true`，`killGatewayChildProcess()`：
   - **Windows**：`taskkill /PID … /T /F`
   - **macOS/Linux**：`SIGTERM`

打包版退出后再次启动，日志常见 `pre-free-port status=already-free`（说明上次 stop 成功）。

---

## 重启路径

| 触发 | 入口 | 行为 |
|------|------|------|
| 向导完成等 | IPC `gateway:restart` | `restartGateway()` |
| 用户手动 | IPC `gateway:manual-restart` | 同上 |

`restartGateway()`：

1. 开发模式且当前为 reuse → 跳过。
2. `stopGateway()` → 等待 800ms。
3. `spawnGateway({ force: true })`（始终 preFree + 子进程 `--force`）。
4. 使用参数 token 或磁盘最新 `readExistingGatewayToken()`。

---

## 渲染进程如何连接

`loadRendererPage` 加载 URL 形如：

```
http://127.0.0.1:<staticPort>/?gatewayUrl=ws%3A%2F%2F127.0.0.1%3A18789&token=<token>
```

- **staticPort**：每次启动随机（仅打包）；启动时会写入 `gateway.controlUi.allowedOrigins`，并** prune 掉**历次残留的 `http://127.0.0.1:<旧端口>`，只保留当前静态端口。
- **token**：有配置用 `gateway.auth.token`；无配置用当次 `sessionToken`（向导 `saveOnboardingConfig` 会复用同一 token，避免 setup 与主界面 token 不一致）。

`getGatewayToken()` 在 reuse 外部 Gateway 时会从磁盘重新读 token；自管子进程用内存缓存。

### 首次 onboarding 后的设备配对（Control UI）

OpenClaw Gateway 要求 Control UI 携带 device identity 并完成 pairing。Electron 在 loopback 桌面场景自动批准：

1. **主进程** `device-pairing.ts`：以 `gateway-client` / `backend` + shared token 连接（保留 `operator.admin` / `operator.pairing` scopes），轮询 `device.pair.list` 并调用 `device.pair.approve`。
2. **渲染进程** `use-gateway.ts`：若 WS 关闭原因为 `pairing required … (requestId: …)`，经 IPC `gateway:approveDevicePairing` 触发主进程批准并重连。
3. 两条路径共用 **single-flight**，避免竞态；`unknown requestId` 视为已批准。

开发模式下 `onboarding.ts` 会把 `VITE_UI_REACT_URL`（如 `http://localhost:5174`）写入 `gateway.controlUi.allowedOrigins`。

子进程崩溃且非 intentional stop 时，主进程 `webContents.send("gateway:crashed", …)`。

---

## 正常启动日志序列（打包，有残留）

便于对照 `electron-main.log`（默认只记 warn/error 与关键里程碑；`BOSSIM_LOG_VERBOSE=1` 可恢复完整 info）：

```
[gateway][spawn-gateway] port=18789 force=true …
[gateway][spawned] pid=… port=18789
[gateway:stdout] … listening on ws://127.0.0.1:18789 …   # 旧版
# 或
[gateway:stderr] … http server listening …                 # 当前常见
[gateway][ready] port=18789
[startup] gateway started
[startup] ready elapsed=…ms
[main] startup complete gateway=true port=18789 …
```

**不应出现**（修复后）：

- 启动后立即 `reuse-gateway`（打包）
- `[ready]` 仅隔 2ms 且无 `listening on` 子进程日志
- UI `hello-ok` 后马上 `1006`，且随后子进程 `force: killed pid …`（杀的是旧 PID）

---

## 退出再开（打包，正常）

```
[gateway][stop] status="stopping" pid=…
… 新 Bossim 进程 …
[gateway][pre-free-port] status="already-free"
[gateway][spawned] pid=…（新 PID）
… listening on … (同一新 PID)
[main] Gateway 启动成功
[renderer] hello-ok（无 1006）
```

---

## 故障排查

| 现象 | 可能原因 | 建议 |
|------|----------|------|
| `Gateway 未能在 …ms 内就绪` | 冷启动超时、配置无效、插件加载失败 | 查 `[gateway:stderr]`、`/tmp/openclaw/openclaw-*.log` |
| `子进程已退出` + stderr | lock 冲突、端口占用、配置校验失败 | 同上；手动 `lsof -i :18789` / `netstat` |
| UI `1006` 反复重连 | 旧逻辑误 reuse；或 Gateway 未 listening | 确认日志有 `pre-free-port` + 就绪日志在 `ready` 前 |
| UI `pairing required` 后无法连接 | 主进程未批准 device pairing | 查 `[device-pairing] approved`；手动 `openclaw devices approve --latest` |
| `[device-pairing] auto-approve failed: missing scope` | pairing RPC 用了 UI client 导致 scopes 被清空 | 应使用 `gateway-client`/`backend`（见 `device-pairing.ts`） |
| 退出再连不上 | 旧版 reuse 残留 Gateway | 确认无 `reuse-gateway`；应有 `spawn-gateway` |
| `Missing Control UI assets` | 打包未含 `dist/control-ui` | 预期内；UI 用 `control-ui-react`，不影响 WS |
| `allowedOrigins` 列表变长 | 旧版每次启动只追加不清理 | 现已 prune 陈旧 `127.0.0.1` 静态端口；可手动删掉历史项后重启一次 |

手动检查端口：

```bash
# macOS
lsof -nP -iTCP:18789 -sTCP:LISTEN
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:18789/health

# Windows
netstat -ano | findstr :18789
```

---

## 相关 IPC 与配置修补

| IPC / 函数 | 说明 |
|------------|------|
| `gateway:info` | 返回当前 port、token、wsUrl |
| `gateway:approveDevicePairing` | 批准 pending device pairing（可选 `requestId`） |
| `gateway:restart` / `gateway:manual-restart` | 见上文 |
| `patchConfigForElectron()` | 启动前写 `controlUi.allowedOrigins`、处理 `plugins.slots.memory=none` 等 |

---

## 修改本逻辑时的注意点

1. **不要**在打包路径恢复「仅 `/health` 就 ready」且不要求 `sawListening`——会复现退出再开闪断。
2. **`preFreeGatewayPort` 必须在 spawn 之前**；不要只依赖子进程内 `--force`（异步晚于第一次 `/health`）。
3. **打包不要 reuse 外部 Gateway**；开发 reuse 时 `stopGateway` 不得杀死 CLI 实例。
4. 若调整就绪探测，优先继续用 **`/health`**，不要用 `GET /`（Control UI 缺失时 503）。
5. Windows 退出务必保留 **taskkill 进程树**，否则易产生孤儿 `node.exe`。
6. 改超时请区分平台：`GATEWAY_READY_TIMEOUT_MS` vs `GATEWAY_READY_TIMEOUT_MS_WIN`。

---

## 代码索引（快速跳转）

| 符号 | 文件 |
|------|------|
| `startGateway` | `gateway.ts` |
| `spawnGateway` | `gateway.ts` |
| `preFreeGatewayPort` | `gateway.ts` |
| `waitForGatewayReady` | `gateway.ts` |
| `noteChildGatewayReadySignal` | `gateway-ready-signal.ts` |
| `approvePendingControlUiDevicePairing` | `device-pairing.ts` |
| `stopGateway` / `restartGateway` | `gateway.ts` |
| `warmLoginShellEnv` | `gateway.ts` |
| `mergeElectronControlUiAllowedOrigins` | `control-ui-origins.ts` |
| `patchConfigForElectron` | `index.ts` |
| `before-quit` → `stopGateway` | `index.ts` |

---

## 延伸阅读

- 打包与 Node 捆绑：`apps/electron/docs/build-pipeline.md`
- Gateway CLI 与健康检查：`docs/cli/health.md`
- 安全与 loopback：`apps/electron/docs/security-notes.md`
