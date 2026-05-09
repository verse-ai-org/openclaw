# Canonical 协议（前端内部 protocol）

源码：`ui-react/src/components/chat/conversation/types.ts`

## 1) Message：CanonicalMessage + parts 时间线

`CanonicalMessage` 是“线程里的一条消息”。它不再把工具、交互、文本拆到多个并行结构里，而是统一成：

- `parts: ChatPart[]`

`ChatPart` 是一个 union：

- `text`：文本片段（被 reducer 在边界处落盘/合并）
- `tool`：工具调用（start/update/result/error 形成状态机）
- `interactive`：交互卡（HITL），作为一种 part 内联在消息时间线中

额外字段：

- `attachments?` / `metadata?`：展示层附加信息（目前用于 user message 的附件展示等），会从 UI/历史快照里保留下来，但不参与 reducer 的核心语义。

## 2) Runs：CanonicalRun + activeRunId

`CanonicalRun` 记录一次 assistant 生成（一个 run）：

- `id` / `threadId`
- `status: "running" | "finished" | "error" | "aborted"`
- `startedAt` / `finishedAt?` / `errorMessage?`
- `assistantMessageId?`：这个 run 关联的 assistant 消息（用于把工具/文本落到正确消息里）

线程级别通过 `ConversationState.activeRunId` 表达“当前是否在生成”。

## 3) Events：CanonicalChatEvent

事件分两类：

- **run lifecycle**：`run.started` / `run.finished` / `run.error` / `run.aborted`
- **message lifecycle**：`message.start` / `message.appendText` / `message.setLiveText` / `message.end`
- **tool lifecycle**：`tool.start` / `tool.update` / `tool.result` / `tool.error`
- **tool UI presentation**：`tool.ui`（interactive cards 的 UI payload）
- **snapshots**：
  - `messages.snapshot`：history 加载/重载使用
  - `run.activeSnapshot`：`chat.status` 这类 probe（只用来“恢复 activeRunId”，不是 terminal）

设计约束（前端协议侧）：

- reducer 必须可以仅靠 event stream 复现状态（`replayConversation`）。
- snapshots 不是“特权”，而是一种事件：它们也要经过 reducer，保证行为一致。

