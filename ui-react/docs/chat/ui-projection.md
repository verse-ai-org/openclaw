# UI 投影（canonical → assistant-ui）

## 1) selectors：ConversationState → ChatMessage[]

源码：`ui-react/src/store/conversation-selectors.ts`

投影的职责：

- 把 `CanonicalMessage.parts` 转成 `ChatMessage.contentBlocks`
- 把 `CanonicalMessage.status` 映射为 UI “running/complete”
- 决定 `isRunning`（通常基于 `activeRunId`）

## 2) ExternalStoreRuntime glue

源码：`ui-react/src/components/chat/gateway/providers/GatewayChatRuntimeProvider.tsx`

它把投影后的 `messages` 与 `isRunning` 交给 `useExternalStoreRuntime`：

- `convertMessage`：`convertGatewayChatMessage`（把 `ChatMessage` 转成 assistant-ui 的 message 结构）
- `onNew` / `onEdit` / `onCancel`：用户操作入口

## 3) convertGatewayChatMessage

源码：`ui-react/src/components/chat/messages/assistant-ui/convert-gateway-chat-message.ts`

- `contentBlocks` 中：
  - `text` → text part
  - `tool-call` → tool-call part（Tool UI 渲染走 tool pipeline）
  - `interactive` 不会变成 tool-call part：交互卡由 `InteractiveParts` 组件渲染

