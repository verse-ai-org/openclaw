# Chat 模块深度分析

> 本文是对 `chat-module.md`（协议/数据流层）的补充，聚焦于**组件实现逻辑、渲染策略和 HITL 交互机制**。

---

## 模块全景

```
ChatPage
├── useChatEventBridge              ← Gateway WS 事件 → Zustand 状态变更
└── GatewayChatRuntimeProvider      ← Zustand ↔ assistant-ui ExternalStoreRuntime
    ├── ChatSidebar (Pane 2)        ← 左侧导航面板
    │   ├── AgentList               ← Agent 列表（默认视图）
    │   └── AgentSessionList        ← 会话列表（钻入视图）
    └── ThreadView (Pane 3)         ← 聊天主区域
        ├── AssistantMessage        ← AI 消息渲染
        │   ├── AssistantMarkdownPart
        │   ├── AssistantLoadingIndicator
        │   ├── AssistantToolGroup / PromotedToolResult
        │   └── InteractiveParts    ← `<ask>` 交互分发器（首屏渲染 QuestionFlow / OptionList）
        ├── UserMessage             ← 用户消息渲染
        └── Composer                ← 输入框 + 附件
```

---

## 一、GatewayChatRuntimeProvider

**核心职责**：将 Zustand `chat.store` + Gateway WebSocket 客户端桥接为 `assistant-ui` 的 `ExternalStoreRuntime`。

### 1.1 流式占位消息构建

生成进行中时，动态构造 `id="__stream__"` 的临时 assistant 消息，`contentBlocks` 按以下顺序合并：

```
committedBlocks           ← 工具调用前已冻结的文本段
  + pending interactions   → 未绑定 messageId 的 <ask> 请求（来自 interactions slice）
  + toolStreamOrder        → 工具调用卡片（按到达顺序）
  + stream (当前流文本)    ← 追加在所有工具卡之后
```

**设计意图**：保证 `text → tool → tool → text` 的交错渲染顺序正确，流文本不会把工具卡推下去。Pending interactions（尚未绑定到持久 messageId 的 `interaction_request`）作为 `type: "interaction"` content part 挂在 `__stream__` 占位消息上，等 runner 完整持久化后会直接出现在该助手消息的 content blocks 里。

### 1.2 消息转换 `convertMessage`

将 `ChatMessage` 转为 `ThreadMessageLike`：

- 优先使用 `contentBlocks` 有序模式（保留交错顺序）
- 降级到 `content + toolCalls` 扁平模式（兼容旧格式）
- 对文本内容调用 `stripAgentWrapperTags` 剥除 `<final>/<plan>` 标签

### 1.3 消息操作

| 操作 | 实现 |
|------|------|
| 发送新消息 `onNew` | 解析附件 → 乐观追加用户消息 → `chat.send` |
| 编辑历史消息 `onEdit` | `truncateMessagesAfter(parentId)` → 重新发送 |
| 取消生成 `onCancel` | `chat.abort` + 重置 stream 状态 |
| 附件处理 | `createGatewayCompositeAttachmentAdapter`（图片/文件 base64）|

### 1.4 `isRunning` 判断

```ts
isRunning = sending || stream !== null || pendingForActiveSession != null
```

`pendingForActiveSession` 支持跨 session 切换场景：用户切走再切回时，若 Gateway 仍在生成，UI 仍显示 running 状态。

---

## 二、useChatEventBridge

注册全局 dispatch，将 Gateway 推送的 WebSocket 事件转换为 Zustand store 操作。

### 2.1 处理的事件矩阵

