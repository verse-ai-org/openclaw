# OpenClaw 通用AI代理核心机制深度技术解析

> 基于源码深度分析，版本：2026.3.8
> 文档路径：`aaron/openclaw-agent-mechanism-deep-dive.md`

---

## 目录

1. [通用代理架构总览](#1-通用代理架构总览)
2. [意图识别与上下文理解](#2-意图识别与上下文理解)
3. [端到端请求处理流程](#3-端到端请求处理流程)
4. [指令执行机制 - 工具调用体系](#4-指令执行机制---工具调用体系)
5. [AI推理引擎：pi-embedded-runner](#5-ai推理引擎pi-embedded-runner)
6. [大模型集成机制](#6-大模型集成机制)
7. [记忆系统设计与实现](#7-记忆系统设计与实现)
8. [会话管理与上下文维护](#8-会话管理与上下文维护)
9. [个性化需求满足机制](#9-个性化需求满足机制)
10. [错误恢复与故障转移](#10-错误恢复与故障转移)

---

## 1. 通用代理架构总览

### 1.1 为何能作为通用AI代理

OpenClaw的通用性建立在三个维度的彻底解耦之上：

```
┌─────────────────────────────────────────────────────┐
│               通用AI代理核心 (Pi SDK)                  │
├─────────────────┬────────────────┬───────────────────┤
│  渠道维度解耦    │   模型维度解耦  │   工具维度解耦     │
│                 │                │                   │
│ Telegram/Signal │ GPT-4o/Claude  │ 文件系统/Shell    │
│ WhatsApp/Slack  │ Gemini/Ollama  │ 网络/记忆/Canvas  │
│ SMS/Voice/Web   │ Copilot/Bedrock│ 子代理/插件工具   │
│ Discord/Mattermost │ 自定义Provider│ 自动化/媒体      │
└─────────────────┴────────────────┴───────────────────┘
```

**核心设计原则**：
- **渠道无关**：所有消息渠道通过 [`ChannelDock`](../src/channels/dock.ts) 抽象统一接入，代理核心不感知具体渠道
- **模型无关**：通过 [`model-fallback.ts`](../src/agents/model-fallback.ts) 和 Provider适配层，支持任意兼容模型
- **工具可组合**：通过 [`tool-policy-pipeline.ts`](../src/agents/tool-policy-pipeline.ts) 动态装配工具集

### 1.2 核心组件关系图

```
用户请求
    ↓
[ChannelDock] 渠道适配层
    ↓
[SubagentRegistry] 子代理注册/路由中心
    ↓
[runEmbeddedPiAgent] 核心推理入口
    ↓
┌────────────────────────────────────┐
│  [resolveModel] 模型解析            │
│  [ensureAuthProfileStore] 鉴权      │
│  [buildAgentSystemPrompt] 提示词    │
│  [resolvePiTools] 工具集            │
│  [runEmbeddedAttempt] 执行尝试      │
└────────────────────────────────────┘
    ↓
[Pi SDK: @mariozechner/pi-coding-agent] 推理循环
    ↓
响应 → [ChannelDock] → 用户
```

### 1.3 关键文件树

| 文件路径 | 职责 |
|---------|------|
| [`src/agents/pi-embedded-runner/run.ts`](../src/agents/pi-embedded-runner/run.ts) | 核心推理引擎入口，1503行 |
| [`src/agents/system-prompt.ts`](../src/agents/system-prompt.ts) | 动态系统提示词构建，726行 |
| [`src/agents/pi-tools.ts`](../src/agents/pi-tools.ts) | 工具集策略组合，574行 |
| [`src/agents/model-fallback.ts`](../src/agents/model-fallback.ts) | 模型故障转移，667行 |
| [`src/agents/model-auth.ts`](../src/agents/model-auth.ts) | 模型认证体系，390行 |
| [`src/memory/manager.ts`](../src/memory/manager.ts) | 记忆索引管理器，787行 |
| [`src/memory/mmr.ts`](../src/memory/mmr.ts) | MMR重排算法，215行 |
| [`src/agents/compaction.ts`](../src/agents/compaction.ts) | 上下文压缩，465行 |
| [`src/agents/subagent-registry.ts`](../src/agents/subagent-registry.ts) | 子代理生命周期管理，1464行 |
| [`src/channels/dock.ts`](../src/channels/dock.ts) | 渠道统一接入抽象 |
| [`src/agents/tool-catalog.ts`](../src/agents/tool-catalog.ts) | 工具目录定义，327行 |

---

## 2. 意图识别与上下文理解

### 2.1 系统提示词工程：多Section动态构建

OpenClaw的意图识别不依赖单独的NLU模块，而是通过精心设计的 **系统提示词工程** 引导大模型完成意图理解。核心实现位于 [`src/agents/system-prompt.ts`](../src/agents/system-prompt.ts) 的 `buildAgentSystemPrompt()` 函数。

**系统提示词由以下Sections动态组合**：

```typescript
// src/agents/system-prompt.ts L422-L600
const lines = [
  "You are a personal assistant running inside OpenClaw.",
  "",
  "## Tooling",              // 工具清单（按策略过滤后的可用工具）
  "## Safety",               // 安全约束
  "## Skills (mandatory)",   // 技能提示（可配置的SKILL.md系统）
  "## Memory Recall",        // 记忆召回指令
  "## Messaging",            // 消息路由说明
  "## Voice (TTS)",          // 语音合成提示
  "## Documentation",        // 文档路径
  "## Reply Tags",           // 回复标签格式
  "## Authorized Senders",   // 授权发送者列表
  "## Current Date & Time",  // 时间上下文
  "## Workspace",            // 工作空间说明
  "## Runtime",              // 运行时信息
  "## Context Files",        // 上下文文件注入
];
```

**PromptMode三级控制**：
```typescript
// src/agents/system-prompt.ts L16-L17
export type PromptMode = "full" | "minimal" | "none";
// - "full": 主Agent使用，包含所有Section
// - "minimal": 子Agent使用，仅保留Tooling/Workspace/Runtime
// - "none": 仅返回基础身份行
```

### 2.2 触发类型识别

系统通过 `trigger` 字段区分用户意图来源：

```typescript
// src/agents/pi-embedded-runner/run.ts L315-L323
const hookCtx = {
  agentId: workspaceResolution.agentId,
  sessionKey: params.sessionKey,
  sessionId: params.sessionId,
  workspaceDir: resolvedWorkspace,
  messageProvider: params.messageProvider ?? undefined,
  trigger: params.trigger,      // 触发类型：message/heartbeat/wake/etc.
  channelId: params.messageChannel ?? params.messageProvider ?? undefined,
};
```

触发类型驱动系统提示词的差异化构建，例如 `heartbeat` 触发会注入特殊的 `heartbeatPromptLine`，唤醒消息会携带不同的上下文信息。

### 2.3 Skills系统：零样本能力扩展

通过Skills机制，OpenClaw可以在不修改代码的情况下扩展AI的理解能力：

```typescript
// src/agents/system-prompt.ts L20-L36
function buildSkillsSection(params: { skillsPrompt?: string; readToolName: string }) {
  return [
    "## Skills (mandatory)",
    "Before replying: scan <available_skills> <description> entries.",
    `- If exactly one skill clearly applies: read its SKILL.md at <location> with \`${params.readToolName}\`, then follow it.`,
    "- If multiple could apply: choose the most specific one, then read/follow it.",
    // ...
  ];
}
```

每个Skill是一个 `SKILL.md` 文件，包含：
- 触发条件描述（供AI选择匹配）
- 具体执行指令
- 外部API调用指导

Skills目录位于 [`skills/`](../skills/)，包含52个子目录，覆盖各种任务类型。

### 2.4 记忆召回指令内嵌

系统提示词中直接内嵌了记忆使用指令：

```typescript
// src/agents/system-prompt.ts L49-L63
const lines = [
  "## Memory Recall",
  "Before answering anything about prior work, decisions, dates, people, preferences, or todos: " +
  "run memory_search on MEMORY.md + memory/*.md; then use memory_get to pull only the needed lines.",
  "If low confidence after search, say you checked.",
  // 引用模式控制
  params.citationsMode === "off" 
    ? "Citations are disabled..."
    : "Citations: include Source: <path#line> when it helps the user verify memory snippets.",
];
```

这意味着大模型会在回答任何涉及历史决策、个人偏好、待办事项时，**主动调用记忆工具**，而非依赖对话历史，实现了跨会话的持久记忆。

### 2.5 运行时上下文注入

大量运行时信息通过系统提示词注入，帮助模型理解当前执行环境：

```typescript
// src/agents/system-prompt.ts L215-L227
runtimeInfo?: {
  agentId?: string;      // 当前Agent ID
  host?: string;         // 主机名
  os?: string;           // 操作系统
  arch?: string;         // CPU架构
  node?: string;         // Node.js版本
  model?: string;        // 当前使用的模型
  defaultModel?: string; // 默认模型
  shell?: string;        // Shell类型
  channel?: string;      // 当前消息渠道
  capabilities?: string[]; // 渠道能力列表
  repoRoot?: string;     // Git仓库根目录
};
```

---

## 3. 端到端请求处理流程

### 3.1 完整8阶段流程图

```
阶段1: 消息接收
  用户通过任意渠道发送消息
  ↓
  ChannelDock.onMessage() → 渠道适配器（Telegram/WhatsApp/Slack等）
  ↓
  标准化为 IncomingMessage 格式

阶段2: 路由与会话分发
  SessionKey解析: "agent:<agentId>:<key>"
  ↓
  SubagentRegistry.routeMessage()
  ↓
  找到或创建对应Agent会话

阶段3: 队列准入控制
  enqueueSession() → 会话级串行队列（同一用户消息有序）
  ↓
  enqueueGlobal() → 全局并发队列（跨用户资源管理）

阶段4: 模型解析与鉴权
  resolveModel(provider, modelId) → 确定使用的模型
  ↓
  ensureAuthProfileStore() → 加载认证配置
  ↓
  resolveAuthProfileOrder() → 排列Profile优先级
  ↓
  applyApiKeyInfo() → 设置当前Profile的API Key

阶段5: 推理准备
  buildAgentSystemPrompt() → 动态构建系统提示词
  ↓
  resolvePiTools() → 按策略组装工具集
  ↓
  buildEmbeddedRunPayloads() → 构建请求负载

阶段6: Pi SDK推理循环
  runEmbeddedAttempt() → 单次推理尝试
  ↓
  [while循环] 大模型调用 → 工具调用 → 结果反馈 → 再次推理
  ↓
  直到模型输出最终回复（stop_reason=stop）

阶段7: 上下文管理
  自动压缩：上下文超限 → compact() → 生成摘要 → 重试
  ↓
  Tool结果截断：oversized tool results → truncate → 重试
  ↓
  会话文件写入：JSONL格式持久化

阶段8: 响应返回
  EmbeddedPiRunResult → 解析payloads
  ↓
  ChannelDock.send() → 格式化（Markdown/Plain）
  ↓
  渠道发送（支持流式/分块/静默标记）
```

### 3.2 双层队列设计细节

```typescript
// src/agents/pi-embedded-runner/run.ts L257-L273
export async function runEmbeddedPiAgent(params) {
  // 会话级队列：确保同一用户消息串行处理
  const sessionLane = resolveSessionLane(params.sessionKey?.trim() || params.sessionId);
  // 全局队列：跨用户资源管理
  const globalLane = resolveGlobalLane(params.lane);
  
  // 双层嵌套入队：外层会话队列 → 内层全局队列
  return enqueueSession(() =>
    enqueueGlobal(async () => {
      // 实际推理逻辑
    })
  );
}
```

这种设计保证了：
1. **同一用户**的消息严格串行，不会并发推理（防止会话竞争）
2. **不同用户**可以并发执行（全局队列管理资源上限）

---

## 4. 指令执行机制 - 工具调用体系

### 4.1 工具分层架构

OpenClaw构建了5层工具策略架构：

```
层1: 基础工具注册
   codingTools (Pi SDK) + createExecTool + createProcessTool
   + createOpenClawTools + 插件工具
        ↓
层2: 消息渠道限制
   applyMessageProviderToolPolicy()
   // 例：voice渠道 → 移除tts工具（避免语音嵌套）
        ↓
层3: 模型提供商限制
   applyModelProviderToolPolicy()
   // 例：xAI提供商有原生web_search → 移除OpenClaw的web_search（避免重名）
        ↓
层4: 工具策略管道 (Tool Policy Pipeline)
   applyToolPolicyPipeline() → [
     resolveToolProfilePolicy(),        // 工具Profile（minimal/coding/messaging/full）
     applyOwnerOnlyToolPolicy(),        // owner-only工具过滤
     resolveGroupToolPolicy(),          // 群组权限控制
     resolveSubagentToolPolicy(),       // 子代理工具限制
     resolveEffectiveToolPolicy(),      // 有效策略解析
     mergeAlsoAllowPolicy(),            // also_allow额外授权
     collectExplicitAllowlist(),        // 显式白名单
   ]
        ↓
层5: 前置钩子包装
   wrapToolWithBeforeToolCallHook()
   wrapToolWithAbortSignal()
```

### 4.2 工具目录：11个功能类别

[`src/agents/tool-catalog.ts`](../src/agents/tool-catalog.ts) 定义了完整的工具分类体系：

| 类别 | 工具名称 |
|-----|--------|
| Files | `read`, `write`, `edit`, `apply_patch`, `grep`, `find`, `ls` |
| Runtime | `exec`, `process` |
| Web | `web_search`, `web_fetch`, `browser` |
| Memory | `memory_search`, `memory_get`, `memory_write` |
| Sessions | `sessions_list`, `sessions_history`, `sessions_send`, `sessions_spawn` |
| UI | `canvas`, `session_status` |
| Messaging | `message`, `gateway` |
| Automation | `cron` |
| Nodes | `nodes` |
| Agents | `agents_list`, `subagents` |
| Media | `image`, `tts` |

**4种工具Profile**：
- `minimal`：read/grep/find/ls + 会话工具（最小权限）
- `coding`：minimal + write/edit/exec/process/apply_patch（编程任务）
- `messaging`：全量消息工具（消息平台集成）
- `full`：所有工具（管理员/高权限场景）

### 4.3 工具调用前钩子（Before Tool Call Hook）

[`src/agents/pi-tools.before-tool-call.ts`](../src/agents/pi-tools.before-tool-call.ts) 实现了工具执行前的拦截机制：

- **权限检查**：验证调用者是否有权限执行特定工具
- **参数清洗**：规范化工具参数，防止路径穿越等安全问题
- **循环检测**：配合 `ToolLoopDetectionConfig` 检测工具调用死循环
- **插件钩子触发**：通知插件系统工具即将执行

### 4.4 Bash工具执行路径

```typescript
// src/agents/pi-tools.ts L1-L60（关键导入链）
import { createExecTool, createProcessTool } from "./bash-tools.js";
import { createOpenClawTools } from "./openclaw-tools.js";

// 沙箱环境下的工具变体
import {
  createSandboxedReadTool,
  createSandboxedWriteTool,
  createSandboxedEditTool,
} from "./pi-tools.read.js";
```

沙箱感知：系统提示词中会区分主机路径与容器路径：
```typescript
// src/agents/system-prompt.ts L390-L393
const workspaceGuidance = params.sandboxInfo?.enabled
  ? `For read/write/edit/apply_patch, file paths resolve against host workspace: ${sanitizedWorkspaceDir}. 
     For bash/exec commands, use sandbox container paths under ${sanitizedSandboxContainerWorkspace}`
  : "Treat this directory as the single global workspace for file operations.";
```

---

## 5. AI推理引擎：pi-embedded-runner

### 5.1 主运行循环

[`src/agents/pi-embedded-runner/run.ts`](../src/agents/pi-embedded-runner/run.ts) 的 `runEmbeddedPiAgent()` 是整个系统最复杂的函数（1503行），核心是一个 `while(true)` 重试循环：

```typescript
// src/agents/pi-embedded-runner/run.ts L805-L838
while (true) {
  // 重试上限保护
  if (runLoopIterations >= MAX_RUN_LOOP_ITERATIONS) {
    return errorResult("Exceeded retry limit");
  }
  runLoopIterations += 1;

  // 执行单次推理尝试
  const attempt = await runEmbeddedAttempt({ ...params });
  
  // 分析结果，决定是否重试
  if (contextOverflowError) {
    // 上下文溢出 → 尝试压缩 → 重试
    await contextEngine.compact(...);
    continue;
  }
  if (failoverError) {
    // 模型故障 → 切换Provider/Profile → 重试
    await advanceAuthProfile();
    continue;
  }
  // 成功 → 返回结果
  return successResult;
}
```

### 5.2 最大重试次数动态计算

```typescript
// src/agents/pi-embedded-runner/run.ts L136-L146
const BASE_RUN_RETRY_ITERATIONS = 24;
const RUN_RETRY_ITERATIONS_PER_PROFILE = 8;
const MIN_RUN_RETRY_ITERATIONS = 32;
const MAX_RUN_RETRY_ITERATIONS = 160;

function resolveMaxRunRetryIterations(profileCandidateCount: number): number {
  // 有更多Profile → 允许更多重试（每个Profile可以有8次机会）
  const scaled = BASE_RUN_RETRY_ITERATIONS + Math.max(1, profileCandidateCount) * 8;
  return Math.min(160, Math.max(32, scaled));
}
// 例：3个Profile → min(160, max(32, 24+3*8)) = 48次最大重试
```

### 5.3 Hooks插件系统集成

在推理开始前，系统会触发插件钩子，允许插件修改模型选择：

```typescript
// src/agents/pi-embedded-runner/run.ts L314-L360
// 钩子1: before_model_resolve（新版，优先级更高）
if (hookRunner?.hasHooks("before_model_resolve")) {
  modelResolveOverride = await hookRunner.runBeforeModelResolve({ prompt }, hookCtx);
}
// 钩子2: before_agent_start（旧版兼容）
if (hookRunner?.hasHooks("before_agent_start")) {
  legacyBeforeAgentStartResult = await hookRunner.runBeforeAgentStart({ prompt }, hookCtx);
  // 新钩子覆盖旧钩子
  modelResolveOverride = {
    providerOverride: modelResolveOverride?.providerOverride ?? legacyResult?.providerOverride,
    modelOverride: modelResolveOverride?.modelOverride ?? legacyResult?.modelOverride,
  };
}
```

### 5.4 UsageAccumulator：精确Token追踪

```typescript
// src/agents/pi-embedded-runner/run.ts L108-L129
type UsageAccumulator = {
  input: number;       // 输入Token累计
  output: number;      // 输出Token累计
  cacheRead: number;   // 缓存读取累计
  cacheWrite: number;  // 缓存写入累计
  total: number;       // 总Token累计
  // 最后一次API调用的缓存字段（非累计，用于准确的上下文大小报告）
  lastCacheRead: number;
  lastCacheWrite: number;
  lastInput: number;
};
```

**设计洞察**：多次工具调用会导致 `cacheRead` 重复计算（每次调用都报告约等于当前上下文大小的cacheRead），因此在报告 `total` 时使用最后一次调用的值而非累计值。

### 5.5 Anthropic特殊处理

```typescript
// src/agents/pi-embedded-runner/run.ts L94-L106
// Anthropic的测试拒绝魔法字符串过滤
const ANTHROPIC_MAGIC_STRING_TRIGGER_REFUSAL = "ANTHROPIC_MAGIC_STRING_TRIGGER_REFUSAL";

function scrubAnthropicRefusalMagic(prompt: string): string {
  return prompt.replaceAll(
    ANTHROPIC_MAGIC_STRING_TRIGGER_REFUSAL,
    "ANTHROPIC MAGIC STRING TRIGGER REFUSAL (redacted)",
  );
}
// 防止用户注入该字符串触发Anthropic模型的测试拒绝行为，污染会话记录
```

---

## 6. 大模型集成机制

### 6.1 Provider认证体系

[`src/agents/model-auth.ts`](../src/agents/model-auth.ts) 实现了多种认证模式：

```typescript
// src/agents/model-auth.ts L159-L164
export type ResolvedProviderAuth = {
  apiKey?: string;    // API Key
  profileId?: string; // Auth Profile ID
  source: string;     // 认证来源描述（用于日志/调试）
  mode: "api-key" | "oauth" | "token" | "aws-sdk";
};
```

**API Key解析优先级链**（`resolveApiKeyForProvider` 函数）：
1. 指定 `profileId` → Auth Profile Store中的Key
2. `models.providers.<provider>.auth: "aws-sdk"` → AWS SDK凭证链
3. `models.providers.<provider>.apiKey` → 配置文件中的Key
4. 标准环境变量（`OPENAI_API_KEY`, `ANTHROPIC_API_KEY` 等）
5. Shell环境变量（通过 `.env` / 系统Shell）
6. Ollama特殊：如果配置了自定义API地址则使用合成本地Key

### 6.2 多Auth Profile轮换机制

单个Provider可配置多个API Key（Auth Profiles），实现负载均衡和故障恢复：

```typescript
// src/agents/pi-embedded-runner/run.ts L421-L434
// 计算Profile候选列表
const profileOrder = resolveAuthProfileOrder({ cfg, store, provider, preferredProfile });
const profileCandidates = lockedProfileId
  ? [lockedProfileId]                          // 用户锁定特定Profile
  : profileOrder.length > 0
    ? profileOrder                             // 按配置顺序排列
    : [undefined];                             // 无Profile，使用默认Key

// 冷却期检测
const inCooldown = candidate && isProfileInCooldown(authStore, candidate);
if (inCooldown) { profileIndex += 1; continue; } // 跳过冷却中的Profile
```

**Profile冷却机制**：
- 认证失败 → `markAuthProfileFailure()` → Profile进入冷却期
- 冷却期内自动跳过该Profile
- 所有Profile均在冷却期 → `throwAuthProfileFailover()` → 触发模型级故障转移

### 6.3 支持的模型提供商

| 提供商 | 认证方式 | 特殊处理 |
|-------|--------|--------|
| OpenAI | API Key / OAuth | - |
| Anthropic | API Key | 过滤拒绝魔法字符串 |
| Google Gemini | API Key / OAuth | 工具Schema清洗（cleanToolSchemaForGemini）|
| GitHub Copilot | GitHub Token → Copilot Token | Token定时刷新 |
| AWS Bedrock | AWS SDK凭证链 | IAM Role/Access Key/Profile |
| Ollama | 本地（无Key）| 合成本地Key标记 |
| xAI/Grok | API Key | 移除重名的web_search工具 |
| Mistral | API Key | - |
| Cohere | API Key | - |
| 自定义Provider | API Key | `models.providers.*` 配置 |

### 6.4 GitHub Copilot Token自动刷新

GitHub Copilot使用短效Token（有效期约30分钟），需要定期刷新：

```typescript
// src/agents/pi-embedded-runner/run.ts L463-L540
const COPILOT_REFRESH_MARGIN_MS = 5 * 60 * 1000;    // 提前5分钟刷新
const COPILOT_REFRESH_RETRY_MS = 60 * 1000;          // 刷新失败后1分钟重试
const COPILOT_REFRESH_MIN_DELAY_MS = 5 * 1000;       // 最短刷新间隔5秒

const scheduleCopilotRefresh = (): void => {
  const refreshAt = copilotTokenState.expiresAt - COPILOT_REFRESH_MARGIN_MS;
  const delayMs = Math.max(COPILOT_REFRESH_MIN_DELAY_MS, refreshAt - now);
  setTimeout(() => {
    refreshCopilotToken("scheduled")
      .then(() => scheduleCopilotRefresh())  // 成功 → 递归调度下次刷新
      .catch(() => { /* 失败 → 60s后重试 */ });
  }, delayMs);
};
```

### 6.5 模型Schema适配

不同Provider对工具Schema的要求不同，系统进行自动适配：

```typescript
// src/agents/pi-tools.ts L43
import { cleanToolSchemaForGemini, normalizeToolParameters } from "./pi-tools.schema.js";

// Gemini Schema清洗：移除不支持的字段（format等）
// OpenAI兼容处理：确保required字段格式正确
// Claude兼容性：patchToolSchemaForClaudeCompatibility()
// xAI限制：避免Union类型，避免anyOf/oneOf
```

---

## 7. 记忆系统设计与实现

### 7.1 分层记忆架构

OpenClaw的记忆系统采用三层架构：

```
┌──────────────────────────────────────────┐
│         会话内记忆（短期）                  │
│  Pi SDK会话历史 (JSONL) + 上下文窗口        │
├──────────────────────────────────────────┤
│         工作区文件记忆（中期）               │
│  MEMORY.md + memory/*.md (QMD格式)        │
│  由Agent主动读写                           │
├──────────────────────────────────────────┤
│         向量索引记忆（长期语义检索）           │
│  MemoryIndexManager (sqlite-vec + FTS5)   │
│  自动索引工作区文件 + 会话历史               │
└──────────────────────────────────────────┘
```

### 7.2 MemoryIndexManager：向量记忆核心

[`src/memory/manager.ts`](../src/memory/manager.ts) 的 `MemoryIndexManager` 类是记忆系统的核心，基于 SQLite + sqlite-vec 实现：

```typescript
// src/memory/manager.ts L45-L100
export class MemoryIndexManager extends MemoryManagerEmbeddingOps implements MemorySearchManager {
  // 双存储：向量表 + FTS全文检索表
  protected db: DatabaseSync;   // SQLite连接
  protected vector: {
    enabled: boolean;
    dims?: number;             // 向量维度（与嵌入模型匹配）
  };
  protected fts: {
    enabled: boolean;          // FTS5全文检索
  };
  
  // 5种嵌入Provider支持
  protected openAi?: OpenAiEmbeddingClient;    // text-embedding-ada-002等
  protected gemini?: GeminiEmbeddingClient;    // embedding-001等
  protected voyage?: VoyageEmbeddingClient;    // voyage-2等
  protected mistral?: MistralEmbeddingClient;  // mistral-embed等
  protected ollama?: OllamaEmbeddingClient;    // nomic-embed-text等
  
  // 单例缓存防止重复创建
  static async get(params): Promise<MemoryIndexManager | null> {
    const key = `${agentId}:${workspaceDir}:${JSON.stringify(settings)}`;
    const existing = INDEX_CACHE.get(key);
    if (existing) return existing;
    // ...创建新实例
  }
}
```

**三张核心SQLite表**：
- `chunks_vec`：向量表（sqlite-vec扩展），存储文本块的向量嵌入
- `chunks_fts`：FTS5全文检索表，支持BM25排序
- `embedding_cache`：嵌入缓存表，避免重复计算相同文本的嵌入

### 7.3 混合检索策略

[`src/memory/manager.ts`](../src/memory/manager.ts) L267-L347 实现了向量 + 关键词的混合检索：

```typescript
// 混合检索流程
async search(query, opts) {
  // 1. 关键词检索（BM25）
  const keywordResults = hybrid.enabled
    ? await this.searchKeyword(cleaned, candidates)  // FTS5全文检索
    : [];
  
  // 2. 向量检索（余弦相似度）
  const queryVec = await this.embedQueryWithTimeout(cleaned);  // 查询向量化
  const vectorResults = await this.searchVector(queryVec, candidates);
  
  // 3. RRF融合（Reciprocal Rank Fusion）
  const merged = await this.mergeHybridResults({
    vector: vectorResults,
    keyword: keywordResults,
    vectorWeight: hybrid.vectorWeight,    // 向量权重（默认0.7）
    textWeight: hybrid.textWeight,        // 文本权重（默认0.3）
    mmr: hybrid.mmr,                      // MMR配置
    temporalDecay: hybrid.temporalDecay,  // 时间衰减权重
  });
  
  // 4. 分数过滤 + 数量限制
  return merged.filter(e => e.score >= minScore).slice(0, maxResults);
}
```

**退化策略**：
- 无嵌入Provider → 纯FTS关键词检索
- FTS不可用 → 纯向量检索
- 两者均不可用 → 返回空结果

### 7.4 MMR算法：最大边际相关性重排

[`src/memory/mmr.ts`](../src/memory/mmr.ts) 实现了完整的MMR重排算法，防止检索结果冗余：

**核心公式**（Carbonell & Goldstein, 1998）：
```
MMR Score = λ × relevance - (1-λ) × max_similarity_to_selected
```

```typescript
// src/memory/mmr.ts L100-L102
export function computeMMRScore(
  relevance: number,     // 与查询的相关性分数
  maxSimilarity: number, // 与已选结果的最大相似度
  lambda: number,        // 权重参数（0=最大多样性, 1=最大相关性）
): number {
  return lambda * relevance - (1 - lambda) * maxSimilarity;
}
```

**迭代选择算法**：
```typescript
// src/memory/mmr.ts L150-L183
const selected: T[] = [];
const remaining = new Set(items);

while (remaining.size > 0) {
  let bestItem = null;
  let bestMMRScore = -Infinity;
  
  for (const candidate of remaining) {
    const normalizedRelevance = normalizeScore(candidate.score);
    // 计算与已选集合的最大相似度（Jaccard相似度）
    const maxSim = maxSimilarityToSelected(candidate, selected, tokenCache);
    const mmrScore = computeMMRScore(normalizedRelevance, maxSim, lambda);
    if (mmrScore > bestMMRScore) { bestMMRScore = mmrScore; bestItem = candidate; }
  }
  
  selected.push(bestItem);
  remaining.delete(bestItem);
}
```

**相似度计算**：使用Jaccard相似度（基于词汇集合的交集/并集比值），而非嵌入向量余弦相似度，保证效率：
```typescript
// src/memory/mmr.ts L41-L61
export function jaccardSimilarity(setA: Set<string>, setB: Set<string>): number {
  let intersectionSize = 0;
  for (const token of smaller) {
    if (larger.has(token)) intersectionSize++;
  }
  const unionSize = setA.size + setB.size - intersectionSize;
  return unionSize === 0 ? 0 : intersectionSize / unionSize;
}
```

**默认配置**：
```typescript
export const DEFAULT_MMR_CONFIG: MMRConfig = {
  enabled: false,  // 默认关闭（需显式启用）
  lambda: 0.7,     // 70%相关性 + 30%多样性惩罚
};
```

### 7.5 记忆数据来源

```typescript
// src/memory/manager.ts L80-L82
protected readonly sources: Set<MemorySource>;
// 支持的数据来源：
// - "memory": workspace/memory/**/*.md 文件
// - "sessions": JSONL会话历史文件
// - 自定义扩展来源（通过插件）
```

**文件监听机制**：
- `chokidar` 文件系统监听 → memory文件变化 → 触发增量索引更新
- 会话写入事件 → `sessionsDirty` 标志 → 下次搜索前触发sync
- 定期间隔同步（`ensureIntervalSync()`）

---

## 8. 会话管理与上下文维护

### 8.1 会话文件格式：JSONL

每个会话的对话历史存储在 `~/.openclaw/agents/<agentId>/sessions/` 目录下的 `.jsonl` 文件中，每行一条消息记录：

```jsonl
{"role":"user","content":"帮我分析这个文件","timestamp":1709000000000}
{"role":"assistant","content":"好的，我来分析...","timestamp":1709000001000}
{"role":"tool","name":"read","result":"文件内容...","timestamp":1709000002000}
{"role":"assistant","content":"分析结果：...","stopReason":"stop","usage":{"input":1234,"output":567}}
```

### 8.2 SessionKey层次结构

```typescript
// src/routing/session-key.ts
// SessionKey格式: "agent:<agentId>:<key>"
// 例：
// "agent:default:telegram:123456789"    → Telegram用户123456789的main agent会话
// "agent:coding:slack:C01234:thread:TS" → Slack某线程的coding agent会话
// "agent:default:subagent:uuid-xxx"     → 子代理会话
```

SessionKey同时作为：
1. **会话标识符**：唯一确定一个对话上下文
2. **路由键**：决定消息路由到哪个Agent
3. **文件名映射**：对应具体的JSONL会话文件

### 8.3 上下文压缩策略

[`src/agents/compaction.ts`](../src/agents/compaction.ts) 实现了自适应的上下文压缩：

```typescript
// 关键参数
export const BASE_CHUNK_RATIO = 0.4;    // 基准：压缩为40%上下文
export const MIN_CHUNK_RATIO = 0.15;    // 最小：保留15%最近上下文
export const SAFETY_MARGIN = 1.2;       // 20% Token估计误差缓冲
export const SUMMARIZATION_OVERHEAD_TOKENS = 4096; // 摘要提示词额外预留

// 自适应Chunk Ratio：消息越大，chunk比例越小
export function computeAdaptiveChunkRatio(messages, contextWindow): number {
  const avgTokens = totalTokens / messages.length * SAFETY_MARGIN;
  const avgRatio = avgTokens / contextWindow;
  if (avgRatio > 0.1) {
    const reduction = Math.min(avgRatio * 2, BASE_CHUNK_RATIO - MIN_CHUNK_RATIO);
    return Math.max(MIN_CHUNK_RATIO, BASE_CHUNK_RATIO - reduction);
  }
  return BASE_CHUNK_RATIO;
}
```

**压缩保护措施**：
```typescript
// src/agents/compaction.ts L31-L33
const IDENTIFIER_PRESERVATION_INSTRUCTIONS =
  "Preserve all opaque identifiers exactly as written (no shortening or reconstruction), " +
  "including UUIDs, hashes, IDs, tokens, API keys, hostnames, IPs, ports, URLs, and file names.";
```

压缩摘要时，AI**必须**保留所有标识符（UUID、哈希、Token、API Key、主机名等），防止信息丢失导致后续任务失败。

### 8.4 溢出时的三级恢复策略

当上下文溢出时，系统按以下顺序尝试恢复：

```
策略1: SDK级自动压缩
  Pi SDK (@mariozechner/pi-coding-agent) 内置auto-compaction
  ↓
  若仍溢出 →

策略2: 显式上下文压缩
  contextEngine.compact({ force: true, compactionTarget: "budget" })
  将对话历史分块，逐块生成摘要，用摘要替换历史
  最多尝试3次 (MAX_OVERFLOW_COMPACTION_ATTEMPTS = 3)
  ↓
  若仍溢出 →

策略3: 工具结果截断
  truncateOversizedToolResultsInSession()
  检测超大工具结果（单个结果超出上下文窗口）
  截断冗余工具结果详情 (toolResult.details)
  ↓
  若仍溢出 → 返回错误，提示用户 /new 新会话
```

---

## 9. 个性化需求满足机制

### 9.1 多Agent配置系统

每个用户/场景可以配置独立的Agent，具有不同的：
- 使用的AI模型（provider + model）
- 系统提示词补充（extraSystemPrompt）
- 工具权限（toolProfile）
- 记忆配置（memory.search.*）
- 沙箱设置（sandbox.enabled）

```typescript
// 通过config.yaml配置
// agents:
//   default:
//     model: claude-3-7-sonnet
//     tools.profile: full
//   coding:
//     model: gpt-4o
//     tools.profile: coding
//     sandbox.enabled: true
```

### 9.2 Workspace文件系统：个性化上下文注入

[`src/agents/workspace.ts`](../src/agents/workspace.ts) 管理Agent工作区，支持多种个性化文件：

| 文件 | 作用 |
|-----|-----|
| `AGENTS.md` | Agent行为规范，注入系统提示词 |
| `MEMORY.md` | 用户个人记忆文件，Agent可读写 |
| `memory/*.md` | 分类记忆文件（任务/偏好/联系人等） |
| `SKILL.md` | 技能文件，AI根据任务动态读取 |
| `TOOLS.md` | 工具使用指导（不控制工具可用性） |
| `.context` | 上下文文件夹，注入额外背景信息 |

### 9.3 Skills系统：零代码能力扩展

技能目录 [`skills/`](../skills/) 包含52个预定义技能，每个技能是一个SKILL.md文件：

```markdown
# 技能：代码审查
## 触发条件
用户要求审查/review代码，分析代码质量或找bug

## 执行步骤
1. 读取目标文件
2. 分析代码结构、命名规范、潜在bug
3. 生成结构化审查报告
...
```

系统提示词中的Skills Section引导AI：
1. 每次回复前扫描可用技能列表
2. 选择最匹配的唯一技能
3. 使用 `read` 工具加载技能文件
4. 按技能指令执行

### 9.4 Human Delay功能

```typescript
// src/agents/workspace.ts（通过config）
// 模拟人类输入延迟，用于需要自然感的消息场景
// agents.<id>.humanDelay: true
```

### 9.5 授权发送者控制

```typescript
// src/agents/system-prompt.ts L66-L94
function buildUserIdentitySection(ownerLine: string | undefined, isMinimal: boolean) {
  return ["## Authorized Senders", ownerLine, ""];
}
// ownerDisplay: "hash" → 对Owner ID哈希处理，增强隐私
// ownerDisplaySecret → HMAC密钥，使哈希不可逆推
```

---

## 10. 错误恢复与故障转移

### 10.1 错误分类体系

[`src/agents/pi-embedded-helpers.ts`](../src/agents/pi-embedded-helpers.ts) 定义了完整的错误分类：

```typescript
export type FailoverReason =
  | "auth"           // 认证失败（API Key无效/过期）
  | "rate_limit"     // 速率限制（429）
  | "overloaded"     // 服务过载（503/529）
  | "billing"        // 账单问题
  | "model_not_found"// 模型不存在
  | "context_overflow" // 上下文溢出
  | "timeout"        // 超时
  | "unknown";       // 未知错误
```

### 10.2 故障转移决策树

```
发生错误
    ↓
isFailoverError?
    ├── NO → 直接抛出（用户中断、协议错误等）
    └── YES → 分析FailoverReason
         ├── "auth" → 尝试刷新Copilot Token（如果是Copilot）
         │             └── 失败 → markAuthProfileFailure → advanceAuthProfile()
         ├── "rate_limit" → markAuthProfileFailure → advanceAuthProfile()
         ├── "overloaded" → 指数退避 → advanceAuthProfile()
         │                  OVERLOAD_FAILOVER_BACKOFF_POLICY: {250ms, max:1500ms, factor:2, jitter:0.2}
         ├── "billing" → markAuthProfileFailure → advanceAuthProfile()
         ├── "context_overflow" → 上下文压缩策略（见8.4节）
         └── "timeout" → 不标记Profile失败 → 可直接重试
    
advanceAuthProfile() 失败（所有Profile均不可用）
    ↓
fallbackConfigured? 
    ├── YES → throw FailoverError → 触发model-level故障转移
    └── NO → 抛出原始错误
```

### 10.3 过载退避策略

```typescript
// src/agents/pi-embedded-runner/run.ts L87-L92
const OVERLOAD_FAILOVER_BACKOFF_POLICY: BackoffPolicy = {
  initialMs: 250,   // 初始等待250ms
  maxMs: 1_500,     // 最长等待1.5s
  factor: 2,        // 指数增长系数
  jitter: 0.2,      // 20%随机抖动（防止惊群效应）
};
// 第1次：~250ms, 第2次：~500ms, 第3次：~1000ms, 第4次：~1500ms
```

### 10.4 Auth Profile冷却机制

```typescript
// src/agents/auth-profiles.ts
// 标记失败：markAuthProfileFailure({ store, profileId, reason, cfg, agentDir })
// 检查冷却：isProfileInCooldown(authStore, candidate)
// 获取冷却结束时间：getSoonestCooldownExpiry()

// 不同失败原因的冷却时间不同：
// - rate_limit: 较长冷却（等待速率限制重置）
// - overloaded: 中等冷却（等待服务恢复）
// - auth: 标记失败，不自动恢复（需人工修复）
// - billing: 标记失败，不自动恢复
```

### 10.5 模型级故障转移流程

[`src/agents/model-fallback.ts`](../src/agents/model-fallback.ts) 实现了完整的模型级故障转移：

```typescript
// 候选列表构建优先级：
// 1. 配置中的明确fallback列表 (resolveAgentModelFallbackValues)
// 2. 同Provider下的其他模型（按allowlist过滤）
// 3. 如果有allowlist，使用其他Provider的允许模型

// 执行流程
for (const candidate of candidates) {
  try {
    const result = await run(candidate.provider, candidate.model);
    return { result, provider: candidate.provider, model: candidate.model, attempts };
  } catch (err) {
    if (shouldRethrowAbort(err)) throw err;  // 用户取消不重试
    attempts.push({ provider, model, error, reason });
    // 继续尝试下一个候选
  }
}
throw new Error(`All candidates failed: ${attempts.map(formatAttempt).join(" | ")}`);
```

---

## 附录：关键技术常数速查

| 常数 | 值 | 文件 | 说明 |
|-----|---|-----|-----|
| `BASE_RUN_RETRY_ITERATIONS` | 24 | `run.ts` | 基础重试次数 |
| `MAX_RUN_RETRY_ITERATIONS` | 160 | `run.ts` | 最大重试次数 |
| `MAX_OVERFLOW_COMPACTION_ATTEMPTS` | 3 | `run.ts` | 上下文溢出最大压缩次数 |
| `COPILOT_REFRESH_MARGIN_MS` | 5min | `run.ts` | Copilot Token提前刷新时间 |
| `BASE_CHUNK_RATIO` | 0.4 | `compaction.ts` | 压缩基准保留比例40% |
| `MIN_CHUNK_RATIO` | 0.15 | `compaction.ts` | 最小保留比例15% |
| `SAFETY_MARGIN` | 1.2 | `compaction.ts` | Token估计20%缓冲 |
| `DEFAULT_MMR_LAMBDA` | 0.7 | `mmr.ts` | MMR相关性权重70% |
| `SNIPPET_MAX_CHARS` | 700 | `manager.ts` | 记忆片段最大字符数 |
| `BATCH_FAILURE_LIMIT` | 2 | `manager.ts` | 嵌入批处理最大失败次数 |
| `CONTEXT_WINDOW_HARD_MIN_TOKENS` | (见代码) | `context-window-guard.ts` | 上下文窗口最小Token数 |

---

## 附录：数据流向总览

```
用户消息
   ↓
ChannelDock (src/channels/dock.ts)
   ↓ 标准化消息格式
SubagentRegistry (src/agents/subagent-registry.ts)
   ↓ SessionKey路由 → 找到目标Agent
runEmbeddedPiAgent (src/agents/pi-embedded-runner/run.ts)
   ↓ 双层队列入队
   ↓ 模型解析 (src/agents/pi-embedded-runner/model.ts)
   ↓ Auth Profile加载 (src/agents/auth-profiles.ts)
   ↓ 系统提示词构建 (src/agents/system-prompt.ts)
   ↓ 工具集组装 (src/agents/pi-tools.ts)
   ↓
runEmbeddedAttempt (src/agents/pi-embedded-runner/run/attempt.ts)
   ↓
Pi SDK (@mariozechner/pi-coding-agent) 推理循环
   ↓ 大模型API调用 (OpenAI/Anthropic/Gemini等)
   ↓ 工具调用 → 工具执行 → 结果返回
   ↓ 循环直到stop
   ↓
结果处理
   ↓ UsageAccumulator 统计Token
   ↓ 错误分析 (contextOverflow/failoverError)
   ↓ 重试/压缩/故障转移
   ↓
EmbeddedPiRunResult
   ↓
ChannelDock.send() → 格式化 → 渠道发送
```
