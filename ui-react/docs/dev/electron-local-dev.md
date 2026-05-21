# Electron 本地调试流程与配置

本文梳理 **Bossim（OpenClaw Electron 桌面端）** 与 **ui-react** 在本地开发时的启动链路、环境变量、Gateway 连接与 device pairing 行为。实现分布在 `apps/electron/` 与 `ui-react/`。

---

## 前置条件

- **Node** 22.19+（推荐 24），仓库根目录已 `pnpm install`
- 首次使用需完成 onboarding，或已有 `~/.openclaw/openclaw.json`（含 `gateway.auth.token`）
- macOS 开发 Electron 时，首次可能需接受代码签名 / 安全提示

---

## 三种本地调试模式

| 模式 | 命令 | UI 加载来源 | Gateway | 适用场景 |
|------|------|-------------|---------|----------|
| **Electron + Vite HMR**（推荐） | 仓库根：`pnpm electron:dev` | `http://localhost:5174` | Electron 主进程 spawn 或复用已有实例 | 日常 UI + 桌面能力联调 |
| **纯浏览器 Vite** | 仓库根：`pnpm ui:react:dev` | `http://localhost:5174` | 需自行启动 Gateway（CLI 或 Electron 外进程） | 只改 React UI、不用 Electron IPC |
| **Electron + 静态产物** | 仓库根：`pnpm electron:dev:static` | 内嵌 `dist/control-ui-react` 或 `file://` | 同 Electron 模式 | 接近打包行为、验证非 HMR 路径 |

### 推荐：Electron + Vite HMR

```bash
# 仓库根目录
pnpm electron:dev
```

等价于：

1. `pnpm ui:react:build` — 先构建一次 ui-react（供 fallback / 部分入口）
2. `pnpm --filter openclaw-electron dev` — 并行启动：
   - `tsdown --watch`：编译 Electron 主进程 / preload
   - `pnpm --filter openclaw-control-ui-react dev`：Vite 监听 **5174**
   - `sleep 6 && VITE_UI_REACT_URL=http://localhost:5174 electron .`：约 6 秒后打开 Electron 窗口

渲染进程从 Vite dev server 加载，支持 HMR；主进程负责 Gateway 子进程、IPC、OAuth、device pairing 等。

### 纯浏览器（无 Electron 壳）

```bash
# 终端 1：Gateway（若尚未运行）
pnpm openclaw gateway run

# 终端 2：Vite
pnpm ui:react:dev
```

浏览器打开 `http://localhost:5174`。需配置 `ui-react/.env.local`（见下文），否则 WebSocket 认证与 device pairing 会失败。

### Electron + 静态产物

```bash
pnpm ui:react:build   # 若 dist 过旧
pnpm electron:dev:static
```

不设 `VITE_UI_REACT_URL` 时，Electron 从 `apps/electron/dist/control-ui-react`（或打包目录）经内嵌 HTTP 静态服务加载，**无 HMR**。

---

## 架构概览

```
┌─────────────────────────────────────────────────────────────────┐
│  Electron 主进程 (apps/electron/src/main/)                      │
│  · spawn / reuse Gateway 子进程 (openclaw.mjs gateway run)       │
│  · patchConfigForElectron → controlUi.allowedOrigins             │
│  · loadRendererPage → ?gatewayUrl=…&token=…                      │
│  · IPC: gateway:* / onboarding:* / startup:*                     │
└───────────────┬───────────────────────────────┬─────────────────┘
                │ spawn                         │ preload bridge
                ▼                               ▼
┌───────────────────────────┐     ┌─────────────────────────────┐
│  Gateway 子进程            │     │  ui-react 渲染进程           │
│  ws://127.0.0.1:<port>    │◄───WS│  Vite :5174 或 静态 HTTP    │
│  HTTP /health             │     │  settings.store / useGateway │
└───────────────────────────┘     └─────────────────────────────┘
```

**开发模式与打包模式的关键差异**（Gateway）：

| 行为 | 开发 `electron .` | 打包 Bossim |
|------|-------------------|-------------|
| 端口上已有健康 Gateway | **可复用**（不 spawn） | **不复用**，始终 spawn + `--force` |
| 退出应用时 stop Gateway | 复用外部实例时 **不** kill | 始终 kill 子进程 |

详见 `apps/electron/docs/gateway-lifecycle.md`。

---

## 端口与 URL 约定

| 服务 | 默认 | 说明 |
|------|------|------|
| Vite dev server | **5174** | `ui-react/vite.config.ts`，`strictPort: true` |
| Gateway WebSocket / HTTP | **18789** | 可被 `~/.openclaw/openclaw.json` 的 `gateway.port` 覆盖 |
| Electron 内嵌静态 UI | 随机 `127.0.0.1:<ephemeral>` | 仅打包或 `dev:static`；每次启动端口可能变化 |

