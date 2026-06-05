# 场景手册

本页用“事件序列”的视角描述关键用户场景。

## 1) 加载历史（chat.history）

入口：`ui-react/src/hooks/session-manager/loaders.ts` → `loadHistoryFromGateway`

- RPC：`client.request("chat.history", { sessionKey })`
- 归一化历史：`consolidateHistoryMessages(raw, sessionKey)`
- 写入 canonical：`conversationStore.setHistoryCanonicalSnapshot(...)`
- 每条 user/assistant 行可带 `artifactRefs`（Gateway `projectChatHistoryMessagesWithArtifacts`）
- 侧载：`artifacts.list` 预取 → `artifact-cache.store`（chip 标题 / `download.mode`）
- UI：`MessageArtifactRefs` + `ArtifactRefChip`（交互矩阵见 [`artifacts/artifact-chip-interaction.md`](../artifacts/artifact-chip-interaction.md)：图片预览；助手文件 chip 主点击预览；Electron path-ref 用 `ArtifactSummary.localRevealPath` 在文件夹中显示，刷新后由 history 恢复）

## 2) 发送消息（onNew）

入口：`GatewayChatRuntimeProvider.onNew` → `sendMessage`

- 乐观清理：`chat.store.lastError = null`
- 生成 user message 并写入 canonical：
  - `message.start`（带 attachments/metadata）
  - `message.appendText`
  - `message.end`
- `chat.store.sending = true`（让 UI 立刻进入 running）
- RPC：`chat.send`（图片 → `attachments` base64；Electron 文档 → `attachmentRefs`；Web 文档 → base64 `attachments`）
- `chat.send` ack 可带 `artifacts[]` → `message.bindArtifacts` 绑定到乐观 user 消息
- Gateway transcript user 行：文本 + 结构化 `file` 块（path-ref，含 `localRevealPath`），供 `artifacts.list` / `chat.history` `artifactRefs` + reveal
- 后续 WS event 进入 canonical pipeline

## 3) 流式生成（WS delta / tools / tool-ui surface）

入口：`useGatewayEventBridge`

- **文本流**：
  - `agent.assistant.data.delta` → `message.appendText`（流式正文）
  - `chat.delta` → wire 上仍为 `text.delta`，**不**再进入 `message.setLiveText`（避免与 append 双源 mid-run 冲突）
  - `chat.final`（`run.finished` + `text`，可选 `artifacts` / `artifactRefs`）→ `message.setLiveText` + `message.bindArtifacts`（助手产出图 chip）
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

## 7) 长会话中的进行中反馈

- **列表内**：`ToolCallGroup` header 的 running badge（随消息滚动，长线程时可能不在视口内）。
- **Sticky footer**：`ContextNotice` 在 context used 左侧渲染 `ThreadRunningIndicator`（`thread.isRunning`，与 Composer Cancel 同源）；无 context 数据时仍可单独显示 Running pill。
