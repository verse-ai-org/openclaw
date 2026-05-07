# Chat 模块深度分析

> 本文是对 [chat-module.md](./chat-module.md)（协议/数据流层）的补充，聚焦于**组件实现逻辑、渲染策略和 HITL 交互机制**。

---

## 模块全景

```
ChatPage
├── useGatewayEventBridge()           ← 注册 WS：gateway → RunEvent → run-dispatch
└── GatewayChatRuntimeProvider       ← Zustand ↔ assistant-ui ExternalStoreRuntime
    ├── ChatSidebar (Pane 2)
    └── ThreadView (Pane 3)
        ├── AssistantMessage
        │   ├── Markdown / tool-call parts
        │   ├── AssistantToolGroup / PromotedToolResult
        │   └── InteractiveParts      ← HITL（流式 __stream__ + 历史）
        ├── UserMessage
        └── Composer
```

不再使用 **`BridgeChatContext`** 或模块化 bridge 可变上下文；**`runId`** 节流由 **`dispatchRunEvents`**（结合 **`activeRunState.runId`**）处理。

---

## 一、GatewayChatRuntimeProvider

**核心职责**：把 **`chat.store.messages`** 与 **`activeRunState`** 合成 **`ExternalStoreRuntime`** 所需的 **`ChatMessage[]`**（进行中时末尾追加 **`__stream__`**）。

### 1.1 流式占位消息构建

进行中时，`use-gateway-thread-runtime.ts`：

1. **`base = mergeAssistantRunSegments(chatMessages)`**（同一 `runId` 的相邻 assistant 合并）。
2. 若 **`activeRunState !== null`**，追加 **`toLiveMessage(activeRunState)`** → `id="__stream__"`，`contentBlocks` 由 **`run-message.ts`** 的 **`buildBlocks`** 拼装。

**拼接顺序**：`committedBlocks` → **`interactiveOrder` 对应的块** → **`toolOrder` 对应的 tool-call 块** → 尾部 **live text**（在已提交前缀之后的剩余部分）。

### 1.2 消息转换 `convertGatewayChatMessage`

将 `ChatMessage` 转为 `ThreadMessageLike`（`utils/convert-gateway-chat-message.ts`）：

- **`contentBlocks`** 中的 **`text`** / **`tool-call`** 转成 assistant-ui 的 parts；**`interactive`** 类型不会变成 tool-call part，由 **`InteractiveParts`** 单独渲染。
- 无 blocks 时用扁平 **`content`**，并 **`stripAgentWrapperTags`**（`<final>` / `<plan>` 等）。

### 1.3 消息操作

| 操作 | 实现 |
|------|------|
| 发送 **`onNew`** | 校验附件 → 乐观追加 user → **`startOptimisticRun`** → **`chat.send`** |
| 编辑 **`onEdit`** | **`truncateMessagesAfter`** → **`setRunId(null)`** → 同上 |
| **`onCancel`** | **`chat.abort`** → **`activeRunState: null`**, **`setSending(false)`**, **`clearSessionGenerating`** |
| 附件 | **`createGatewayCompositeAttachmentAdapter`** |

### 1.4 `isRunning`

在 **`useGatewayThreadRuntime`** 中：

```ts
isRunning = sending || activeRunState !== null
```

**不再**在此处读取 **`pendingGenerationBySession`**。

---

## 二、useGatewayEventBridge + 规范化事件流水线

### 2.1 入口

`gateway/hooks/use-gateway-event-bridge.ts`：

- `useEffect` 内 **`registerChatDispatch((wsEvent, payload) => { … }))`**。
- **`gatewayToRunEvents(wsEvent, payload)`** → **`dispatchRunEvents(events, sessionKey, runId)`**。

Gateway 专有逻辑仅限 **`gateway-run-adapter.ts`** + **`gateway-ws-check.ts`**。

### 2.2 适配矩阵（逻辑层面）

| WS | 映射为 `RunEvent` |
|----|---------------------|
| `chat` `delta` | `text.delta`（整段 cumulative text） |
| `chat` `final` | `run.finished`（可选附带正文） |
| `chat` `error` / `aborted` | `run.error` / `run.aborted` |
| `agent` lifecycle `start` | `run.started` |
| `agent` lifecycle `end` / `error` | 不产生 `RunEvent`（收尾以 `chat` `final` / `error` 为准） |
| `agent` tool **`start`**，普通工具 | `tool.start`（触发 reducer 内 **auto-commit**） |
| `agent` tool **`start`**，`question_flow` / `option_list` / `approval_card` | **`createInteractiveBlock(..., payload: args)`** → **`interactive.start`** |
| `agent` tool **`update`/`result`/`error`**，交互工具名 | **忽略** |
| `agent` tool 非交互 | `tool.update` / `tool.result` / `tool.error` |

### 2.3 `dispatchRunEvents`（`run-stream/run-dispatch.ts`）

- 丢弃 **`sessionKey`** 非当前 **`getActiveChatSessionKey()`** 的批次。
- **`run.started`**：**`applyRunEvent`**（从已有 **`activeRunState`** 或 **`emptyRunState`** 起算）。
- **`eventRunId`** 与 **`activeRunState.runId`** 均为真且不一致时：**丢弃**。
- 终端：**`toFinalMessage`** → **`messages`**、**`activeRunState: null`**、**`triggerSessionsReload()`**——**不因正常结束强行 `pendingHistoryReloadKey`**。