**ui-react 如何解析 Gateway URL**（`ui-react/src/store/settings.store.ts`）：

1. **Vite dev（`localhost:5174`）**：直连 `ws://127.0.0.1:${VITE_GATEWAY_PORT}`，默认 `18789`；不经过 Vite 代理，避免 WebSocket EPIPE。
2. **Electron 注入 query**：`?gatewayUrl=ws://127.0.0.1:…&token=…`，读完后从地址栏 strip，并写入 `localStorage`（`openclaw.control.electron-gateway-url.v1`）供刷新恢复。
3. **Electron 静态 HTTP（`http://127.0.0.1:<staticPort>`）**：不用 `location.host` 作 WS 地址，优先 persisted gateway URL，否则 `ws://127.0.0.1:18789`。
4. **其他 HTTP(S) 部署**：`ws(s)://<location.host>`。

---

## 环境配置

### `ui-react/.env.local`（git-ignored）

用于 **Vite dev** 下浏览器直连 Gateway，以及 Electron dev 下 token 优先级覆盖。

```bash
# 从 ~/.openclaw/openclaw.json 读取 gateway.auth.token
VITE_GATEWAY_TOKEN=<your-gateway-token>

# 可选：Gateway 端口与 Electron/CLI 不一致时
# VITE_GATEWAY_PORT=18790
```

获取 token 示例：

```bash
node -e "const c=require(require('os').homedir()+'/.openclaw/openclaw.json'); console.log(c.gateway?.auth?.token||'')"
```

`vite.config.ts` 在 **DEV** 时将上述变量 bake 进 `import.meta.env`；**生产 build 不会**带入 token。

### 进程级环境变量

| 变量 | 设置方 | 作用 |
|------|--------|------|
| `VITE_UI_REACT_URL` | `electron:dev` 脚本 | 例如 `http://localhost:5174`；Electron 从 Vite 加载而非静态产物 |
| `VITE_GATEWAY_PORT` | 启动 Vite 前 export | 与 `vite.config.ts` define 同步；默认 `18789` |
| `VITE_GATEWAY_TOKEN` | `.env.local` 或 shell | 开发态 Gateway 认证 |
| `OPENCLAW_CONFIG_DIR` | 可选 | 覆盖 `~/.openclaw` 配置目录 |
| `BOSSIM_LOG_VERBOSE=1` | 可选 | 主进程 routine info 写入 `~/.openclaw/logs/electron-main.log` |
| `OPENCLAW_ELECTRON_LOG_VERBOSE=1` | 可选 | 同上 |

---

## Gateway Token 优先级（开发）

`resolveGatewayToken()`（`settings.store.ts`）在 **`localhost:5174` + DEV** 时：

**纯浏览器**（无 `window.electronBridge`）：

```
VITE_GATEWAY_TOKEN（.env.local）
  > URL ?token=
  > sessionStorage（按 gatewayUrl scope）
```

**Electron + Vite dev**（有 `electronBridge.isElectron`）：

```
URL ?token=（主进程注入，含 onboarding 后的 config token）
  > sessionStorage
  > VITE_GATEWAY_TOKEN（兜底）
```

`.env.local` 里的 token **不会**覆盖 Electron 注入的 token。若只在浏览器里跑 `pnpm ui:react:dev`，才需要配置 `.env.local`。

---

## Device pairing（Control UI）

Gateway 要求 Control UI 携带 device identity 并完成 pairing。本地 loopback 场景会自动批准：

### Electron 内

1. 主进程 `device-pairing.ts`：以 operator token 连接，调用 `device.pair.approve`。
2. 渲染进程 `use-gateway.ts`：WS 关闭原因含 `pairing required … (requestId: …)` 时，经 `window.electronBridge.approveDevicePairing(requestId)` 触发 IPC，成功后重连。
3. Onboarding 完成后主进程也会后台 `approvePendingControlUiDevicePairing`。

### 纯浏览器 Vite dev

无 Electron 主进程时，走 Vite 中间件：

- 路由：`POST /__openclaw/dev/approve-device-pairing`（仅 loopback）
- 实现：`ui-react/vite-dev-device-pairing-plugin.ts` + `vite-dev-device-pairing-rpc.ts`
- 前端：`approveDevicePairingInDev()`（`dev-device-pairing.ts`）

Token 解析顺序：请求 body → `VITE_GATEWAY_TOKEN` → `~/.openclaw/openclaw.json`。

---

## `controlUi.allowedOrigins`

Electron 启动前 `patchConfigForElectron()` 会合并 `gateway.controlUi.allowedOrigins`：

- 保留 Gateway 自身 loopback、`file://`、用户自定义 origin
- 开发时加入 `VITE_UI_REACT_URL` 的 origin（如 `http://localhost:5174`）
- 清理历次 Electron 静态 server 的 **陈旧** `http://127.0.0.1:<旧端口>`