| 事件 | 状态/条件 | Store 操作 |
|------|---------|-----------|
| `chat` | `delta` | `setStream(text)` 设置累积流文本，`markSessionGenerating` |
| `chat` | `final`（有文本+工具） | 合并 `contentBlocks` → `setMessages` → `resetStream` |
| `chat` | `final`（有文本，无工具） | 追加 assistant 行 → `resetStream` |
| `chat` | `final`（无文本，有缓冲） | `finalizeStream()` |
| `chat` | `final`（无文本，无缓冲） | `resetStream` + `setPendingHistoryReloadKey` |
| `chat` | `error` / `aborted` | `resetStream` + `setSending(false)` + 设置错误提示 |
| `agent` | `tool.start` | `commitCurrentText()` + `upsertToolStream({phase:"start"})` |
| `agent` | `tool.result` | `upsertToolStream({phase:"result", output})` |
| `agent` | `tool.error` | `upsertToolStream({phase:"error", error})` |
| `agent` | `stream="interaction"`, `phase="request"` | `commitCurrentText()` + `upsertInteraction({id, component, request, status:"pending"})` |
| `agent` | `stream="interaction"`, `phase="response"` | `setInteractionResponse({id, data, status})` |
| `chat.history` | — | `mergeToolResults` → `normalizeRole` → `extractContentBlocks` → `consolidateToolMessages` → `setMessages` |

### 2.2 Session 作用域

所有事件先通过 `isChatEventForActiveSession(sessionKey)` 过滤，只处理当前活跃 session 的消息。跨 session 的生成状态（`markSessionGenerating`/`clearSessionGenerating`）不受此过滤，实现后台静默跟踪。

---

## 三、ChatSidebar — 双面板滑动导航

### 3.1 布局原理

```
[固定搜索框]
[滑动轨道 width=200%]
  ├── Panel 1: AgentList    (左半, 50%)
  └── Panel 2: AgentSessionList (右半, 50%)
```

通过 CSS `translate-x-0 / -translate-x-1/2` 切换面板，无需额外依赖。

**关键约束**：轨道设置 `shrink-0 w-[200%]`，viewport 设置 `min-w-0`，防止 flex 收缩导致两个面板同时可见。

### 3.2 外部 sessionKey 同步

```ts
useEffect(() => {
  // 解析 "agent:{id}:*" 格式的 sessionKey
  // 找到对应 agent 并切换到 sessions 视图
}, [agentsList, sessionKey]);
```

支持从其他页面（如定时任务"在聊天中查看"）导航过来时自动定位，不依赖 `activeAgent` 状态保护，保证外部跳转永远优先。

### 3.3 AgentSessionList

- 过滤条件：`session.key.startsWith("agent:{id}:")`
- 相对时间格式：`Just now / Xm ago / Xh ago / Yesterday / Xd ago`
- 删除：Hover 显示按钮 → AlertDialog 二次确认
- 新建会话：Gateway 断开时禁用（`isConnected` 判断）

---

## 四、ThreadView — 聊天主视图

### 4.1 消息列表挂载保护

```tsx
<ThreadPrimitive.Messages
  key={sessionKey}   // ← 切换 session 时完全卸载重建
  ...
/>
```

**原因**：不加 `key` 时，切 session 后旧消息组件的 `useMessage()` 订阅仍在运行，在 runtime 消息数为 0 时触发 `tapClientLookup` 索引越界崩溃。

### 4.2 加载态处理

```ts
showMessageList = !messagesLoading || messages.length > 0
```

`loadHistory` 会先清空 store 再等待网络，`messagesLoading=true` 且 `messages=[]` 期间跳过消息列表挂载，避免 race condition。

### 4.3 子组件职责

| 组件 | 职责 |
|------|------|
| `MessageSkeleton` | 加载占位骨架（pulse 动画） |
| `ThreadWelcome` | 空线程欢迎页 |
| `ErrorBanner` | 错误提示条（可关闭），直接操作 `useChatStore.getState()` |
| `ScrollToBottom` | 悬浮按钮，使用 `ThreadPrimitive.ScrollToBottom` |

---

## 五、AssistantMessage 渲染流水线

