# OpenClaw 项目深度架构分析

> 版本：2026.3.8 | 分析日期：2026-03-09

---

## 目录

1. [项目概览](#1-项目概览)
2. [整体架构设计](#2-整体架构设计)
3. [技术栈说明](#3-技术栈说明)
4. [核心模块分析](#4-核心模块分析)
   - 4.1 [启动与入口层](#41-启动与入口层)
   - 4.2 [Gateway 服务器层](#42-gateway-服务器层)
   - 4.3 [Agent 智能体引擎](#43-agent-智能体引擎)
   - 4.4 [Channel 消息通道层](#44-channel-消息通道层)
   - 4.5 [Plugin 插件系统](#45-plugin-插件系统)
   - 4.6 [Config 配置系统](#46-config-配置系统)
   - 4.7 [Memory 记忆系统](#47-memory-记忆系统)
   - 4.8 [Canvas 可视化工作区](#48-canvas-可视化工作区)
   - 4.9 [Sandbox 安全沙箱](#49-sandbox-安全沙箱)
5. [关键数据流与控制流](#5-关键数据流与控制流)
6. [配置文件与工具链](#6-配置文件与工具链)
7. [跨平台客户端架构](#7-跨平台客户端架构)
8. [安全设计](#8-安全设计)
9. [技术选型决策分析](#9-技术选型决策分析)
10. [总结](#10-总结)

---

## 1. 项目概览

**OpenClaw** 是一个运行在用户自有设备上的**个人 AI 助理网关（Gateway）**，核心定位是"个人专属 AI，多通道统一入口"。其 `package.json` 描述为：

> "Multi-channel AI gateway with extensible messaging integrations"

**核心价值主张：**
- 用户完全掌控自己的 AI 数据与会话，不依赖第三方云服务
- 支持超过 20 种消息平台接入（WhatsApp、Telegram、Slack、Discord、Signal、iMessage、飞书、Line 等）
- 可接入任意 AI 模型提供商（OpenAI、Anthropic、Google Gemini、AWS Bedrock、Ollama 本地模型等）
- 通过插件 SDK 提供高度可扩展性

代码路径：`package.json`（`src/entry.ts`、`src/index.ts` 为两个入口点）

---

## 2. 整体架构设计

### 2.1 分层架构图

```
┌─────────────────────────────────────────────────────────┐
│                  跨平台客户端层                            │
│  iOS App  │  Android App  │  macOS App  │  Web UI        │
└─────────────────────────┬───────────────────────────────┘
                          │ WebSocket / HTTP
┌─────────────────────────▼───────────────────────────────┐
│                 Gateway 服务器层 (src/gateway/)           │
│  HTTP Server │ WebSocket │ Hooks │ OpenAI-compat API     │
│  认证鉴权    │ 控制面板   │ Cron  │ 配置热重载             │
└────────────┬────────────┬──────────────────────────────┘
             │            │
┌────────────▼──┐  ┌──────▼──────────────────────────────┐
│  Channel 层   │  │         Agent 引擎层 (src/agents/)    │
│  src/channels │  │  Workspace │ Session │ SubagentRegistry│
│  src/telegram │  │  ModelSelect │ SystemPrompt           │
│  src/slack    │  │  pi-embedded-runner (Claude Pi SDK)   │
│  src/discord  │  │  Bash Tools │ Sandbox                 │
│  src/signal   │  └─────────────────────────────────────┘
│  src/web      │
└───────────────┘
┌─────────────────────────────────────────────────────────┐
│                  基础设施层 (src/infra/)                   │
│  env │ ports │ errors │ binaries │ heartbeat │ restart   │
│  secrets │ security │ logging │ process                  │
└─────────────────────────────────────────────────────────┘
```

### 2.2 核心运行模式

OpenClaw 有两种核心运行模式：

| 模式 | 命令 | 说明 |
|------|------|------|
| **Gateway 模式** | `openclaw gateway run` | 启动完整网关服务，接入所有渠道 |
| **Agent 模式** | `openclaw agent --message "..."` | 单次 Agent 调用，可用于脚本/自动化 |
| **TUI 模式** | `openclaw tui` | 终端交互界面 |
| **CLI 模式** | `openclaw <command>` | 管理配置、渠道、会话等 |

---

## 3. 技术栈说明

### 3.1 运行时与语言

| 技术 | 版本要求 | 选型原因 |
|------|---------|---------|
| **Node.js** | >=22.12.0 | 长期支持版，支持 `enableCompileCache()`，原生 ESM |
| **TypeScript** | ^5.9.3 | 严格类型安全，避免运行时类型错误 |
| **Bun** | 可选 | 更快的 TS 执行速度，用于脚本和测试 |

代码路径：`src/entry.ts` 第 3 行调用 `enableCompileCache()` 启用 Node.js 编译缓存加速启动

### 3.2 核心框架与依赖

#### AI 引擎集成

| 依赖 | 作用 |
|------|------|
| `@mariozechner/pi-agent-core` v0.57.1 | Claude Pi Agent 核心 SDK（嵌入式 AI 引擎） |
| `@mariozechner/pi-ai` v0.57.1 | Pi AI 模型接口 |
| `@mariozechner/pi-coding-agent` v0.57.1 | 编程 Agent 能力 |
| `@mariozechner/pi-tui` v0.57.1 | 终端 UI（TUI 模式） |

#### 消息平台 SDK

| 依赖 | 对应平台 |
|------|---------|
| `grammy` + `@grammyjs/runner` | Telegram Bot API |
| `@slack/bolt` + `@slack/web-api` | Slack |
| `@whiskeysockets/baileys` | WhatsApp Web Protocol |
| `@discordjs/voice` + `discord-api-types` | Discord |
| `@larksuiteoapi/node-sdk` | 飞书/Lark |
| `@line/bot-sdk` | Line |

#### 服务器与网络

| 依赖 | 作用 |
|------|------|
| `express` v5 | HTTP 服务器（Gateway Web 层） |
| `ws` | WebSocket 服务（实时通信） |
| `undici` | 高性能 HTTP 客户端 |

#### 数据与 Schema

| 依赖 | 作用 |
|------|------|
| `@sinclair/typebox` | JSON Schema 类型验证（工具输入 Schema） |
| `zod` v4 | 运行时数据验证 |
| `yaml` / `json5` | 配置文件解析 |
| `sqlite-vec` | SQLite 向量搜索（Memory 子系统） |

#### 构建工具链

| 工具 | 作用 |
|------|------|
| `tsdown` | TypeScript 打包（替代 esbuild/rollup，生成 `dist/`） |
| `tsx` | 快速执行 TS 脚本（用于构建脚本） |
| `vitest` | 单元/集成/E2E 测试框架 |
| `oxlint` + `oxfmt` | Rust 实现的超快速 Lint + 格式化 |
| `pnpm` | Monorepo 包管理器 |

---

## 4. 核心模块分析

### 4.1 启动与入口层

OpenClaw 有**两个入口文件**，各有不同职责：

#### `src/entry.ts` — 生产入口

这是 npm 包发布后用户实际执行的入口（`openclaw.mjs` wrapper 调用它）。关键逻辑：

1. **Respawn 机制**：检测是否需要添加 `--disable-warning=ExperimentalWarning` Node 标志，如需则重新 spawn 子进程（`src/entry.ts:95-123`）
2. **进程标题设置**：`process.title = "openclaw"`（便于 `ps` 查找进程）
3. **编译缓存**：调用 `enableCompileCache()` 加速后续启动
4. **快速路径优化**：`--version` 和 `--help` 命令通过动态 import 延迟加载，避免加载整个 CLI 树
5. **Profile 支持**：通过 `OPENCLAW_PROFILE` 环境变量实现多配置隔离

#### `src/index.ts` — 开发/导出入口

作为 npm 包的主模块（`"main": "dist/index.js"`），同时也是开发时运行的入口。导出核心工具函数供插件和外部脚本使用，包括：`loadConfig`、`loadSessionStore`、`assertWebChannel` 等。

```
src/entry.ts → src/cli/run-main.js → src/cli/program.ts → Commander.js
```

### 4.2 Gateway 服务器层

Gateway 是整个系统的"大脑"，位于 `src/gateway/`，包含 **236 个文件**（截至分析时）。

#### 核心文件职责

| 文件 | 职责 |
|------|------|
| `server.impl.ts` | Gateway 主实现（1066 行），组装所有子系统 |
| `server-http.ts` | HTTP/WebSocket 服务器（843 行），所有入站请求路由 |
| `server-channels.ts` | 通道生命周期管理（458 行），管理渠道的启停和重连 |
| `server-chat.ts` | Agent 事件处理（649 行），将 AI 回复推送给渠道 |
| `server-cron.ts` | 定时任务服务（846 行） |
| `server-methods.ts` | WebSocket RPC 方法注册 |
| `hooks.ts` | Webhook 入站路由（410 行） |
| `auth.ts` | 网关认证逻辑（15.6KB） |
| `credentials.ts` | 凭证管理（11.6KB） |
| `session-utils.ts` | 会话持久化工具（27.8KB） |
| `config-reload.ts` | 配置热重载（7.2KB） |

#### Gateway 启动流程（`server.impl.ts`）

```
1. loadConfig() → 读取 ~/.openclaw/config.yml
2. migrateLegacyConfig() → 迁移旧版配置
3. loadGatewayPlugins() → 加载所有 extensions/* 插件
4. createChannelManager() → 初始化通道管理器
5. startGatewayDiscovery() → mDNS 服务发现（@homebridge/ciao）
6. startGatewayMaintenanceTimers() → 心跳 & 清理定时器
7. startGatewayTailscaleExposure() → Tailscale 网络暴露
8. initSubagentRegistry() → 子 Agent 注册表
9. registerSkillsChangeListener() → 技能文件监听
10. scheduleGatewayUpdateCheck() → 版本更新检查
```

#### HTTP 路由架构（`server-http.ts`）

Gateway HTTP 服务器处理多类请求：

```
GET  /                          → 控制面板 UI
GET  /canvas/*                  → Canvas 可视化工作区
POST /hooks/*                   → Webhook 触发 Agent
POST /v1/chat/completions       → OpenAI 兼容 API（openai-http.ts）
POST /v1/responses              → OpenAI Responses API（openresponses-http.ts）
GET  /ws                        → WebSocket 连接（客户端实时通信）
GET  /probe                     → 健康检测
```

#### 通道管理器（`server-channels.ts`）

实现了带**指数退避重连**策略的通道生命周期管理：

```typescript
const CHANNEL_RESTART_POLICY: BackoffPolicy = {
  initialMs: 5_000,     // 初始重连等待 5 秒
  maxMs: 5 * 60_000,    // 最大等待 5 分钟
  factor: 2,             // 指数增长因子
  jitter: 0.1,           // 10% 随机抖动
};
const MAX_RESTART_ATTEMPTS = 10;  // 最多重试 10 次
```

代码路径：`src/gateway/server-channels.ts:13-19`

### 4.3 Agent 智能体引擎

Agent 引擎是 OpenClaw 的核心 AI 能力层，位于 `src/agents/`，包含 **536 个文件**。

#### 4.3.1 Workspace（工作空间）

每个 Agent 有独立的工作空间目录，默认位于 `~/.openclaw/workspace/`。

工作空间关键文件（`src/agents/workspace.ts:25-33`）：

| 文件名 | 作用 |
|--------|------|
| `AGENTS.md` | Agent 行为规范描述 |
| `SOUL.md` | Agent 人格定义 |
| `TOOLS.md` | 工具使用说明 |
| `IDENTITY.md` | Agent 身份信息 |
| `USER.md` | 用户信息 |
| `HEARTBEAT.md` | 心跳检测配置 |
| `BOOTSTRAP.md` | 启动引导文件 |
| `MEMORY.md` | 长期记忆文件 |
| `BOOT.md` | 网关启动时执行的指令 |

文件读取实现了**边界安全检查**（防止路径穿越）和**inode 级缓存**（避免频繁 I/O）：

```typescript
// src/agents/workspace.ts:52-54
function workspaceFileIdentity(stat: syncFs.Stats, canonicalPath: string): string {
  return `${canonicalPath}|${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeMs}`;
}
```

#### 4.3.2 Pi Embedded Runner（AI 推理引擎）

OpenClaw 使用 `@mariozechner/pi-agent-core` 作为核心 AI 推理引擎，通过"嵌入式运行"模式在进程内直接调用：

```
src/agents/pi-embedded-runner.ts
  └── pi-embedded-runner/
      ├── run.ts        → runEmbeddedPiAgent() 主入口
      ├── runs.ts       → 运行状态管理（queueEmbeddedPiMessage 等）
      ├── history.ts    → 对话历史管理（limitHistoryTurns）
      ├── compact.ts    → 上下文压缩（compactEmbeddedPiSession）
      ├── system-prompt.ts → 系统提示词构建
      └── types.ts      → 类型定义
```

核心流程：消息入队 → `runEmbeddedPiAgent()` → 订阅流式输出 → `pi-embedded-subscribe.ts` 分块推送

#### 4.3.3 SubagentRegistry（子 Agent 注册表）

SubagentRegistry 是 OpenClaw **多 Agent 协同**的核心，管理所有子 Agent 的生命周期：

代码路径：`src/agents/subagent-registry.ts`（1464 行）

关键常量（`subagent-registry.ts:70-96`）：

```typescript
const SUBAGENT_ANNOUNCE_TIMEOUT_MS = 120_000;      // 结果播报超时：2分钟
const MAX_ANNOUNCE_RETRY_COUNT = 3;                 // 最大重试次数
const ANNOUNCE_EXPIRY_MS = 5 * 60_000;             // 非完成播报过期：5分钟
const ANNOUNCE_COMPLETION_HARD_EXPIRY_MS = 30 * 60_000; // 完成等待上限：30分钟
const LIFECYCLE_ERROR_RETRY_GRACE_MS = 15_000;     // 错误重试宽限期：15秒
```

子 Agent 的运行记录（`SubagentRunRecord`）持久化到磁盘，网关重启后可恢复状态。

#### 4.3.4 ModelSelection（模型选择）

模型选择层（`src/agents/model-selection.ts`，668 行）负责：

1. **Provider ID 标准化**：统一处理各种别名
   ```typescript
   // z.ai、z-ai → zai
   // bytedance、doubao → volcengine
   // bedrock、aws-bedrock → amazon-bedrock
   ```

2. **模型别名解析**：支持简短别名（如 `sonnet-4.5` → `claude-sonnet-4-5`）

3. **ThinkLevel 支持**：`"off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "adaptive"`

4. **自动故障转移**（`model-fallback.ts`，19.9KB）：支持多模型/Provider 按优先级故障转移

代码路径：`src/agents/model-selection.ts:18`

#### 4.3.5 SystemPrompt（系统提示词构建）

系统提示词由多个动态 Section 拼装（`src/agents/system-prompt.ts`，726 行）：

- **Skills Section**：扫描可用技能，引导 Agent 在回答前读取技能 Markdown 文件
- **Memory Recall Section**：引导 Agent 在回答前先搜索记忆
- **Authorized Senders Section**：注入授权用户身份（防止未授权访问）
- **Tooling Section**：工具使用规范
- **Workspace Section**：工作目录信息
- **Sandbox Section**：沙箱环境约束

支持三种 Prompt 模式：`"full"（主 Agent）`、`"minimal"（子 Agent）`、`"none"`

#### 4.3.6 Bash Tools（代码执行工具）

Agent 具备执行 Bash 命令的能力（`src/agents/bash-tools.exec.ts`，20.5KB）：

- **PTY 支持**：通过 `@lydell/node-pty` 实现伪终端，支持交互式程序
- **双执行路径**：
  - `bash-tools.exec-host-gateway.ts` — 在 Gateway 主机执行
  - `bash-tools.exec-host-node.ts` — 在 Node（移动端）执行
- **执行审批系统**（`exec-approval-manager.ts`）：高风险命令需要用户确认
- **进程注册表**（`bash-process-registry.ts`）：跟踪所有后台进程

### 4.4 Channel 消息通道层

#### 架构设计

通道层采用**插件注册**模式（`src/channels/plugins/`），所有通道（包括内置和扩展插件）都通过统一的 `ChannelPlugin` 接口注册。

内置通道（在 `src/` 下直接实现）：

| 目录 | 通道 | 依赖 |
|------|------|------|
| `src/telegram/` | Telegram | grammy |
| `src/slack/` | Slack | @slack/bolt |
| `src/discord/` | Discord | @discordjs/voice |
| `src/signal/` | Signal | 本地 Signal CLI |
| `src/imessage/` | iMessage | macOS 专属 |
| `src/web/` | WhatsApp Web | @whiskeysockets/baileys |
| `src/line/` | Line | @line/bot-sdk |

扩展通道（在 `extensions/` 下作为独立包）：MS Teams、Matrix、Feishu、Zalo、Nostr、IRC、Twitch、Discord、Mattermost、BlueBubbles 等

#### 通道生命周期（Dock 机制）

`src/channels/dock.ts`（20.9KB）定义了通道对接层（ChannelDock），每个通道通过 Dock 接入统一的消息路由。

消息接收流程：
```
外部平台 → Channel SDK Webhook/Poll → ChannelDock → message router
→ SubagentRegistry → runEmbeddedPiAgent → 流式回复 → Channel SDK → 外部平台
```

#### Allowlist（白名单系统）

`src/channels/allow-from.ts` 实现了基于发件人的白名单过滤，防止未授权消息触发 Agent。

#### 状态响应（Status Reactions）

`src/channels/status-reactions.ts`（10.9KB）实现了「正在输入」状态指示（Typing Indicator），在 AI 处理期间向用户显示状态 emoji 反馈。

### 4.5 Plugin 插件系统

#### 插件 SDK 设计

OpenClaw 提供了完整的插件 SDK（`src/plugin-sdk/`），支持：

- 注册新消息通道
- 注册自定义工具（供 Agent 调用）
- 注册 HTTP 路由（Webhook 回调）
- 注册 CLI 命令
- 注册钩子（Hooks）
- 注册 AI Provider

插件导出路径（`package.json:39-215`）：每个插件类型有独立的 TypeScript 类型入口：
```
openclaw/plugin-sdk          → 主 SDK
openclaw/plugin-sdk/telegram → Telegram 专属 SDK
openclaw/plugin-sdk/slack    → Slack 专属 SDK
...
```

#### 插件注册机制（`src/plugins/registry.ts`，625 行）

```typescript
// 插件注册类型
type PluginToolRegistration       // 工具注册
type PluginCliRegistration        // CLI 命令注册
type PluginHttpRouteRegistration  // HTTP 路由注册
type PluginChannelRegistration    // 渠道注册
type PluginProviderRegistration   // AI Provider 注册
```

插件安装时通过 `npm install --omit=dev` 在 `extensions/*/` 目录下安装，运行时通过 `jiti` 动态加载。

#### 插件 HTTP Auth 设计

插件路由支持多种认证模式（`OpenClawPluginHttpRouteAuth`）：
- `"none"` — 无需认证（公开 Webhook）
- `"gateway"` — 使用网关 Token
- `"plugin"` — 插件自定义 Token

### 4.6 Config 配置系统

#### 配置文件位置

| 文件 | 路径 | 作用 |
|------|------|------|
| 主配置 | `~/.openclaw/config.yml` | 全局配置 |
| Sessions | `~/.openclaw/sessions.json` | 会话映射 |
| Credentials | `~/.openclaw/credentials/` | 加密凭证存储 |
| Workspace | `~/.openclaw/workspace/` | Agent 工作目录 |

#### 配置模块结构（`src/config/`）

```
src/config/
├── config.ts       → 公共导出（re-export）
├── io.ts           → 配置读写（JSON5 格式）
├── types.ts        → OpenClawConfig 类型定义
├── validation.ts   → Zod/AJV Schema 校验
├── legacy-migrate.ts → 旧版配置迁移
├── paths.ts        → 路径常量
├── sessions/       → Session Key 解析和存储
└── runtime-overrides.ts → 运行时配置覆盖
```

#### 配置热重载

`src/gateway/config-reload.ts`（7.2KB）实现了基于 `chokidar` 的配置文件监听，配置变更后无需重启即可生效（`config-reload-plan.ts` 5.8KB 描述了重载策略）。

### 4.7 Memory 记忆系统

Memory 子系统（`src/memory/`，96 个文件）为 Agent 提供**向量化长期记忆**能力。

#### 架构设计

```
src/memory/
├── manager.ts            → MemoryManager 主管理器（25.7KB）
├── manager-sync-ops.ts   → 文件同步操作（39.8KB）
├── manager-embedding-ops.ts → 向量化操作（25.7KB）
├── qmd-manager.ts        → QMD 格式处理（68.8KB）
├── embeddings.ts         → 嵌入向量生成（11.1KB）
├── embeddings-openai.ts  → OpenAI Embedding API
├── embeddings-ollama.ts  → 本地 Ollama Embedding
├── embeddings-voyage.ts  → Voyage AI Embedding
├── sqlite-vec.ts         → sqlite-vec 向量数据库
└── hybrid.ts             → 混合检索（向量 + BM25）
```

#### 支持的 Embedding 提供商

| Provider | 文件 |
|---------|------|
| OpenAI | `embeddings-openai.ts` |
| Google Gemini | `embeddings-gemini.ts` |
| Ollama（本地） | `embeddings-ollama.ts` |
| Voyage AI | `embeddings-voyage.ts` |
| Mistral | `embeddings-mistral.ts` |

#### 向量检索策略

实现了**MMR（Maximal Marginal Relevance）**算法（`mmr.ts`，6.1KB），在相关性和多样性之间平衡检索结果，避免返回高度重复的记忆片段。

同时支持**批量 Embedding**（`batch-runner.ts`）以优化大量文件的向量化性能。

### 4.8 Canvas 可视化工作区

Canvas 是 OpenClaw 的**可视化 AI 工作区**，允许 Agent 在浏览器画布上渲染动态界面。

#### A2UI 渲染引擎（`src/canvas-host/a2ui.ts`，6.8KB）

A2UI（Agent-to-UI）是专为 AI Agent 设计的轻量 UI 渲染引擎：
- Agent 通过工具调用向 Canvas 发送渲染指令
- Canvas Server 通过 WebSocket 实时推送更新
- 前端使用 Lit 3 框架渲染动态组件

#### Canvas 服务器（`src/canvas-host/server.ts`，479 行）

```typescript
// Canvas 服务器提供：
// 1. 静态文件服务（HTML/JS/CSS）
// 2. WebSocket 连接（实时双向通信）
// 3. LiveReload（开发模式热重载，基于 chokidar）
// 4. 安全检查（URL 边界校验）
```

A2UI 的 bundle 哈希文件位于 `src/canvas-host/a2ui/.bundle.hash`，通过 `pnpm canvas:a2ui:bundle` 生成。

### 4.9 Sandbox 安全沙箱

Sandbox 子系统（`src/agents/sandbox/`，50 个文件）为 Agent 工具执行提供隔离环境。

#### 沙箱类型

1. **Docker 容器沙箱**（主要隔离方式）：
   - 默认镜像：`DEFAULT_SANDBOX_IMAGE`、`DEFAULT_SANDBOX_COMMON_IMAGE`
   - 浏览器沙箱：`DEFAULT_SANDBOX_BROWSER_IMAGE`
   - 通过 `buildSandboxCreateArgs()` 构建 Docker 创建参数

2. **工具策略沙箱**（`sandbox-tool-policy.ts`）：
   - 控制哪些工具在沙箱中可用
   - 防止沙箱内 Agent 访问宿主机敏感资源

#### 挂载路径管理（`sandbox-paths.ts`，6.2KB）

精确控制工作目录和文件的挂载策略，实现最小权限原则。

---

## 5. 关键数据流与控制流

### 5.1 消息处理完整流程

```
[外部用户] → [WhatsApp/Telegram/...] → [Channel SDK]
    ↓
[ChannelDock] → 消息解包 → 白名单检查 → SessionKey 解析
    ↓
[SubagentRegistry] → 查找或创建 SubagentRunRecord
    ↓
[runEmbeddedPiAgent()] → 加载 Workspace 文件 → 构建 SystemPrompt
    ↓
[@mariozechner/pi-agent-core] → 调用 AI 模型 API（OpenAI/Claude/Gemini）
    ↓ 流式响应
[pi-embedded-subscribe.ts] → 分块推送 → 避免消息过长分割
    ↓
[server-chat.ts] → Agent 事件处理 → 过滤心跳噪音
    ↓
[ChannelDock] → 格式化输出 → 发送回复
    ↓
[外部用户] ← [WhatsApp/Telegram/...]
```

### 5.2 Webhook Hook 触发流程

```
[外部服务 POST /hooks/xxx] → HTTP Server → hooks.ts
    ↓ Token 验证
[normalizeHookDispatchSessionKey()] → 解析目标 Agent
    ↓
[HookAgentDispatchPayload] → normalizeAgentPayload()
    ↓
[Gateway WebSocket 广播] → 推送给已连接客户端
    ↓
[runEmbeddedPiAgent()] → 处理 Hook 消息
```

### 5.3 Session Key 设计

Session Key 是 OpenClaw 路由系统的核心标识符（`src/routing/session-key.ts`）：

```
格式：agent:<agentId>:<sessionKey>
示例：agent:main:default
      agent:work:slack-thread-123
      cron:daily-check          ← 定时任务
      subagent:task-abc123      ← 子 Agent
```

规则：`/^[a-z0-9][a-z0-9_-]{0,63}$/i`（1-64 字符，字母数字下划线横线）

### 5.4 配置热重载流程

```
chokidar 监听 ~/.openclaw/config.yml
    ↓ 文件变更事件
config-reload.ts → readConfigFileSnapshot()
    ↓ 生成 ConfigReloadPlan
config-reload-plan.ts → 判断哪些子系统需要重启
    ↓
- 通道变更 → 重启受影响 Channel
- Model 变更 → 更新 ModelCatalog
- Plugin 变更 → 重新加载 Plugin
- Auth 变更 → 刷新认证状态
```

---

## 6. 配置文件与工具链

### 6.1 项目根配置文件

| 文件 | 作用 |
|------|------|
| `package.json` | npm 包声明、脚本、依赖 |
| `pnpm-workspace.yaml` | Monorepo 工作空间配置 |
| `tsconfig.json` | TypeScript 主配置 |
| `tsdown.config.ts` | 打包配置（生成 `dist/`） |
| `tsconfig.plugin-sdk.dts.json` | Plugin SDK 类型声明生成 |
| `.oxlintrc.json` | Oxlint 规则配置 |
| `.oxfmtrc.jsonc` | Oxfmt 格式化配置 |
| `vitest.config.ts` | 单元测试配置 |
| `vitest.gateway.config.ts` | Gateway 集成测试配置 |
| `vitest.e2e.config.ts` | E2E 测试配置 |
| `vitest.live.config.ts` | 实网测试配置 |
| `knip.config.ts` | 死代码检测配置 |
| `docker-compose.yml` | Docker 开发环境 |
| `Dockerfile` | 生产 Docker 镜像 |
| `fly.toml` | Fly.io 云部署配置 |
| `render.yaml` | Render.com 部署配置 |
| `appcast.xml` | macOS Sparkle 自动更新配置 |

### 6.2 脚本工具链（`scripts/`，25 个文件）

| 脚本 | 功能 |
|------|------|
| `tsdown-build.mjs` | 主构建（TypeScript → JS） |
| `test-parallel.mjs` | 并行测试执行器 |
| `bundle-a2ui.sh` | A2UI Canvas Bundle 打包 |
| `protocol-gen.ts` | 协议 Schema 生成（JSON） |
| `protocol-gen-swift.ts` | 协议 Schema 生成（Swift） |
| `write-build-info.ts` | 构建元信息注入 |
| `write-cli-startup-metadata.ts` | CLI 启动元数据 |
| `release-check.ts` | 发布前检查 |
| `sync-plugin-versions.ts` | 插件版本同步 |
| `generate-host-env-security-policy-swift.mjs` | 宿主环境安全策略生成 |
| `docs-i18n` | 文档国际化管道 |
| `package-mac-app.sh` | macOS 应用打包 |
| `committer` | 范围化 git commit 工具 |

### 6.3 Lint 自定义规则（`scripts/check-*.mjs`）

OpenClaw 有多条自定义架构 Lint 规则：

| 规则脚本 | 检查内容 |
|---------|---------|
| `check-ingress-agent-owner-context.mjs` | 入站消息必须携带 owner context |
| `check-no-register-http-handler.mjs` | 禁止插件直接注册低级 HTTP 处理器 |
| `check-no-monolithic-plugin-sdk-entry-imports.mjs` | 禁止整体导入 plugin-sdk 入口 |
| `check-channel-agnostic-boundaries.mjs` | 检查渠道无关的边界 |
| `check-no-random-messaging-tmp.mjs` | 禁止随机消息发送 |
| `check-no-raw-channel-fetch.mjs` | 禁止直接 fetch 渠道 API |
| `check-webhook-auth-body-order.mjs` | Webhook 必须先验证再读 body |
| `check-no-pairing-store-group-auth.mjs` | Pairing 存储鉴权检查 |
| `check-pairing-account-scope.mjs` | Pairing 账户作用域检查 |

---

## 7. 跨平台客户端架构

### 7.1 macOS 客户端（`apps/macos/`）

- **语言**：Swift + SwiftUI
- **状态管理**：使用 `@Observable`（Observation 框架），禁止 `ObservableObject`
- **协议**：通过 `GatewayModels.swift`（由 `scripts/protocol-gen-swift.ts` 自动生成）与 Gateway 通信
- **功能**：菜单栏应用，集成 Gateway 进程管理，支持 Sparkle 自动更新

### 7.2 iOS 客户端（`apps/ios/`）

- **语言**：Swift + SwiftUI
- **共享 Kit**：`apps/shared/OpenClawKit/`，iOS/macOS 共用业务逻辑
- **构建**：XcodeGen 生成项目文件（避免 `.xcodeproj` 冲突）
- **Voice Wake**：iOS 语音唤醒功能

### 7.3 Android 客户端（`apps/android/`）

- **语言**：Kotlin
- **构建**：Gradle
- **功能**：Android Talk Mode（语音对话模式）
- **连接**：通过 HTTP/WebSocket 与 Gateway 通信

### 7.4 Protocol Schema

`dist/protocol.schema.json` 由 `scripts/protocol-gen.ts` 生成，定义了 Gateway ↔ 客户端的完整通信协议，并同步生成 Swift 版本，确保跨平台类型一致。

---

## 8. 安全设计

### 8.1 认证层次

```
网关级认证（Gateway Token）
    ↓
控制面板认证（Control UI Cookie）
    ↓
插件路由认证（Plugin-specific Token）
    ↓
Hook 认证（Webhook Token + 路径签名）
```

### 8.2 关键安全机制

1. **Rate Limiting**（`auth-rate-limit.ts`，7.6KB）：防止暴力破解攻击
2. **Origin 检查**（`origin-check.ts`）：WebSocket 连接来源验证
3. **Content Security Policy**（`control-ui-csp.ts`）：控制面板 CSP 头
4. **路径穿越防护**（`security-path.ts`，4.6KB）：所有文件访问都经过边界检查
5. **Secrets 运行时快照**（`secrets/runtime.ts`）：凭证不持久化在内存中，用时加载
6. **执行审批系统**（`exec-approval-manager.ts`，5.5KB）：高风险命令需用户确认
7. **沙箱隔离**（Docker 容器）：Agent 代码执行与宿主机隔离

### 8.3 `.env` 与凭证管理

凭证通过 `src/secrets/` 子系统管理，支持多种存储后端，运行时通过 `activateSecretsRuntimeSnapshot()` 激活，防止凭证长期驻留内存。

---

## 9. 技术选型决策分析

### 9.1 为何选 `@mariozechner/pi-*` 作为 AI 引擎？

Pi SDK 提供了完整的"编码 Agent"能力封装，包括：
- 工具循环（Tool Use Loop）
- 上下文压缩（Compaction）
- 多 Provider 兼容层
- 会话历史管理

相比自行实现 Agent Loop，Pi SDK 节省了大量工程投入，并持续随上游模型 API 更新。

### 9.2 为何选 `tsdown` 而非 `esbuild`/`rollup`？

`tsdown` 基于 `oxc`（Rust 实现），提供比 esbuild 更快的构建速度，同时支持 TypeScript 装饰器和更精细的 tree-shaking。

### 9.3 为何选 `sqlite-vec` 作为向量存储？

- **零基础设施依赖**：嵌入式 SQLite，无需单独部署向量数据库
- **个人设备适配**：面向单用户的 Memory 系统，不需要分布式向量数据库
- **可选扩展**：`extensions/memory-lancedb/` 提供 LanceDB 作为高性能替代

### 9.4 为何选 `oxlint` + `oxfmt` 而非 ESLint + Prettier？

Oxlint（Rust 实现）比 ESLint 快 50-100 倍，在大型 Monorepo 中效果显著。项目强调"不妥协于性能"的工程理念。

### 9.5 为何 Telegram 选 `grammy` 而非 `telegraf`？

grammy 具有更好的 TypeScript 支持、Webhook 和 LongPolling 统一 API，以及 `@grammyjs/runner` 提供的高吞吐并发 Runner。

### 9.6 Plugin SDK 的 `jiti` 动态加载

插件通过 `jiti` 动态加载，原因：
- 支持直接加载 TypeScript 源文件（开发模式）
- 别名解析（将 `openclaw/plugin-sdk` 映射到正确路径）
- 避免 ESM 循环依赖问题

---

## 10. 总结

### 设计哲学

1. **用户主权**：所有数据和计算在用户自己的设备上运行
2. **极端可扩展**：插件 SDK + 扩展通道 = 无限扩展可能
3. **多 Provider 中立**：不绑定任何单一 AI 厂商
4. **工程严谨性**：自定义架构 Lint 规则 + 严格 TypeScript + 高覆盖率测试

### 架构亮点

| 亮点 | 技术实现 |
|------|---------|
| 通道无关路由 | SessionKey 抽象 + ChannelDock |
| 零停机热重载 | chokidar + ConfigReloadPlan |
| 多 Agent 协同 | SubagentRegistry + 持久化运行记录 |
| 安全代码执行 | Docker 沙箱 + 执行审批系统 |
| 向量记忆检索 | sqlite-vec + MMR + 混合检索 |
| 跨平台协议 | 自动生成 JSON Schema + Swift 类型 |

### 代码规模估算

| 层次 | 文件数 | 规模 |
|------|-------|------|
| `src/gateway/` | 236 | 核心网关服务 |
| `src/agents/` | 536 | AI 智能体引擎 |
| `src/memory/` | 96 | 向量记忆系统 |
| `extensions/` | 40+ 插件 | 扩展通道生态 |
| `src/channels/` | 63 | 通道抽象层 |
| 测试文件 | 400+ | `*.test.ts` / `*.e2e.test.ts` |

OpenClaw 是一个工程质量极高的开源 AI 网关项目，其插件化架构、多 Agent 协同能力和对用户数据主权的重视，使其在个人 AI 助理领域具有独特价值。