### 2.4 快照一致性

终端分支在单次 **`applyRunEvent`** 之后基于同一份 **`RunState`** 调用 **`toFinalMessage`**，再写 store。

---

## 三、ChatSidebar — 双面板滑动导航

**布局**：`AgentList` 与 `AgentSessionList` 同轨 **`width=200%`**，用 **`translate-x-0 / -translate-x-1/2`** 切换；轨道 **`shrink-0 w-[200%]`**，外层 **`min-w-0`**。

**外部 **`sessionKey`****：`useEffect` 解析 `agent:{id}:*`，切到对应 agent 与会话视图。

**AgentSessionList**：按 agent 前缀过滤；删除需确认；网关断开时禁用新建会话。

---

## 四、ThreadView — 聊天主视图

**`ThreadPrimitive.Messages key={sessionKey}`**：切换 session 卸载重建，避免 runtime 索引与旧 **`useMessage()`** 错位。

**加载态**：`showMessageList = !messagesLoading || messages.length > 0`，避免清空与请求之间的空列表挂载竞态。

**子组件**：`MessageSkeleton`、`ThreadWelcome`、`ErrorBanner`、`ScrollToBottom`。

---

## 五、AssistantMessage 渲染流水线

```
useMessage() → content parts (text | tool-call)
    │
    ├── text → AssistantMarkdownPart
    ├── PromotedToolResult / AssistantToolGroup（ToolFallback）
    └── InteractiveParts（HITL）
```

加载动画：**`status.type === "running" && content.length === 0`**。

---

## 六、Composer — `pendingDraftMessage`

外部可设 **`chat.store.pendingDraftMessage`**：Composer **挂载时**消费一次 **`composerRuntime.setText`**；若已挂载则 **`useChatStore.subscribe`** 回填。

---

## 七、ToolFallback / ToolCallGroup

见 **`tool/`** 目录（`classify.ts`、`build-model.ts`、`rich-presentation.tsx` 等）。

实时 tool 卡参数/摘要仍可使用 **`utils/tool-stream-format.ts`**；**UI 拼装顺序**由 **`run-message.ts`** 里的 **`toolOrder`** 决定。

---

## 八、InteractiveParts — HITL

### 8.1 块来源

| `messageId` | 数据源 |
|-------------|--------|
| **`__stream__`** | **`activeRunState.interactiveById` / `interactiveOrder`**（与 **`toLiveMessage`** 一致） |
| 历史 assistant id | **`mergeAssistantRunSegments`** 后扩展同一 **run**，取 **`contentBlocks`** 里的 **`type: \"interactive\"`** |

仅在合并 run **最后一条 assistant** 上渲染，防重复。

### 8.2 展示态

| 状态 | 条件 |
|------|------|
| 表单 | 无 **`interactiveSummaryById[id]`** 且无已提交样式的 **nextUserMessage** |
| QASummary | **`setInteractiveSummary`** 或 **handler.buildSubmittedSummary** |

### 8.3 提交流程

**`useChatStore.getState().setInteractiveSummary(interactiveId, pairs)`** → **`sendMessage`** → **`chat.send`**。

### 8.4 适配层：`interactive.start`

**`gateway-run-adapter`** 在 **`tool.start`** 且 **`isInteractiveToolName`** 时：**`createInteractiveBlock({ interactiveId: toolCallId, kind: name, payload: data.args })`** → **`interactive.start`**。**`run-state`** 先 **auto-commit** 再写入 **interactive** 映射。**`result`**（常为 meta/id）不参与渲染。

---

## 九、数据流小结

```
Gateway WebSocket
      ↓
useGatewayEventBridge
      → gatewayToRunEvents (gateway-run-adapter)
      → dispatchRunEvents (run-dispatch)
           → applyRunEvent (run-state) ↔ chat.store.activeRunState
           → terminal → toFinalMessage → chat.store.messages
      ↓
useGatewayThreadRuntime
      → mergeAssistantRunSegments + toLiveMessage(activeRunState?)
      ↓
ExternalStoreRuntime + convertGatewayChatMessage
      ↓
ThreadPrimitive → Messages / Composer
```

---

## 十、相关文件速查

| 功能区 | 路径 |
|--------|------|
| 页面 | `src/pages/ChatPage.tsx` |
| WS | `gateway/hooks/use-gateway-event-bridge.ts`, `gateway/gateway-run-adapter.ts`, `gateway/gateway-ws-check.ts` |
| Run 流水线 | `src/run-stream/` |
| Store | `src/store/chat.store.ts` |
| Runtime | `gateway/providers/GatewayChatRuntimeProvider.tsx`, `use-gateway-thread-runtime.ts` |
| Session | `session-scope.ts`, `active-session.ts` |
| Sidebar / Thread | `ChatSidebar.tsx`, `ThreadView.tsx`, `Composer.tsx`, `AssistantMessage.tsx` |
| HITL | `interactive/InteractiveParts.tsx`, `interaction-tool-architecture.md` |
| 协议 | [chat-module.md](./chat-module.md), [tool-ui.md](./tool-ui.md) |
