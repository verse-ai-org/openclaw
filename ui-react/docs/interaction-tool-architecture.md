# 交互工具（Interaction Tool）架构文档

本文档描述 OpenClaw 中 **交互式询问（ask）** 功能的整体架构和实现方案。该方案将原先基于文本协议的 `<ask>` 机制替换为健壮的工具调用（tool call）方案。

## 背景与动机

旧方案要求 LLM 在自然语言中直接嵌入 `<ask>` XML 标签和 JSON 载荷，由前端解析后渲染。主要问题：

1. **脆弱**：LLM 可能生成格式不正确的 XML/JSON，前端只能静默失败
2. **无纠错**：校验仅在前端，Agent 无法感知自己的输出错误并重新生成
3. **不可持久化**：`<ask>` 标签嵌入在 assistant 文本中，刷新页面后状态恢复困难
4. **与工具体系割裂**：系统已有成熟的 tool call 机制，`<ask>` 却独立于此

## 设计原则

新方案的核心思路：**将交互请求建模为正式的 Agent Tool**，复用 `exec` 审批（approval）的成熟模式。

| 设计决策 | 说明 |
|---------|------|
| **工具即交互** | 每种交互类型（问卷、选项列表、审批卡片）各自是独立的 tool |
| **服务端校验** | tool 的 `execute` 方法用 Zod schema 校验 LLM 参数，失败抛出 `ToolInputError` 触发 Agent 自我纠错 |
| **非阻塞挂起** | tool 立即返回 `interaction-pending` 状态，不阻塞进程 |
| **文本抑制** | 返回 pending 后设置 `deterministicPromptSent` 标记，抑制后续 assistant 文本 |
| **会话持久化** | tool call 和 result 持久化在会话记录中，刷新页面后可从记录恢复交互卡片 |

## 交互工具清单

| 工具名 | 用途 | 源文件 |
|--------|------|--------|
| `question_flow` | 多步骤结构化问卷 | `src/agents/tools/question-flow-tool.ts` |
| `option_list` | 单步选项选择器 | `src/agents/tools/option-list-tool.ts` |
| `approval_card` | 审批/拒绝确认卡片 | `src/agents/tools/approval-card-tool.ts` |

所有交互工具在 `src/agents/openclaw-tools.ts` 的 `createOpenClawTools()` 中注册。

## 端到端流程

```
┌─────────┐     ┌──────────┐     ┌───────────────┐     ┌──────────┐
│  Agent   │────▶│ Tool Exec│────▶│ Subscribe     │────▶│ Frontend │
│  (LLM)  │     │ (Server) │     │ Handler       │     │ (React)  │
└─────────┘     └──────────┘     └───────────────┘     └──────────┘
     │                │                   │                   │
     │  1. tool_call  │                   │                   │
     │  question_flow │                   │                   │
     │  {id, steps}   │                   │                   │
     │───────────────▶│                   │                   │
     │                │ 2. Zod 校验参数    │                   │
     │                │    ✓ 通过         │                   │
     │                │    ✗ 抛ToolInputError                 │
     │                │      → Agent 自纠  │                   │
     │                │                   │                   │
     │                │ 3. 返回结果        │                   │
     │                │ {status:          │                   │
     │                │  "interaction-    │                   │
     │                │   pending",       │                   │
     │                │  component, payload}                  │
     │                │──────────────────▶│                   │
     │                │                   │ 4. 检测 pending   │
     │                │                   │    设置标记        │
     │                │                   │    抑制文本        │
     │                │                   │──────────────────▶│
     │                │                   │                   │ 5. 渲染交互卡片
     │                │                   │                   │    (QuestionFlow/
     │                │                   │                   │     OptionList/
     │                │                   │                   │     ApprovalCard)
     │                │                   │                   │
     │                │                   │       6. 用户提交  │
     │                │                   │◀──────────────────│
     │                │                   │  chat.send({      │
     │                │                   │   text,           │
     │                │                   │   metadata: {     │
     │  7. 新一轮 turn │                   │    interaction    │
     │◀───────────────│───────────────────│   }})             │
     │  系统消息包含   │                   │                   │
     │  用户选择结果   │                   │                   │
```

