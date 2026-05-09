# Zustand stores 拆分与职责

本模块按“领域状态 / UI 控制面 / 临时交互态”拆分 store，降低耦合。

## conversationStore（canonical 线程状态）

源码：`ui-react/src/store/conversation.store.ts`

职责：

- 保存每个 thread 的 `ConversationState`：`byThread[threadId]`
- 将 canonical events 送入 reducer：`applyEvents(threadId, events)`
- 将 history 作为 snapshot 送入 reducer：`setHistorySnapshot(threadId, messages)`
- 接入后台探测的 active run：`setActiveRunSnapshot(threadId, runId, startedAt)`
- 支持 edit/resend：`truncateAfter(threadId, parentId)`
- 切 session 重置线程：`resetThread(threadId)`

不做的事：

- 不发网络请求
- 不做 UI 组件的临时状态（draft、interactive summary）

## chat.store（控制面：尽量薄）

源码：`ui-react/src/store/chat.store.ts`

当前保留：

- `sessionKey`：当前选中的 session
- `messagesLoading`：history 加载控制
- `sending`：用户刚点击发送到第一帧 WS 之间的乐观窗口（让 UI 立刻进入 running）
- `lastError`：线程内的错误提示
- session list 刷新相关：`pendingSessionsReloadSeq`、`pendingHistoryReloadKey`

明确不再包含：

- `messages`（已迁移到 conversationStore）
- `activeRunState`（已迁移到 canonical pipeline）
- `runId`（取消/状态恢复使用 conversationStore 的 `activeRunId`）
- `pendingDraftMessage`（迁移到 composerStore）
- `interactiveSummaryById`（迁移到 interactionStore）

## composerStore（输入框草稿等）

源码：`ui-react/src/store/composer.store.ts`

职责：

- 保存并消费“待写入输入框”的 draft（例如从 profile 页/任务页跳转预填）

## interactionStore（交互卡提交摘要）

源码：`ui-react/src/store/interaction.store.ts`

职责：

- `interactiveSummaryById`：用户提交交互卡后的 Q/A summary（纯前端展示）

