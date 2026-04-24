---
name: openclaw-interactions
description: "OpenClaw interactive input protocol (`<ask>` tags). Use when the agent needs a structured reply from the user — multi-step questionnaires, option pickers, confirmations — instead of parsing free-form text. Prefer `<ask>`"
metadata: { "openclaw": { "emoji": "❓" } }
---

# OpenClaw Interactions (`<ask>` protocol)

OpenClaw provides a **first-class interaction protocol** for cases where the
assistant needs a *structured* reply from the user — selecting from a list,
answering a multi-step form, confirming a destructive action.

Interactions are emitted via `<ask>` tags directly in assistant text.
In the current chat-native implementation, the UI renders the interaction
and user submission returns through normal `chat.send` as:

- user-visible Q/A text in the message body
- structured payload in `metadata.interaction`

Use this skill **instead of**:

- Inventing ad-hoc multiple-choice prompts in free text (fragile, no
  structured answer).
- Calling a tool solely to ask a question (legacy fallback only; `<ask>` first).

This skill focuses on **interactive input collection** only.

## When to use an interaction

| Case                                               | Use interaction? |
| -------------------------------------------------- | ---------------- |
| Need one choice out of a fixed list                | yes — `option_list` |
| Multi-step preference intake / onboarding form     | yes — `question_flow` |
| Confirming a destructive or expensive action       | yes — `approval_card` |
| Asking for free-form text (a description, a name)  | **no** — just ask in prose |
| Reporting / displaying data (no input required)    | **no** — answer normally without `<ask>` |

## Tag syntax

```
<ask component="<name>" id="<stable-id>" [cancellable="true"] [timeoutMs="60000"]>
{JSON payload matching the component's request schema}
</ask>
```

Rules:

- `component` must be one of the registered component ids below.
- `id` must be unique per **turn** (kebab-case recommended; becomes
  `interactionId` in the protocol).
- Body must be **valid JSON** that passes the component's Zod schema
  (`requestSchema`). The stream parser drops malformed payloads and emits an
  error event — the user sees nothing, so prefer small well-tested shapes.
- Only one `<ask>` per assistant turn is the common case; multiple are
  allowed but render sequentially.
- `<ask>` tags inside fenced code blocks (` ``` `) are **ignored** by the
  parser — safe to quote examples.
- End the assistant turn immediately after the `</ask>`; the runner will
  automatically suspend until a response arrives.

## Registered components

| component        | Purpose                                 | request schema file |
| ---------------- | --------------------------------------- | ------------------- |
| `question_flow`  | Multi-step questionnaire (upfront form) | `packages/interactions/src/components/question-flow/schema.ts` |
| `option_list`    | Single-step picker (single or multi)    | `packages/interactions/src/components/option-list/schema.ts` |
| `approval_card`  | Explicit approve/deny confirmation      | `packages/interactions/src/components/approval-card/schema.ts` |

### `question_flow`

```xml
<ask component="question_flow" id="travel-intake">
{
  "id": "travel-intake",
  "steps": [
    {
      "id": "budget",
      "title": "预算档位",
      "options": [
        { "id": "economy",   "label": "经济型" },
        { "id": "mid-range", "label": "中档" },
        { "id": "high-end",  "label": "高端" }
      ],
      "selectionMode": "single"
    },
    {
      "id": "pace",
      "title": "出行节奏",
      "options": [
        { "id": "relaxed",   "label": "轻松" },
        { "id": "intensive", "label": "紧凑" }
      ]
    }
  ]
}
</ask>
```

Response payload (current implementation stores it in `metadata.interaction.payload`):

```json
{ "answers": { "budget": ["mid-range"], "pace": ["relaxed"] } }
```

### `option_list`

```xml
<ask component="option_list" id="platform-choice">
{
  "id": "platform-choice",
  "title": "选择平台",
  "options": [
    { "id": "search", "label": "搜索（Brave）" },
    { "id": "xhs",    "label": "小红书" }
  ],
  "selectionMode": "single"
}
</ask>
```

Response payload (in `metadata.interaction.payload`):

```json
{ "selected": ["xhs"] }
```

### `approval_card`

```xml
<ask component="approval_card" id="approve-delete">
{
  "id": "approve-delete",
  "title": "Delete this workflow?",
  "description": "This action cannot be undone.",
  "variant": "destructive",
  "confirmLabel": "Delete",
  "cancelLabel": "Keep"
}
</ask>
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

Response payload (in `metadata.interaction.payload`):

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

## Channel behaviour

Interactions degrade per-channel. The runtime picks a mode based on the
channel's advertised capabilities (`InteractionChannelCapabilities`):

| Channel               | Rendering mode       |
| --------------------- | -------------------- |
| Control UI (web)      | full interactive widget |
| Telegram              | inline-keyboard buttons where supported; otherwise numbered text |
| Discord / Slack       | button rows or numbered text |
| iMessage / WhatsApp / Signal (plain) | numbered text ("1) Option A — reply with the number") |
| Channels that refuse input | the runner auto-cancels the interaction with `status: "cancelled"` |

Agents should **not** tailor the `<ask>` payload per channel — emit the
richest correct form; the dispatcher downgrades as needed.

## Anti-patterns

- ❌ Emitting `<ask>` inside a `<final>...</final>` block — the parser ignores
  tags inside fenced/quoted regions, but more importantly: `<final>` is for
  terminal output. Put the `<ask>` **before** `<final>` or skip `<final>`
  for interaction turns.
- ❌ Re-using the same `id` across turns. The runner keys the pending table
  on `interactionId`; a duplicate id collides with a still-resolving
  interaction and the second one never suspends correctly.
- ❌ Treating the response like tool output. It arrives as a normal user
  message (`chat.send`) with structured payload in `metadata.interaction`.
  Downstream prompts and handlers should not expect a `toolCallId`.
- ❌ Asking for free-form text. Use prose; `<ask>` is for *structured*
  inputs (enums, multi-select, confirmations).

## Cancelling / timing out

- If `cancellable="true"`, the UI shows a dismiss affordance. A cancel
  should be treated as a normal user response with
  `metadata.interaction.status = "cancelled"`.
- If `timeoutMs="..."` is set, the runtime auto-cancels after that many
  milliseconds with `metadata.interaction.status = "timed_out"`.
- In both cases the assistant's next turn sees a normal user message where
  `metadata.interaction.status != "submitted"`. Handle cancellation in your
  reasoning (e.g. fall back to defaults, or ask a simpler prose question).

## References

- Shared schemas / registry: `packages/interactions/src/`
- Ask system prompt injection: `src/auto-reply/reply/interaction-ask-system-prompt.ts`
- Ask tag parsing and rendering: `ui-react/src/components/chat/interactive/ask-tag.ts`
- Chat metadata transport: `src/gateway/protocol/schema/logs-chat.ts`
- UI dispatcher: `ui-react/src/components/chat/interactive/InteractiveParts.tsx`