### 详细步骤说明

#### 1. Agent 发起 tool call

Agent（LLM）根据对话上下文，决定需要向用户收集信息，调用交互工具。例如：

```json
{
  "toolName": "question_flow",
  "args": {
    "id": "travel-preference-intake",
    "steps": [
      {
        "id": "budget",
        "title": "旅行预算范围",
        "options": [
          { "id": "economy", "label": "经济型" },
          { "id": "mid-range", "label": "中等" },
          { "id": "luxury", "label": "豪华" }
        ]
      }
    ]
  }
}
```

工具描述中包含关键提示：`"After calling this tool, STOP and wait for the user's response — do not continue."`，引导 Agent 在调用后停止生成。

#### 2. 服务端 Schema 校验

tool 的 `execute` 方法使用 `@openclaw/interactions` 包中的 canonical schema（Zod）进行校验：

```typescript
const parsed = QUESTION_FLOW_MANIFEST.requestSchema.safeParse(args);
if (!parsed.success) {
  throw new ToolInputError(
    `question_flow schema validation failed: ${parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "$"} ${issue.message}`)
      .join("; ")}`,
  );
}
```

- **校验通过**：继续返回 `interaction-pending` 结果
- **校验失败**：抛出 `ToolInputError`，该错误作为 tool error 返回给 Agent，触发自纠错重试

#### 3. 返回 `interaction-pending` 结果

校验通过后，使用 `interactionPendingResult` 构建标准化结果：

```typescript
return interactionPendingResult("question_flow", parsed.data);
```

产生的结果结构：

```json
{
  "content": [{ "type": "text", "text": "{ ... JSON payload ... }" }],
  "details": {
    "status": "interaction-pending",
    "component": "question_flow",
    "payload": { "id": "travel-preference-intake", "steps": [...] }
  }
}
```

`interactionPendingResult` 定义在 `src/agents/tools/common.ts` 中。

#### 4. Subscribe Handler 检测与抑制

在 `src/agents/pi-embedded-subscribe.handlers.tools.ts` 中，`emitToolResultOutput` 函数处理 tool 结果输出时，按优先级依次检测：

1. `approval-pending`（exec 审批）
2. `approval-unavailable`（exec 审批不可用）
3. **`interaction-pending`（交互工具）** ← 新增

检测逻辑由 `readInteractionPendingDetails()` 完成，它从 tool result 的 `details` 中提取 `status: "interaction-pending"` 的 `component` 和 `payload`。

检测到 `interaction-pending` 后：
- 设置 `ctx.state.deterministicPromptSent = true`
- 立即 `return`，不向下游发送任何文本输出

`deterministicPromptSent` 标记在 message handler 中被检查（`pi-embedded-subscribe.handlers.messages.ts`），一旦为 `true`，所有后续 assistant 文本更新和结束事件都被静默丢弃。

#### 5. 前端渲染交互卡片

前端在 `InteractiveCardArea.tsx` 中：
- 从当前 assistant 消息的 `contentBlocks` 中查找 `question_flow` / `option_list` / `approval_card` 类型、`phase === "result"` 的 tool block
- 解析 payload 后渲染对应的交互组件（`QuestionFlow`、`OptionList`、`ApprovalCard`）
- 如果已存在后续用户消息（即用户已提交），则显示摘要视图（`QASummary`）

#### 6. 用户提交响应

用户完成交互后，前端通过 `chat.send()` 发送新消息：

```typescript
sendMessage(formattedText, {
  metadata: {
    interaction: {
      component: "question_flow",
      id: "travel-preference-intake",
      selections: { budget: "mid-range" },
    },
  },
});
```

- `text`：人类可读的选择摘要（如 `"旅行预算范围：中等"`)
- `metadata.interaction`：结构化数据，供后续 Agent turn 使用

#### 7. Agent 继续处理

用户消息触发新的 Agent turn。Agent 通过系统上下文和 `metadata.interaction` 获知用户的选择，继续后续流程。

## 状态持久化与页面刷新

交互状态天然持久化，无需额外恢复逻辑：

1. **Tool call + result 已持久化**：tool 调用及其 `interaction-pending` 结果保存在会话记录（session transcript）中
2. **前端重建**：页面刷新后，前端从历史消息中重新加载 `contentBlocks`，检测到 `question_flow` / `option_list` / `approval_card` 的 result 块后，重新渲染交互卡片
3. **已提交判断**：如果会话中已存在后续用户消息，前端显示摘要视图而非可编辑表单

## 与 `exec` 审批模式的关系

交互工具复用了 `exec` 审批的**模式**（pattern），但不共享实现：

| 维度 | exec 审批 | 交互工具 |
|------|----------|---------|
| 状态码 | `approval-pending` | `interaction-pending` |
| 检测函数 | `readExecApprovalPendingDetails()` | `readInteractionPendingDetails()` |
| 额外处理 | 发送审批 UI payload（`onToolResult`） | 仅设置抑制标记 |
| 抑制标记 | `deterministicPromptSent` | `deterministicPromptSent`（共享） |
| 用户响应 | `/approve` 命令 | `chat.send` + `metadata.interaction` |

`deterministicPromptSent` 是从旧名 `deterministicApprovalPromptSent` 泛化而来，现在同时服务于 exec 审批和交互工具。

## Agent 自纠错机制

当 LLM 生成了不符合 schema 的参数时：

1. `execute` 中 `safeParse` 失败
2. 抛出 `ToolInputError`，附带具体的校验错误信息
3. 错误作为 tool error 返回给 Agent
4. Agent 看到错误描述后，修正参数并重新调用工具

这是旧 `<ask>` 方案无法实现的关键改进。

## 测试覆盖

`src/agents/pi-embedded-subscribe.handlers.tools.test.ts` 中包含 `interaction-pending detection` 测试组：

| 测试用例 | 验证内容 |
|---------|---------|
| `sets deterministicPromptSent when a tool returns interaction-pending` | `question_flow` 返回 pending 后标记被设置 |
| `does not set the flag when tool result is an error` | tool error 时不设置标记 |
| `works for option_list` | `option_list` 同样触发标记 |
| `works for approval_card` | `approval_card` 同样触发标记 |
| `does not set the flag for non-interaction tool results` | 普通工具不触发标记 |

## 相关文件索引

| 类别 | 文件路径 |
|------|---------|
| **交互工具定义** | `src/agents/tools/question-flow-tool.ts` |
| | `src/agents/tools/option-list-tool.ts` |
| | `src/agents/tools/approval-card-tool.ts` |
| **通用工具辅助** | `src/agents/tools/common.ts`（`interactionPendingResult`、`ToolInputError`） |
| **工具注册** | `src/agents/openclaw-tools.ts` |
| **Subscribe 处理** | `src/agents/pi-embedded-subscribe.handlers.tools.ts` |
| **状态类型** | `src/agents/pi-embedded-subscribe.handlers.types.ts` |
| **消息抑制** | `src/agents/pi-embedded-subscribe.handlers.messages.ts` |
| **测试** | `src/agents/pi-embedded-subscribe.handlers.tools.test.ts` |
| **前端交互渲染** | `ui-react/src/components/chat/InteractiveCardArea.tsx` |
| **前端发送上下文** | `ui-react/src/components/chat/ChatSendContext.tsx` |
| **交互 Schema 包** | `@openclaw/interactions`（canonical Zod schemas） |
| **Tool UI 总览文档** | `ui-react/docs/tool-ui.md` |

## 已删除的旧文件

以下文件属于旧 `<ask>` 文本协议，已在本次重构中移除：

- `src/auto-reply/reply/interaction-ask-system-prompt.ts`
- `src/gateway/interaction-ask-orchestrator.ts`
- `src/gateway/interaction-ask-validation.ts`
- `src/gateway/interaction-validation.ts`
