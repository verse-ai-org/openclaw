# 场景手册

本页用“事件序列”的视角描述关键用户场景。

## 1) 加载历史（chat.history）

入口：`ui-react/src/hooks/session-manager/loaders.ts` → `loadHistoryFromGateway`

- RPC：`client.request("chat.history", { sessionKey })`
- 归一化历史：`consolidateHistoryMessages(raw, sessionKey)`
- 写入 canonical：`conversationStore.setHistorySnapshot(sessionKey, consolidated)`
- UI：selectors 投影为 `messages`

## 2) 发送消息（onNew）

入口：`GatewayChatRuntimeProvider.onNew` → `sendMessage`

- 乐观清理：`chat.store.lastError = null`
- 生成 user message 并写入 canonical：
  - `message.start`（带 attachments/metadata）
  - `message.appendText`
  - `message.end`
- `chat.store.sending = true`（让 UI 立刻进入 running）
- RPC：`chat.send`
- 后续 WS event 进入 canonical pipeline

## 3) 流式生成（WS delta / tools / tool-ui surface）

入口：`useGatewayEventBridge`

- **文本流（双源）**：
  - `agent.assistant.data.delta` → `message.appendText`（真正增量 append）
  - `chat.delta` → `message.setLiveText`（累计全文快照，用于对齐/纠偏）
- `agent.tool.start` → `tool.start`（在 parts 时间线 append tool part）
- `agent.tool.update/result/error` → 对应更新 tool part
- `tool.ui` → 更新对应 tool part 的 UI presentation（UiToolParts 渲染）

边界行为：

- tool start、run 结束时会 flush liveText 到 text part，避免丢尾部文本。

## 4) 取消（onCancel）

入口：`GatewayChatRuntimeProvider.onCancel`

- runId 来源：`conversationStore.byThread[threadId].activeRunId`（可为空）
- RPC：`chat.abort({ sessionKey, runId? })`
- 本地：`chat.store.sending=false` + `conversationStore.setActiveRunSnapshot(threadId, null)`

## 5) 编辑/重发（onEdit）

入口：`GatewayChatRuntimeProvider.onEdit`

- `conversationStore.truncateAfter(threadId, parentId)`：裁掉 parent 之后的消息（包括 toolPartIndex 清理、activeRunId 校正）
- 按“发送消息”流程重新发起一次 `chat.send`

## 6) 状态恢复（chat.status）

入口：`syncSessionRunStatusFromGateway`

- RPC：`chat.status({ sessionKey })` → `{ activeRunId, startedAtMs }`
- `conversationStore.setActiveRunSnapshot(threadId, activeRunId, startedAtMs)`
- 可选：订阅 tool stream（`chat.tools.subscribe`）
