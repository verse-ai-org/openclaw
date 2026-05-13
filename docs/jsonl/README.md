# LLM 调用日志方案说明

## 概述

OpenClaw 提供两套独立的日志机制，用于追踪 LLM（大语言模型）调用全链路：

| 方案 | 文件名 | 侧重点 |
|------|--------|--------|
| **Cache Trace** | `cache-trace.jsonl` | Agent 上下文生命周期 & 消息变更追踪 |
| **Anthropic Payload Logger** | `anthropic-payload.jsonl` | 每次 LLM API 调用的**入参** + **出参** |

二者互补，同时开启可覆盖"请求链路 + 字段内容"的完整可观测需求。

---

## 一、Cache Trace

### 1.1 实现方案

源码位置：[`src/agents/cache-trace.ts`](file:///Users/leonard/qoderproject/verse-ai-org/openclaw/src/agents/cache-trace.ts)

原理：在 Agent 执行循环的**关键生命周期钩子**中插入 `recordStage()` 调用，记录当前上下文快照。

调用点位于 [`src/agents/pi-embedded-runner/run/attempt.ts`](file:///Users/leonard/qoderproject/verse-ai-org/openclaw/src/agents/pi-embedded-runner/run/attempt.ts)：

| 代码位置 | stage | 触发时机 |
|----------|-------|----------|
| L1290 | `session:loaded` | 会话加载完成后 |
| L1402 | `session:sanitized` | 会话消息清洗/脱敏后 |
| L1419 | `session:limited` | 上下文窗口裁剪后 |
| L1684 | `prompt:before` | 发送 prompt 前（含用户输入文本） |
| L1730 | `prompt:images` | 图片附件处理后 |
| ~L1783 | `stream:context` | **LLM API 调用前**（通过 `wrapStreamFn` 注入） |
| L1953 | `session:after` | LLM 响应处理完成后 |

`wrapStreamFn` 不再直接记录请求体，而是记录 `stream:context` 阶段的**上下文快照**（model、system、messages），而非 API 请求 payload。

### 1.2 日志格式

每行一个 JSON 对象（JSONL），包含以下字段：

```typescript
{
  ts: string;                    // ISO 时间戳
  seq: number;                   // 序列号（ session 内递增）
  stage: CacheTraceStage;        // 阶段标识

  // Agent 元信息
  runId?: string;                // Agent 运行实例 ID
  sessionId?: string;            // 会话 ID
  sessionKey?: string;           // 会话键（如 agent:main:main）
  provider?: string;             // 模型提供商（如 deepseek）
  modelId?: string;              // 模型 ID（如 deepseek-v4-flash）
  modelApi?: string | null;      // API 类型（如 anthropic-messages）
  workspaceDir?: string;         // 工作区路径

  // 上下文数据
  system?: unknown;              // System prompt
  systemDigest?: string;         // System prompt SHA256 摘要
  messages?: AgentMessage[];     // 消息数组（通过 OPENCLAW_CACHE_TRACE_MESSAGES 控制）
  messageCount?: number;         // 消息数量
  messageRoles?: string[];       // 消息角色列表（user/assistant/toolResult）
  messageFingerprints?: string[];// 每条消息的 SHA256 摘要
  messagesDigest?: string;       // 所有消息指纹的聚合摘要

  model?: { id, provider, api }; // 模型信息摘要
  options?: Record<string, unknown>; // 流式选项（thinking 等）
  prompt?: string;               // 用户 prompt 文本
  note?: string;                 // 附加说明
  error?: string;                // 错误信息
}
```

**CacheTraceStage 枚举**：

| stage | 含义 |
|-------|------|
| `session:loaded` | 会话消息从数据库/内存加载完成 |
| `session:sanitized` | 消息经过清洗/脱敏（如过滤非 LLM 消息） |
| `session:limited` | 消息经过上下文窗口裁剪 |
| `prompt:before` | 准备发送 prompt 前 |
| `prompt:images` | 图片附件编码处理后 |
| `stream:context` | LLM API 即将调用时的上下文快照 |
| `session:after` | LLM 响应已写入 session，全部完成 |

### 1.3 环境变量开关

| 变量 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `OPENCLAW_CACHE_TRACE` | `boolean` | `false` | 总开关 |
| `OPENCLAW_CACHE_TRACE_FILE` | `string` | `~/.openclaw/logs/cache-trace.jsonl` | 输出文件路径 |
| `OPENCLAW_CACHE_TRACE_MESSAGES` | `boolean` | `true` | 是否在日志中包含完整消息体 |
| `OPENCLAW_CACHE_TRACE_PROMPT` | `boolean` | `true` | 是否包含 prompt 文本 |
| `OPENCLAW_CACHE_TRACE_SYSTEM` | `boolean` | `true` | 是否包含 system prompt |

### 1.4 日志收集原理

```
Agent 执行循环 ──→ attempt.ts 各钩子调用 recordStage()
                                    │
                           ┌────────┴────────┐
                           │  buildAgentTraceBase() │
                           │  summarizeMessages()   │
                           │  redactImageData()     │
                           └────────┬────────┘
                                    │
                     queued-file-writer（异步队列写入）
                                    │
                           ┌────────┴────────┐
                           │ cache-trace.jsonl     │
                           └─────────────────────┘
```

- 使用 `QueuedFileWriter` 异步写入，不阻塞主流程
- 图片数据通过 `redactImageDataForDiagnostics()` 脱敏
- 消息体提供 `digest` 摘要用于比对是否变化，消息内容通过开关控制是否保留

---

## 二、Anthropic Payload Logger

### 2.1 实现方案

源码位置：[`src/agents/anthropic-payload-log.ts`](file:///Users/leonard/qoderproject/verse-ai-org/openclaw/src/agents/anthropic-payload-log.ts)

原理：通过 `wrapStreamFn` 包装 pi-ai SDK 的 `streamSimple()` 函数：

1. **捕获入参**：利用 pi-ai 提供的 `onPayload` 回调，在 API 请求发起前获取完整请求体
2. **捕获出参**：通过 `AssistantMessageEventStream.result()` 方法，等待 SSE 流结束，获取最终 `AssistantMessage`（含完整输出内容）

### 2.2 日志格式

每行一个 JSON 对象，包含三种 stage：

#### stage = `"request"`（入参）

```json
{
  "runId": "...",
  "sessionId": "...",
  "sessionKey": "agent:main:main",
  "provider": "deepseek",
  "modelId": "deepseek-v4-flash",
  "modelApi": "anthropic-messages",
  "workspaceDir": "/Users/...",
  "ts": "2026-05-12T12:58:13.675Z",
  "stage": "request",
  "payload": {                       // ← API 请求体
    "model": "deepseek-v4-flash",
    "max_tokens": 34048,
    "stream": true,
    "thinking": {
      "type": "enabled",
      "budget_tokens": 2048
    },
    "system": "...system prompt...",
    "tools": [ /* 工具定义 */ ],
    "messages": [
      { "role": "user", "content": [{"type": "text", "text": "..."}] }
    ]
  },
  "payloadDigest": "sha256..."
}
```

**payload 字段说明**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `model` | `string` | 模型名称 |
| `max_tokens` | `number` | 最大输出 token 数 |
| `stream` | `boolean` | 是否 SSE 流式 |
| `thinking` | `object\|null` | 推理配置（type + budget_tokens） |
| `system` | `string` | System prompt + 工具描述 |
| `tools` | `array` | 可用工具定义（name, description, parameters） |
| `messages` | `array` | 对话消息数组 |

#### stage = `"response"`（出参）

```json
{
  "stage": "response",
  "payload": {
    "role": "assistant",
    "content": [
      { "type": "thinking", "thinking": "..." },
      { "type": "text", "text": "..." },
      { "type": "toolCall", "id": "call_...", "name": "weather_widget", "arguments": {...} }
    ],
    "api": "anthropic-messages",
    "provider": "deepseek",
    "model": "deepseek-v4-flash",
    "usage": {
      "input": 138,
      "output": 93,
      "cacheRead": 22912,
      "cacheWrite": 0,
      "totalTokens": 23143,
      "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0, "total": 0 }
    },
    "stopReason": "toolUse"   // "stop" | "length" | "toolUse" | "error" | "aborted"
  },
  "payloadDigest": "sha256..."
}
```

**payload 字段说明**（`AssistantMessage` 类型）：

| 字段 | 类型 | 说明 |
|------|------|------|
| `content` | `array` | 输出内容数组 |
| `content[].type` | `string` | 类型：`text` / `thinking` / `toolCall` |
| `content[].text` | `string` | 纯文本输出 |
| `content[].thinking` | `string` | LLM 推理/思考过程 |
| `content[].toolCall` | `object` | 工具调用（name, id, arguments） |
| `usage` | `object` | Token 用量统计 |
| `usage.input` | `number` | 输入 token 数 |
| `usage.output` | `number` | 输出 token 数 |
| `usage.cacheRead` | `number` | 缓存命中的 prompt token 数 |
| `usage.cacheWrite` | `number` | 写入缓存的 token 数 |
| `usage.totalTokens` | `number` | 总 token 数 |
| `usage.cost` | `object` | 费用明细 |
| `stopReason` | `string` | 停止原因 |

#### stage = `"usage"`（用量摘要）

```json
{
  "stage": "usage",
  "usage": {
    "input": 416,
    "output": 80,
    "cacheRead": 23040,
    "cacheWrite": 0,
    "totalTokens": 23536,
    "cost": { ... }
  }
}
```

### 2.3 环境变量开关

| 变量 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `OPENCLAW_ANTHROPIC_PAYLOAD_LOG` | `boolean` | `false` | 总开关 |
| `OPENCLAW_ANTHROPIC_PAYLOAD_LOG_FILE` | `string` | `~/.openclaw/logs/anthropic-payload.jsonl` | 输出文件路径 |

### 2.4 日志收集原理

```
wrapStreamFn 包装 streamFn
        │
        ├── onPayload 回调（请求前）────→ record({ stage: "request" })
        │
        └── stream.result()（流结束后）──→ record({ stage: "response" })

streamFn 返回 AssistantMessageEventStream
        │
        ├── 正常消费：上游通过 for-await 消费 SSE 事件
        │     └── type: "done" → 触发 result() 的 Promise resolve
        │
        └── 错误：catch → record({ stage: "response", error })

写文件（同 cache-trace）：
        ┌─────────────────────────────────────┐
        │ anthropic-payload.jsonl             │
        │ [request] [response] [usage] ...    │
        └─────────────────────────────────────┘
```

关键组件：
- `isAnthropicModel()`: 仅捕获 `api === "anthropic-messages"` 的模型（deepseek-v4-flash 等）
- `redactImageDataForDiagnostics()`: 对 payload 中的图片数据做脱敏处理
- `findLastAssistantUsage()`: 从最终 messages 数组中提取 usage 数据

---

## 三、一次 LLM 调用的完整日志示例

以**查询南京明天天气**为例（`weather_widget` 工具调用）：

### 3.1 Cache Trace 反映的流程

```
seq=1  session:loaded     msgs=10  会话加载完成
seq=2  session:sanitized  msgs=10  消息清洗后
seq=3  session:limited    msgs=10  上下文裁剪后
seq=4  prompt:before      promptChars=153  用户输入已就绪
seq=5  prompt:images      msgs=10  图片处理完成
seq=6  stream:context     msgs=11  ★ 第一次 LLM 调用（不含 tool_result）
seq=7  stream:context     msgs=13  ★ 第二次 LLM 调用（已包含 tool_result）
seq=8  session:after      msgs=14  LLM 完成，结果写入 session
```

**6→7 为什么调用两次 LLM？**

```
第 1 次（seq=6）：
  LLM 收到用户消息 + 历史 → 返回 tool_use(weather_widget)
  → Agent 执行 weather_widget 工具 → 拿到天气 JSON

第 2 次（seq=7）：
  LLM 收到用户消息 + tool_use + tool_result
  → 根据天气数据组织自然语言回复 → 返回 text
```

### 3.2 Anthropic Payload Logger 反映的入参出参

#### 第一次 LLM 调用（工具选择阶段）

```
request  → model=deepseek-v4-flash, messages=[user query]
response → content=[thinking, toolCall(weather_widget)], stopReason=toolUse
usage    → input=138, output=93
```

**入参 messages**：
```json
[{ "role": "user", "content": "帮我查询一下南京明天的天气。" }]
```

**出参 content**：
```json
[
  { "type": "thinking", "thinking": "用户想查天气，用 weather_widget..." },
  { "type": "toolCall", "name": "weather_widget", "arguments": {"location": "Nanjing", "dayOffset": 1} }
]
```

#### 第二次 LLM 调用（回复生成阶段）

```
request  → model=deepseek-v4-flash, messages=[user query, tool_use, tool_result]
response → content=[thinking, text], stopReason=stop
usage    → input=416, output=80
```

**入参 messages**（3 条）：
```json
[
  { "role": "user", "content": "帮我查询一下南京明天的天气。" },
  { "role": "assistant", "content": [{ "type": "tool_use", "name": "weather_widget", ... }] },
  { "role": "user", "content": [{ "type": "tool_result", "content": "{weather json}" }] }
]
```

**出参 content**：
```json
[
  { "type": "thinking", "thinking": "天气数据已拿到..." },
  { "type": "text", "text": "南京明天（5月13日）天气：晴天，20~28°C..." }
]
```

---

## 四、两个方案的对比与联动

| 维度 | Cache Trace | Anthropic Payload Logger |
|------|-------------|--------------------------|
| **作用范围** | Agent 全生命周期 | LLM API 调用边界（request/response） |
| **记录内容** | 上下文消息快照、token 摘要、角色分布 | API 请求体、输出内容、token 用量 |
| **入参/出参** | 不直接记录入参出参 | 精确记录每次 LLM 调用的入参 + 出参 |
| **图片脱敏** | ✅ | ✅ |
| **消息体** | 通过开关控制是否包含 | 始终包含（图片已脱敏） |
| **性能影响** | 极小（异步写 + 摘要计算） | 极小（异步写） |
| **适用场景** | 调试上下文管理、消息变更、窗口裁剪 | 调试 LLM 实际发送/返回内容 |

**联动使用建议**：
1. 先看 **Cache Trace** 了解完整生命周期：session 加载了几个消息→裁剪后剩几个→调用了 1 次还是 2 次 LLM
2. 再看 **Anthropic Payload Logger** 查看具体的 API 入参和 LLM 输出内容

---

## 五、使用指南

### 5.1 快速启用

```bash
# 启用 Cache Trace（会输出到 ~/.openclaw/logs/cache-trace.jsonl）
export OPENCLAW_CACHE_TRACE=true

# 启用 Anthropic Payload Logger（会输出到 ~/.openclaw/logs/anthropic-payload.jsonl）
export OPENCLAW_ANTHROPIC_PAYLOAD_LOG=true

# 合并启动 gateway
pnpm gateway:dev

# 或一条命令
OPENCLAW_CACHE_TRACE=true OPENCLAW_ANTHROPIC_PAYLOAD_LOG=true pnpm gateway:dev
```

### 5.2 Electron 模式下使用

```bash
# 终端设置环境变量
export OPENCLAW_CACHE_TRACE=true
export OPENCLAW_ANTHROPIC_PAYLOAD_LOG=true

# 注意：pnpm electron:dev 不会重新构建 dist/，源码修改后需先 pnpm build
pnpm build
pnpm electron:dev
```

### 5.3 验证日志生效

```bash
# 启动后检查日志文件是否生成
ls -la ~/.openclaw/logs/
# 应看到 cache-trace.jsonl 和 anthropic-payload.jsonl

# 实时查看日志
tail -f ~/.openclaw/logs/cache-trace.jsonl | head -20
tail -f ~/.openclaw/logs/anthropic-payload.jsonl | head -20
```

### 5.4 获取当前模型和 API

模型配置通过 `provider/model` 格式指定（如 `deepseek/deepseek-v4-flash`），实际 API 类型在日志 `modelApi` 字段体现。当前使用的是 `anthropic-messages` API（兼容 Anthropic Message API 格式）。
