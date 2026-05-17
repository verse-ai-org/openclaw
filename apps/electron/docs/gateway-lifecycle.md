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

`main()` 在 `app.whenReady()` 之后大致按以下顺序执行（见 `index.ts`）：

```
app.whenReady()
  → generateToken()                    // 无配置 token 时的会话备用
  → warmLoginShellEnv()                // macOS：读 login shell 环境变量
  → startStaticServer(control-ui-react) // 仅打包：随机端口托管 UI
  → patchConfigForElectron(staticPort)  // 写 allowedOrigins 等
  → startGateway({ token: sessionToken })
  → onGatewayCrash(...)                 // 子进程意外退出时通知渲染进程
  → configureSession / createWindow / loadRendererPage
```

Gateway 启动失败**不会**阻止窗口创建；UI 会尝试连接但可能连不上（`gatewayStarted=false`）。

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
2. 子进程 stdout 已出现 `listening on ws://`（`childWaitState.sawListening`），避免误判残留进程。

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

- **staticPort**：每次启动随机（仅打包）；会追加到 `gateway.controlUi.allowedOrigins`。
- **token**：有配置用 `gateway.auth.token`；无配置用当次 `sessionToken`（向导写入后应与文件一致）。

`getGatewayToken()` 在 reuse 外部 Gateway 时会从磁盘重新读 token；自管子进程用内存缓存。

子进程崩溃且非 intentional stop 时，主进程 `webContents.send("gateway:crashed", …)`。

---

## 正常启动日志序列（打包，有残留）

便于对照 `electron-main.log`：

```
[gateway][start-gateway] phase="begin"
[gateway][replace-stale-gateway]     # 可选：端口上仍有旧实例
[gateway][spawn-gateway] force=true reason="packaged-managed"
[gateway][pre-free-port] status="begin" pids="…"
[gateway][pre-free-port] status="done"
[gateway][spawn] …
[gateway][spawned] pid=…
[gateway][wait-ready] …
[gateway:stdout] … listening on ws://127.0.0.1:18789 … (PID …)
[gateway][ready] port=18789
[main] Gateway 启动成功
[renderer] ws open → hello-ok
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
| UI `1006` 反复重连 | 旧逻辑误 reuse；或 Gateway 未 listening | 确认日志有 `pre-free-port` + `listening` 在 `ready` 前 |
| 退出再连不上 | 旧版 reuse 残留 Gateway | 确认无 `reuse-gateway`；应有 `spawn-gateway` |
| `Missing Control UI assets` | 打包未含 `dist/control-ui` | 预期内；UI 用 `control-ui-react`，不影响 WS |
| `allowedOrigins` 列表很长 | 每次静态端口追加 | 无害；可考虑后续去重逻辑 |

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
| `stopGateway` / `restartGateway` | `gateway.ts` |
| `warmLoginShellEnv` | `gateway.ts` |
| `patchConfigForElectron` | `index.ts` |
| `before-quit` → `stopGateway` | `index.ts` |

---

## 延伸阅读

- 打包与 Node 捆绑：`apps/electron/docs/build-pipeline.md`
- Gateway CLI 与健康检查：`docs/cli/health.md`
- 安全与 loopback：`apps/electron/docs/security-notes.md`
