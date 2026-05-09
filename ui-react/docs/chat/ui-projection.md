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

源码：`ui-react/src/components/chat/adapters/assistant-ui/to-assistant-ui-thread-message.ts`

- `contentBlocks` 中：
  - `text` → text part
  - `tool-call` → tool-call part（工具日志 / ToolCallGroup）
  - `ui` → 编码为特殊 `tool-call`（`toolName="__ui__"`，args 含 `uiId/component/payload`），由 `UiToolParts` 渲染

> 注意：assistant-ui runtime 不支持未知的 message part type（例如 `type="ui"`）。因此 `ui` surface 需要通过 `tool-call` 进行承载与透传。

