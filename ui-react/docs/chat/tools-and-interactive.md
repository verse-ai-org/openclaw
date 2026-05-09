# Tools 与 Interactive（HITL）

## Tool calls（非 tool-ui surface）

来源：

- Gateway `agent.stream=tool` 的普通工具调用

路径：

- wire → `gateway-run-adapter.ts` → `RunEvent(tool.*)`
- `conversation/gateway-adapter.ts` → `CanonicalChatEvent(tool.*)`
- reducer：在 assistant message 的 `parts` 时间线里插入/更新 `{ type: "tool" }`

渲染：

- `convertGatewayChatMessage` 把 tool part 转成 assistant-ui 的 tool-call part
- Tool UI 组件树（ToolCallGroup / ToolFallback / drawers 等）负责展示输入/输出/状态

## Tool UI surfaces（含 HITL）

来源：

- Gateway `agent.stream=tool`，且 tool name 属于 tool-ui 组件（例如 `question_flow` / `option_list` / `approval_card` / `chart` / `geo_map` …）

关键差异：

- tool UI 的 **UI payload 通常在 start.args** 上最完整，因此适配层会在 `tool.start` 的同时发出 `tool.ui`（UI presentation）
- 后续的 update/result 可能对 UI 无价值（或仅 meta/id），但仍会作为 tool lifecycle 事件进入 canonical（用于调试/一致性）

渲染：

- `UiToolParts` 组件从 message 的 `contentBlocks` 中取 `type="ui"` 的 blocks 渲染
- 提交后的回执（receipt/choice）由 tool-ui 组件自身渲染（例如 OptionList/QuestionFlow/ApprovalCard 的 receipt 模式）
- 临时状态（editing/submitted 等）在 `interactionStore.uiStateById`（并可从 history hydrate）

提交：

- 交互式 tool-ui 的“提交动作”最终会走 `sendMessage`（`chat.send`），并在本地先写入 canonical user message（乐观）
- 为避免对话重复展示：该 user message（Q/A echo）在 UI 上默认不渲染，但会作为 history 的持久化来源用于 hydrate