```
useMessage() → content[] (TextPart | ToolCallPart)
    │
    ├── textParts → AssistantMarkdownPart（Markdown 渲染）
    ├── toolParts → PromotedToolResult（可提升的富媒体直接显示）
    ├── toolParts → AssistantToolGroup（折叠工具卡组）
    └── InteractiveParts（`<ask>` 交互分发器，读 interactions slice）
```

**加载动画条件**：`status.type === "running" && content.length === 0`（消息开始但尚无内容时）。

`InteractiveParts` 不再接收 `messageId` prop：它通过 `useMessage()` 读取当前消息的 id，再过滤当前消息 `contentBlocks` 里 `type: "interaction"` 的 part，然后从 `chat.store.interactions[interactionId]` 取状态并交给对应渲染器。

---

## 六、Composer — 输入框

### 6.1 pendingDraftMessage 机制

外部页面（如 Agent Profile）可以设置 `chat.store.pendingDraftMessage`，Composer 在以下两个时机消费：

1. **挂载时**：一次性读取并调用 `composerRuntime.setText`
2. **已挂载时**：通过 `useChatStore.subscribe` 监听变化，实时填入

两路并行保证无论 Composer 是否已挂载都能正常预填。

---

## 七、ToolFallback 模块

### 7.1 工具分类系统

`classifyTool(name)` 通过正则匹配工具名称返回 9 类，每类有对应图标色彩：

| 类别 | 图标 | 颜色 | 触发词 |
|------|------|------|-------|
| read | FileText | 蓝色 | get/fetch/read/view |
| write | Pencil | 琥珀色 | write/edit/update/create |
| exec | Terminal | 紫色 | exec/run/shell/bash |
| search | Search | 青色 | search/find/grep/query |
| web | Globe | 天蓝色 | web/http/url/browse |
| database | Database | 橙色 | db/sql/mongo/redis |
| file | Folder | 黄色 | file/dir/ls/mkdir |
| function | FunctionSquare | 靛蓝色 | function/call/invoke |
| default | Wrench | 灰色 | 其他 |

### 7.2 数据模型构建管道

```
ToolFallbackPartProps
    ↓
buildArgsInfo(toolName, argsText)
    → 按类别提取关键参数字段（exec: command/cwd，read: path，search: query/scope）
    ↓
buildResultInfo(category, resultStr)
    → 按类别解析结果摘要（exec: exit_code, search: matches_count）
    ↓
resolveRichToolPresentation(toolName, result)
    → 检测并渲染富媒体内容（见 7.3）
    ↓
ToolDetailModel { toolLabel, category, statusType, summaryPreview,
                  argsFields, resultFields, richContent, canPromoteRichContent }
```

### 7.3 富媒体渲染（rich-presentation）

支持以下特殊工具名的结构化渲染：

| 工具名 | 组件 | canPromote |
|--------|------|-----------|
| `weather_widget` | `WeatherWidget` | ✅ 可提升到消息主区域 |
| `chart` | `Chart` | ✅ |
| `item_carousel` | `ItemCarousel` | ✅ |
| `geo_map` | `GeoMap` | ✅ |
| `link_preview` | `LinkPreview` | ✅ |
| `stats_display` | `StatsDisplay` | ✅ |
| `code_block` | `CodeBlock` | ❌ 仅在 Drawer 内显示 |
| `terminal_output` | `Terminal` | ❌ 仅在 Drawer 内显示 |

`canPromote=true` 的内容通过 `PromotedToolResult` 组件提升到 `AssistantMessage` 主区域直接展示，不依赖用户展开 ToolCallGroup。

### 7.4 ToolFallback 行内卡片

```
[类别图标] [Action标签] - [首个参数预览]  [状态徽章 Running/Done/Failed] [>]
```

点击 → 弹出 `ToolDetailDrawer`（右侧 72vw 抽屉）：
- **Overview**：类型/关键参数/结果字段卡片
- **Result preview**：富媒体内容（如存在）
- **Error**：错误信息（失败时）
- **Arguments**：解析视图 + 可切换 Raw JSON
- **Raw result**：默认折叠，支持 Markdown 渲染 + frontmatter 解析
- **Footer**：Copy raw / Close

