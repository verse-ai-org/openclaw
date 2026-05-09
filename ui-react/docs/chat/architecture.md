# 架构总览

## 一句话版本

**Gateway wire events/history → gateway adapter → canonical chat events → conversation reducer → canonical messages → assistant-ui/render adapter**。

## 分层与依赖方向

```
Gateway WS / RPC
   ↓
gateway integration layer
  - gateway-run-adapter (wire → RunEvent)
  - conversation/gateway-adapter (RunEvent → CanonicalChatEvent)
  - use-gateway-event-bridge (注册 WS 回调，喂给 conversationStore)
   ↓
canonical conversation layer (前端协议/领域模型)
  - conversation/types.ts (CanonicalChatEvent/Message/Part/Run/State)
  - conversation/reducer.ts (applyCanonicalEvent / replayConversation)
   ↓
state layer (Zustand)
  - conversation.store.ts (byThread + applyEvents/snapshot/truncate)
  - composer.store.ts (draft 等纯 UI 状态)
  - interaction.store.ts (interactive summary 等纯 UI 状态)
  - chat.store.ts (少量控制面：sessionKey、messagesLoading、sending、lastError…)
   ↓
projection + UI
  - conversation-selectors.ts (ConversationState → ChatMessage[])
  - GatewayChatRuntimeProvider (ExternalStoreRuntime glue)
  - ThreadView / AssistantMessage / InteractiveParts / Tool UI
```

**依赖约束**：

- Gateway wire shape **不得**越过适配层（`gateway-*` 与 `conversation/gateway-adapter.ts`）。
- UI 组件 **不得**直接解析 wire payload；只消费投影后的 `ChatMessage[]`（或 canonical state）。
- Conversation reducer 必须保持 **纯函数**（无 IO、无 store 读写）。

## 核心抽象

- **CanonicalChatEvent**：前端内部的“协议层事件”，是单一事实来源。
- **ConversationState**：线程级 state（messages + runs + indices + eventLog）。
- **CanonicalMessage.parts: ChatPart[]**：统一时间线（text/tool/interactive）。
- **Projection**：把 canonical message 变成 UI 需要的 `ChatMessage`（assistant-ui runtime）。
