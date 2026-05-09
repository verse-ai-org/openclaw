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
    - `data.text` 作为 `fullText?` 携带（用于对齐/调试；真相仍以 `chat` 快照为准）
  - `agent.tool`：
    - 普通 tool：`tool.start/update/result/error`
    - tool-ui surface：`tool.start` 时解析 args，并额外发出 `tool.ui`（tool UI presentation）

> tool-ui surface 的 `update/result` 事件多数不携带 UI payload，但它们仍会作为 tool lifecycle 事件进入 canonical（便于调试/日志一致性）。

## 3) conversation/gateway-adapter（RunEvent → CanonicalChatEvent）

源码：`ui-react/src/components/chat/conversation/gateway-adapter.ts`

职责：

- 把 RunEvent 变成 conversation reducer 的 canonical events
- 统一携带 threadId/runId/ts 等字段，确保 reducer 可 replay

文本流策略（双源）：

- **主路径**：`text.append` → `message.appendText`（append-only）
- **兜底纠偏**：`text.delta`（来自 `chat.delta`）→ `message.setLiveText(fullText)`（cumulative snapshot）
- Reducer 会把 `fullText` 视为权威快照：若与已提交前缀不一致，会重置该 message 的文本到快照

## 4) useGatewayEventBridge（注册 + 喂 reducer）

源码：`ui-react/src/components/chat/gateway/hooks/use-gateway-event-bridge.ts`

- 注册 dispatch
- `gatewayToRunEvents` → `runEventsToCanonical` → `conversationStore.applyEvents`
- terminal 事件用于清理 `chat.store.sending`，并设置 `lastError`（控制面行为）