若浏览器 dev 报 origin 相关 WS 错误，确认 `openclaw.json` 中含 `http://localhost:5174`，或重启一次 `pnpm electron:dev` 让 patch 写入。

---

## 启动后验证

```bash
# Gateway 健康检查
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:18789/health

# 端口占用（macOS）
lsof -nP -iTCP:18789 -sTCP:LISTEN
lsof -nP -iTCP:5174 -sTCP:LISTEN
```

渲染进程控制台应出现：

```
[gateway] connect() using url=ws://127.0.0.1:18789 token=…
[gateway] hello-ok …
```

Electron 主进程里程碑见 `~/.openclaw/logs/electron-main.log`（`[gateway][ready]`、`startup complete` 等）。

---

## 调试技巧

### DevTools

- Electron 窗口：`View → Toggle Developer Tools` 或系统快捷键
- 纯浏览器：Chrome DevTools

### 日志位置

| 日志 | 路径 |
|------|------|
| Electron 主进程 | `~/.openclaw/logs/electron-main.log` |
| Onboarding / OAuth | `~/.openclaw/electron-onboarding.log` |
| Gateway 子进程 | 同上 + `/tmp/openclaw/openclaw-*.log` |
| ui-react Gateway hook | 浏览器控制台 `[gateway]` 前缀 |

### Chat 模块额外开关

见 [../chat/testing-and-debugging.md](../chat/testing-and-debugging.md)（`openclaw.chatBridge.debug` 等）。

### Preload 暴露的 API

渲染进程通过 `window.electronBridge` 访问（`apps/electron/src/preload/index.ts`），常用：

- `getGatewayInfo()` / `restartGateway()` / `manualGatewayRestart()`
- `approveDevicePairing(requestId?)`
- `onGatewayCrashed` / `onGatewayRestarted`
- Onboarding：`saveOnboardingConfig`、`notifyOnboardingComplete`、OAuth 系列

类型探测：`ui-react/src/utils/electron-env.ts` 的 `getElectronBridge()`。

---

## 常见问题

| 现象 | 可能原因 | 处理 |
|------|----------|------|
| `5174` 端口被占用 | 旧 Vite 未退出 | `lsof -i :5174` 后结束进程，或改 vite port（需同步文档与 allowedOrigins） |
| WS 401 / token 错误 | stale `.env.local` token 覆盖了 Electron 注入 token（已修复）；或 sessionStorage 残留 | Electron dev 下可删 `ui-react/.env.local` 的 `VITE_GATEWAY_TOKEN`；DevTools → Application → Clear site data 后重启 |
| `pairing required` 不重连 | 浏览器 dev 未配 token / 中间件失败 | 检查 `.env.local`；Network 里看 `POST /__openclaw/dev/approve-device-pairing` |
| Electron 白屏 / did-fail-load | Vite 未就绪（6s 内未起来） | 等 Vite 就绪后 Reload；或先 `pnpm ui:react:dev` 再单独 `electron .` |
| Gateway 启动超时 | 插件/配置错误 | 查 `[gateway:stderr]`、`openclaw doctor` |
| dev 改了 `.env.local` 未生效 | Vite 需重启 | 重启 `pnpm ui:react:dev` 或 `electron:dev`；HMR 不会重读 env |
| 复用了 CLI Gateway 但 UI 连不上 | 端口/token 与配置不一致 | `pnpm openclaw gateway info` 或查 `openclaw.json`；对齐 `VITE_GATEWAY_PORT` / token |

手动批准 pairing（兜底）：

```bash
pnpm openclaw devices approve --latest
```

---

## 源码索引

| 主题 | 路径 |
|------|------|
| 根脚本 | `package.json` → `electron:dev` / `ui:react:dev` |
| Electron dev 并发 | `apps/electron/package.json` → `dev` |
| 窗口加载与 query 注入 | `apps/electron/src/main/window.ts` |
| Gateway spawn / reuse | `apps/electron/src/main/gateway.ts` |
| 启动 pipeline | `apps/electron/src/main/startup.ts` |
| allowedOrigins | `apps/electron/src/main/control-ui-origins.ts` |
| Vite 配置 | `ui-react/vite.config.ts` |
| 设置与 token | `ui-react/src/store/settings.store.ts` |
| WS 连接与 pairing | `ui-react/src/hooks/gateway/use-gateway.ts` |
| 浏览器 dev pairing | `ui-react/vite-dev-device-pairing-plugin.ts` |

---

## 延伸阅读

- Gateway 生命周期（spawn、preFree、reuse）：`apps/electron/docs/gateway-lifecycle.md`
- Gateway 重启 UI：`ui-react/docs/gateway-restart-implementaion.md`
- Chat 与 Gateway 适配：`ui-react/docs/chat/gateway-integration.md`
