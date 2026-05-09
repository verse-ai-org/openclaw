# Tools 与 Interactive（HITL）

## Tool calls（非 interactive）

来源：

- Gateway `agent.stream=tool` 的普通工具调用

路径：

- wire → `gateway-run-adapter.ts` → `RunEvent(tool.*)`
- `conversation/gateway-adapter.ts` → `CanonicalChatEvent(tool.*)`
- reducer：在 assistant message 的 `parts` 时间线里插入/更新 `{ type: "tool" }`

渲染：

- `convertGatewayChatMessage` 把 tool part 转成 assistant-ui 的 tool-call part
- Tool UI 组件树（ToolCallGroup / ToolFallback / drawers 等）负责展示输入/输出/状态

## Interactive（HITL 交互卡）

来源：

- Gateway `agent.stream=tool`，且 tool name 属于 interactive 工具（例如 `question_flow` / `option_list` / `approval_card`）

关键差异：

- interactive 的 **UI payload 在 start.args** 上最完整，因此适配层会在 `tool.start` 的同时发出 `tool.ui`（UI presentation）
- interactive 后续的 update/result 大多对 UI 无价值（或仅 meta/id），但仍会作为 tool lifecycle 事件进入 canonical（用于调试/一致性）

渲染：

- `InteractiveParts` 组件从 message 的 `contentBlocks` 中取 `type="interactive"` 的 blocks 渲染
- 交互提交后的 summary（Q/A 结果）放在 `interactionStore.interactiveSummaryById`

提交：

- interactive 的“提交动作”最终会走 `sendMessage`（`chat.send`），并在本地先写入 canonical user message（乐观）
