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
        │   └── InteractiveParts    ← HITL 交互组件
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
  + interactiveStreamOrder → 交互式卡片（HITL）
  + toolStreamOrder        → 工具调用卡片（按到达顺序）
  + stream (当前流文本)    ← 追加在所有工具卡之后
```

**设计意图**：保证 `text → tool → tool → text` 的交错渲染顺序正确，流文本不会把工具卡推下去。

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
| `agent` | `interactive.result` | `commitCurrentText()` + `upsertInteractiveStream(block)` |
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
    └── InteractiveParts（HITL 交互组件）
```

**加载动画条件**：`status.type === "running" && content.length === 0`（消息开始但尚无内容时）。

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

## 八、InteractiveParts — HITL 交互模块

### 8.1 交互块来源识别算法

```
当前消息 ID
    ├── "__stream__" → 从 interactiveStreamById/Order 读取实时块
    └── 历史消息 ID
            → 找到消息索引
            → 向左/右扩展，合并同一 "assistant run" 的连续消息 [left, right]
            → 找到 run 中第一条带 interactive block 的 assistant 消息
            → 仅在 isLastAssistantInRun 时渲染（防重复）
            → right+1 的 user 消息为 nextUserMessage
```

### 8.2 交互块的 3 种状态

| 状态 | 条件 | 渲染 |
|------|------|------|
| 等待输入 | 无 storedSummary，无 nextUserMessage | 交互组件（QuestionFlow/OptionList） |
| 已提交（store 有记录） | `interactiveSummaryById[id]` 存在 | `QASummary`（只读摘要） |
| 已提交（从 history 恢复） | `nextUserMessage` 存在 | 重建摘要 → `QASummary` |

### 8.3 question_flow 子类型

| 子类型 | 检测条件 | 交互方式 |
|--------|---------|---------|
| upfront（多步问卷） | `"steps" in config` | 多步表单，`onComplete` 收集全部答案 |
| single-step（单问题） | `"step" in config` | 单问题选择，`onSelect` 触发 |
| receipt（已完成回执） | `"choice" in config && "summary" in config.choice` | 直接渲染 QASummary |

### 8.4 提交流程

```
用户操作
    ↓
onComplete / onSelect / onAction("confirm", selection)
    ↓
useChatStore.setInteractiveSummary(interactiveId, pairs)   ← 标记已提交，切换为摘要视图
    ↓
sendMessage(text)   ← ChatSendContext → GatewayChatRuntimeProvider → chat.send
    ↓
Gateway 收到用户回复 → 继续 Agent 执行
```

### 8.5 事件桥中的解析层（interactive-blocks.ts）

```
agent event (stream=tool, phase=result, toolName ∈ {question_flow, option_list})
    ↓
isInteractiveToolName() 判断
    ↓
parseInteractivePayload()
    ├── safeParseSerializableQuestionFlow()
    └── safeParseSerializableOptionList()
    ↓
createInteractiveBlock() → InteractiveContentBlock
    ↓
useChatStore.commitCurrentText()     ← 冻结当前流文本段
useChatStore.upsertInteractiveStream(block)
```

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
      ├── agent interactive   → interactiveStreamById
      └── chat.history        → messages (normalized + consolidated)
      ↓
chat.store (Zustand)
      ↓
GatewayChatRuntimeProvider
      ├── 构建流式占位消息 __stream__（committed + tools + stream）
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
| 交互块解析 | `src/hooks/chat-event-bridge/interactive-blocks.ts` |
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
| HITL 交互 | `src/components/chat/InteractiveParts.tsx` |
| 协议/数据流 | `docs/chat-module.md`（本文补充文档） |
| Tool UI 组件 | `docs/tool-ui.md` |