### 7.5 ToolCallGroup 状态管理

将 assistant-ui 传入的连续工具调用块 `[startIndex, endIndex]` 包装为折叠面板。

**状态推导**：
```
messageIsRunning → "running"（即使已有失败，但展示 failCount）
有 isError=true  → "failed"
有无结果工具     → "failed"（历史遗留态）
否则             → "done"
```

**自动折叠**：生成结束时，若用户未手动操作（`userToggledRef=false`），自动折叠工具组。

**Header 图标摘要**：从工具名中提取最多 4 个不重复的类别图标，超出显示 `+N`。

---

## 八、InteractiveParts — `<ask>` 交互协议

从本迭代起，`question_flow` / `option_list` **不再是工具**。助手通过内联
`<ask component="..." id="...">…</ask>` 标签发起结构化输入请求，runner
在流里解析标签 → 登记 pending → 生成 `interaction_request` 消息 → 挂起
等待 `chat.interactionRespond`。详细契约见
`skills/openclaw-interactions/SKILL.md`。

### 8.1 客户端数据模型

**chat.store.interactions 切片**（`Record<interactionId, InteractionState>`）：

```ts
type InteractionState = {
  id: string;
  component: string;             // "question_flow" | "option_list" | ...
  request: unknown;              // payload object (schema in @openclaw/interactions)
  status: "pending" | "submitted" | "cancelled" | "timed_out";
  response?: unknown;            // present once resolved
  messageId?: string;            // bound once the interaction_request message persists
  createdAt: number;
};
```

来源：`agent` 事件 `stream="interaction"` 由 `handlers/agent-event.ts` 分发
给 `handleInteractionStream`（`phase="request"` → `upsertInteraction`；
`phase="response"` → `setInteractionResponse`）。

### 8.2 content part 定位

当 runner 把 `interaction_request` 持久化到 session 后，消息的
`contentBlocks` 中会出现 `{type: "interaction", interactionId}` part；
`buildRuntimeMessages` 会把还没有 `messageId` 的 pending interaction 作为
相同形状的 part 附加到 `__stream__` 占位消息上，保持渲染位置稳定。

### 8.3 分发器

`InteractiveParts` 是无状态分发器：

1. `useMessage()` 读取当前消息及其 content blocks。
2. 过滤出所有 `type === "interaction"` 的 part，拿到 `interactionId` 列表。
3. 从 `useChatStore(state => state.interactions)` 解析 `InteractionState`。
4. 在 `INTERACTION_RENDERERS[component]` 里找到对应渲染器（如
   `QuestionFlow`、`OptionList`），以 `request`、`response`、`status`
   作为 props 传入。
5. 用户动作触发 `useChatSend().respondInteraction({ interactionId, data, status })`。

未注册的 component 或未解析的 payload 会静默跳过，不抛异常。

### 8.4 响应回路

```
用户操作（QuestionFlow submit / OptionList pick / Cancel）
    ↓
useChatSend().respondInteraction({ interactionId, data, status })
    ↓
GatewayChatRuntimeProvider.respondInteraction
    ├── 乐观：useChatStore.setInteractionResponse(...)
    └── RPC：chat.interactionRespond
         ↓
      Gateway: src/gateway/server-methods/interactions.ts
         ↓
      runner-suspend.resolvePendingInteraction(interactionId, ...)
         ↓
      emitAgentEvent({ stream: "interaction", phase: "response", ... })
         ↓
      runner: 写入 interaction_response 消息 + 恢复生成
```

RPC 失败时 UI 回滚到 `status: "pending"` 并提示错误。`interactionRespond`
handler 自身是幂等的（同一 id 第二次提交直接成功返回），因此重试安全。

### 8.5 状态渲染

