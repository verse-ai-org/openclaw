# 数据流（wire → canonical → UI）

## 1) WS ingress：Gateway → RunEvent

入口：`ui-react/src/components/chat/gateway/hooks/use-gateway-event-bridge.ts`

- Gateway 通过 `gateway.store` 暴露一个 `registerChatDispatch(cb)` 的回调安装点
- `useGatewayEventBridge` 在 mount 时注册 cb：`(wsEvent, payload) => …`
- `gatewayToRunEvents(wsEvent, payload)`（`gateway-run-adapter.ts`）把 wire payload 变成 **RunEvent[]**（仍不等于 canonical）

> RunEvent 是“wire 归一化后的事件”，目的是把 Gateway 的字段名/shape 隔离开，但它仍保留了 gateway 的一些语义（如累计文本流）。

文本流补充（双源）：

- `agent.stream="assistant"` 通常提供 `data.delta`（真正增量）与 `data.text`（累计全文）。
- `chat.state="delta"` 提供累计全文快照（cumulative snapshot）。
- 前端采用 **agent delta 优先 + chat 快照纠偏**：
  - agent delta → `message.appendText`
  - chat 快照 → `message.setLiveText(fullText)`，用于对齐/纠偏

## 2) Canonical adapter：RunEvent → CanonicalChatEvent

入口：`ui-react/src/components/chat/conversation/gateway-adapter.ts`

- `runEventsToCanonical(events, sessionKey, runId)` 输出 **CanonicalChatEvent[]**
- 这一步把“流式文本、tool lifecycle、tool UI（tool.ui）”等映射到 conversation reducer 认得的 canonical protocol

## 3) Canonical reducer：events → ConversationState

入口：`ui-react/src/components/chat/conversation/reducer.ts`

Reducer 做的事（高层）：

- 保持 `ConversationState` 中的 `messagesById` / `messageOrder`
- 维护 `runsById` / `activeRunId`（用于判断 `isRunning`）
- 把 streaming 文本 `message.setLiveText` 在边界处“落盘”为 `ChatPart(type="text")`
- tool 直接进入 `parts: ChatPart[]` 时间线，并能按 id 更新对应 part
- tool UI 不作为独立 part：挂在 `ToolPart.ui` 上（投影层再转成 `ContentBlock(type="ui")`）

## 4) Zustand store：按 thread 保存 conversation state

入口：`ui-react/src/store/conversation.store.ts`

- `byThread[threadId]` 存一个 thread 的 `ConversationState`
- `applyEvents(threadId, canonicalEvents)` 会顺序 apply reducer（不做副作用）
- `setHistorySnapshot(threadId, historyMessages)` 把 history 也转成 canonical snapshot 走 reducer
- `truncateAfter(threadId, parentId)` 支持 edit/resend：裁掉 parent 之后的消息与索引

## 5) Projection：ConversationState → ChatMessage[]

入口：`ui-react/src/store/conversation-selectors.ts`

- 将 canonical messages 投影成 UI 需要的 `ChatMessage[]`
- 将 `CanonicalMessage.status` 映射为 assistant-ui 运行态（例如 message 的 loading / running）
- 将 `parts: ChatPart[]` 转为 `contentBlocks`（text/tool-call/ui）

## 6) Runtime glue：ExternalStoreRuntime

入口：`ui-react/src/components/chat/gateway/providers/GatewayChatRuntimeProvider.tsx`

职责：

- 组合 `messages` 与 `isRunning`（来自 `useGatewayThreadRuntime`，内部已改为读 conversationStore）
- 提供 `onNew` / `onEdit` / `onCancel` 给 assistant-ui runtime
- `sendMessage` 负责：乐观写入 canonical user message（`message.start/appendText/end`），并发起 `chat.send`

