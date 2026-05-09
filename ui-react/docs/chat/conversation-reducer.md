# Conversation reducer（线程状态机）

源码：`ui-react/src/components/chat/conversation/reducer.ts`

## 目标

- 将 **canonical event stream** 规约成 `ConversationState`
- 保证消息/运行态/工具/交互在同一时间线里一致更新
- 允许 replay（黄金测试 / debug）

## 关键机制

### 1) live text buffer → text parts

Gateway 的 `delta` 是 **累计文本**（full snapshot），为了避免每次 delta 都 append 新 part，reducer 使用：

- `liveTextByMessageId: Map<messageId, fullText>`

在“边界事件”上触发 flush（例如 tool start、run 结束等）把 liveText 固化为一个 `ChatPart(type="text")`，并清空 buffer。

### 2) tool part 的按 id 原地更新

为了让 `tool.update` / `tool.result` / `tool.error` 能快速定位对应的 part，state 里维护：

- `toolPartIndex: Map<toolCallId, { messageId, index }>`

当 `tool.start` append part 时写入 index；后续更新可 O(1) 定位并替换该 part。

### 3) “确保有 assistant 消息行”

在 streaming 的最早阶段可能只收到 `message.setLiveText`（没有显式 message.start），reducer 会在必要时为 run 生成一个 assistant message（避免 UI 没有 message row 可渲染）。

## 不变式（invariants）

- `messageOrder` 是显示顺序；`messagesById` 是实体存储，二者必须一致
- `activeRunId` 若存在，则 `runsById.get(activeRunId)?.status === "running"`
- toolPartIndex 指向的 message 必须存在且 partIndex 有效；truncate 时必须清理它

