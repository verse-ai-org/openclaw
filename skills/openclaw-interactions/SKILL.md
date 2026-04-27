---
name: openclaw-interactions
description: "OpenClaw interactive input (tool-based). Use when the agent needs a structured reply from the user — multi-step questionnaires, option pickers, confirmations — instead of parsing free-form text."
metadata: { "openclaw": { "emoji": "❓" } }
---

# OpenClaw Interactions（工具化交互）

OpenClaw provides a **first-class interaction protocol** for cases where the
assistant needs a *structured* reply from the user — selecting from a list,
answering a multi-step form, confirming a destructive action.

Interactions are emitted via **tool calls**.
In the current Control UI implementation, the UI renders the interaction card
and user submission returns through normal `chat.send` as:

- user-visible Q/A text in the message body
- structured payload in `metadata.interaction`

Use this skill **instead of**:

- Inventing ad-hoc multiple-choice prompts in free text (fragile, no
  structured answer).
- Asking the user to reply “1/2/3” in plain text when a structured picker/form is available.

This skill focuses on **interactive input collection** only.

## When to use an interaction

| Case                                               | Use interaction? |
| -------------------------------------------------- | ---------------- |
| Need one choice out of a fixed list                | yes — `option_list` |
| Multi-step preference intake / onboarding form     | yes — `question_flow` |
| Confirming a destructive or expensive action       | yes — `approval_card` |
| Asking for free-form text (a description, a name)  | **no** — just ask in prose |
| Reporting / displaying data (no input required)    | **no** — answer normally without an interaction |

## Tool call 语义（核心约束）

当你需要交互式输入时，直接调用对应工具：`question_flow` / `option_list` / `approval_card`。

Rules:

- `id` 必须是稳定且唯一的交互实例 id（建议 kebab-case），用于跨重渲染/刷新识别该卡片。
- 工具参数必须是 **合法 JSON 且满足 canonical Zod schema**（由服务端在 tool `execute` 中校验）。不符合会触发 `ToolInputError`，模型应当自我纠错后重试。
- **调用交互工具后必须 STOP**：不要继续输出后续步骤/结论，等待用户提交后，在下一轮 turn 中继续。
- 用户提交后会产生一条新的用户消息；结构化结果在 `metadata.interaction`（同时也会有一段可读的摘要 text）。

## Registered components

| component        | Purpose                                 | request schema file |
| ---------------- | --------------------------------------- | ------------------- |
| `question_flow`  | Multi-step questionnaire (upfront form) | `packages/interactions/src/components/question-flow/schema.ts` |
| `option_list`    | Single-step picker (single or multi)    | `packages/interactions/src/components/option-list/schema.ts` |
| `approval_card`  | Explicit approve/deny confirmation      | `packages/interactions/src/components/approval-card/schema.ts` |

### `question_flow`

Call tool `question_flow` with:

```json
{
  "id": "travel-intake",
  "steps": [
    {
      "id": "budget",
      "title": "预算档位",
      "options": [
        { "id": "economy", "label": "经济型" },
        { "id": "mid-range", "label": "中档" },
        { "id": "high-end", "label": "高端" }
      ],
      "selectionMode": "single"
    },
    {
      "id": "pace",
      "title": "出行节奏",
      "options": [
        { "id": "relaxed", "label": "轻松" },
        { "id": "intensive", "label": "紧凑" }
      ]
    }
  ]
}
```

Response payload（示例形态，具体字段以 schema 为准；通常出现在 `metadata.interaction` 中）：

```json
{ "answers": { "budget": ["mid-range"], "pace": ["relaxed"] } }
```

### `option_list`

Call tool `option_list` with:

```json
{
  "id": "platform-choice",
  "options": [
    { "id": "search", "label": "搜索（Brave）" },
    { "id": "xhs", "label": "小红书" }
  ],
  "selectionMode": "single"
}
```

Response payload（示例形态）：

```json
{ "selected": ["xhs"] }
```

### `approval_card`

Call tool `approval_card` with:

```json
{
  "id": "approve-delete",
  "title": "Delete this workflow?",
  "description": "This action cannot be undone.",
  "variant": "destructive",
  "confirmLabel": "Delete",
  "cancelLabel": "Keep"
}
```

Request fields:

- `id` (required): stable interaction id.
- `title` (required): confirmation question.
- `description` (optional): extra context.
- `icon` (optional): icon hint string.
- `metadata` (optional): key-value list to summarize what will be changed.
- `variant` (optional): `"default"` or `"destructive"`.
- `confirmLabel` (optional): confirm button text.
- `cancelLabel` (optional): deny button text.

Response payload（示例形态）：

```json
{ "decision": "approved" }
```

Possible response payloads:

```json
{ "decision": "approved" }
```

```json
{ "decision": "denied" }
```

## Channel behavior（当前保证）

本 skill 描述的是 **Control UI（web）** 的交互能力：渲染交互卡片，并在用户提交后通过 `metadata.interaction` 回传结构化结果。
其他消息渠道的降级策略如需支持，应以各渠道的真实能力与实现为准（不要在这里做未验证承诺）。

## Anti-patterns

- ❌ 调用交互工具后继续输出后续步骤/结论。交互工具调用后必须 STOP，否则会造成“一边问一边继续做”的错误行为（且后续文本可能被抑制丢弃）。
- ❌ 使用不稳定或复用的 `id`。`id` 应稳定且唯一，避免多个交互混淆。
- ❌ 依赖前端校验。应当让服务端 schema 校验兜底；当 tool 返回 `ToolInputError` 时，必须修正参数重试。
- ❌ 把用户提交当作 tool output。用户提交是一个新的用户消息，结构化数据在 `metadata.interaction`，不是 `toolCallId` 对应的结果。

## References

- Shared schemas / registry: `packages/interactions/src/`
- Control UI documentation: `ui-react/docs/interaction-tool-architecture.md`
