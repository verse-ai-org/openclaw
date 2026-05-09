# Chat（ui-react）架构文档

这套文档描述 `ui-react` 里 **Chat 模块的最新实现**：从 Gateway 的 WS / history 数据进入前端后，如何被适配、归一化为 canonical events，经由 conversation reducer 生成 canonical messages，再投影给 `@assistant-ui/react` 渲染。

目标：

- **单一事实来源**：线程内消息/运行态/工具/交互，统一由 canonical event 流驱动。
- **前后端解耦**：Gateway wire format 只在适配层出现；下游只认前端自定义的 canonical protocol。
- **可测试**：conversation reducer 纯函数 + golden tests；history/snapshot 也走同一条 reducer 通道。

## 快速导航

- **总览**：`./architecture.md`
- **数据流（从 wire 到 UI）**：`./data-flow.md`
- **Canonical 协议（types + events）**：`./canonical-protocol.md`
- **Conversation reducer（状态机/约束）**：`./conversation-reducer.md`
- **Zustand stores 拆分与职责**：`./stores.md`
- **Gateway 适配与桥接**：`./gateway-integration.md`
- **UI 投影与渲染适配（assistant-ui）**：`./ui-projection.md`
- **Tool UI surfaces（含 HITL）渲染与提交**：`./tools-and-interactive.md`
- **场景手册（send/stream/cancel/edit/history/status）**：`./scenarios.md`
- **测试与调试**：`./testing-and-debugging.md`

## 相关源码入口（repo-root 相对路径）

- Canonical 协议：`ui-react/src/components/chat/conversation/types.ts`
- Reducer：`ui-react/src/components/chat/conversation/reducer.ts`
- Gateway → canonical：`ui-react/src/components/chat/conversation/gateway-adapter.ts`
- Conversation store：`ui-react/src/store/conversation.store.ts`
- 投影 selectors：`ui-react/src/store/conversation-selectors.ts`
- WS 桥接：`ui-react/src/components/chat/gateway/hooks/use-gateway-event-bridge.ts`
- Runtime provider：`ui-react/src/components/chat/gateway/providers/GatewayChatRuntimeProvider.tsx`