| 状态 | 条件 | 渲染 |
|------|------|------|
| pending | `status === "pending"` 且无 `response` | 交互组件（支持用户输入） |
| submitted / cancelled / timed_out | `status` 非 pending | 只读摘要（`QASummary` 风格） |
| 未知 component 或 request schema 校验失败 | — | 不渲染（由 tool group 兜底显示 raw） |


---

## 九、完整数据流总结

```
Gateway WebSocket
      ↓
useChatEventBridge (dispatch)
      │
      ├── chat delta/final    → stream / messages
      ├── agent tool.start    → commitCurrentText + toolStreamById
      ├── agent tool.result   → toolStreamById (update)
      ├── agent interaction request  → commitCurrentText + interactions[id]=pending
      ├── agent interaction response → interactions[id]=submitted/cancelled
      └── chat.history        → messages (normalized + consolidated)
      ↓
chat.store (Zustand)
      ↓
GatewayChatRuntimeProvider
      ├── 构建流式占位消息 __stream__（committed + pending interactions + tools + stream）
      ├── convertMessage() → ThreadMessageLike
      └── ExternalStoreRuntime
            ↓
      assistant-ui ThreadPrimitive
            ↓
      ┌─────────────┬──────────────────────────────┐
      │ UserMessage │ AssistantMessage              │
      │             │  ├── MarkdownPart             │
      │             │  ├── PromotedToolResult       │
      │             │  │    └── 富媒体直接展示       │
      │             │  ├── AssistantToolGroup       │
      │             │  │    └── ToolFallback        │
      │             │  │         ├── 行内卡片        │
      │             │  │         └── ToolDetailDrawer│
      │             │  └── InteractiveParts         │
      │             │       ├── QuestionFlow        │
      │             │       ├── OptionList          │
      │             │       └── QASummary           │
      └─────────────┴──────────────────────────────┘
                    ↓
                 Composer
              (sendMessage → chat.send)
```

---

## 十、相关文件速查

| 功能区 | 文件路径 |
|--------|---------|
| 页面入口 | `src/pages/ChatPage.tsx` |
| 事件桥 | `src/hooks/chat-event-bridge/useChatEventBridge.ts` |
| 交互事件处理 | `src/hooks/chat-event-bridge/handlers/agent-event.ts`（`handleInteractionStream`） |
| 消息规范化 | `src/hooks/chat-event-bridge/message-normalize.ts` |
| 工具块提取 | `src/hooks/chat-event-bridge/tool-blocks.ts` |
| 聊天状态 | `src/store/chat.store.ts` |
| Runtime 桥接 | `src/components/chat/GatewayChatRuntimeProvider.tsx` |
| 侧边栏 | `src/components/chat/ChatSidebar.tsx` |
| Agent 列表 | `src/components/chat/AgentList.tsx` |
| 会话列表 | `src/components/chat/AgentSessionList.tsx` |
| 消息列表视图 | `src/components/chat/ThreadView.tsx` |
| AI 消息渲染 | `src/components/chat/AssistantMessage.tsx` |
| 输入框 | `src/components/chat/Composer.tsx` |
| 工具调用分组 | `src/components/chat/ToolCallGroup.tsx` |
| 工具卡片 | `src/components/chat/ToolFallback/index.tsx` |
| 富媒体解析 | `src/components/chat/ToolFallback/rich-presentation.tsx` |
| Drawer 子组件 | `src/components/chat/ToolFallback/sections.tsx` |
| `<ask>` 分发器 | `src/components/chat/InteractiveParts.tsx` |
| 交互 RPC 客户端 | `src/providers/chat/GatewayChatRuntimeProvider.tsx`（`respondInteraction`） |
| 交互协议 skill | `skills/openclaw-interactions/SKILL.md` |
| 交互 schema/registry | `packages/interactions/src/` |
| 协议/数据流 | `docs/chat-module.md`（本文补充文档） |
| Tool UI 组件 | `docs/tool-ui.md` |
