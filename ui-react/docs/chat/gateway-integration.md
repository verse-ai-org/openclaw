# Gateway 集成（wire 隔离）

目标：Gateway 的 WS payload / history shape **只出现在适配层**，下游一律 canonical。

## 1) wire check（unknown → record）

源码：`ui-react/src/components/chat/gateway/gateway-ws-check.ts`

- 对 `agent` payload 做最小校验（runId/stream/data 等）
- 对 `chat` payload 做最小收敛（目前更宽松）

## 2) gateway-run-adapter（wire → RunEvent）

源码：`ui-react/src/components/chat/gateway/gateway-run-adapter.ts`

职责：

- 这是**唯一**知道 Gateway 字段名（`state` / `stream` / `phase` / `args` …）的文件
- 生成 `RunEvent[]`：
  - `chat.delta` → `text.delta`（累计文本）
  - `chat.final` → `run.finished`
  - `chat.error` / `chat.aborted` → `run.error` / `run.aborted`
  - `agent.lifecycle start` → `run.started`（end/error 不映射，避免早终止）
  - `agent.assistant`：
  - `data.delta` → `text.append`（真正的增量 append）
  - `data.text` 作为 `fullText?` 携带（调试/旁路；**流式正文以 append 为准**，终态全文以 `chat.final` 为准）
  - `agent.tool`：
    - 普通 tool：`tool.start/update/result/error`
    - tool-ui surface：`tool.start` 时解析 args，并额外发出 `tool.ui`（tool UI presentation）

> tool-ui surface 的 `update/result` 事件多数不携带 UI payload，但它们仍会作为 tool lifecycle 事件进入 canonical（便于调试/日志一致性）。

## 3) conversation/gateway-adapter（RunEvent → CanonicalChatEvent）

源码：`ui-react/src/components/chat/conversation/gateway-adapter.ts`

职责：

- 把 RunEvent 变成 conversation reducer 的 canonical events
- 统一携带 threadId/runId/ts 等字段，确保 reducer 可 replay

文本流策略（避免 mid-run 双源冲突）：

- **主路径**：`text.append` → `message.appendText`（append-only；流式正文以 agent 为准）
- **终态对齐**：`run.finished`（`chat.final` 携带 `text`）→ `message.setLiveText(fullText)` 一次，用于最终与刷新后只收到 final 的兜底
- **不再**把 `text.delta`（`chat.delta`）映射为 `message.setLiveText`，避免与 append 交叉触发 reducer 的 hard mismatch / reset（含 tool 段落被清空）
- Reducer 仍会在收到 `message.setLiveText` 时做前缀/尾部修剪判断；不一致时仍以该快照重置该条消息的文本

## 4) useGatewayEventBridge（注册 + 喂 reducer）

源码：`ui-react/src/components/chat/gateway/hooks/use-gateway-event-bridge.ts`

- 注册 dispatch
- `gatewayToRunEvents` → `runEventsToCanonical` → `conversationStore.applyEvents`
- terminal 事件用于清理 `chat.store.sending`，并设置 `lastError`（控制面行为）

