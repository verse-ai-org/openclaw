---
name: openclaw-interactions
description: "OpenClaw interactive input protocol (`<ask>` tags). Use when the agent needs a structured reply from the user — multi-step questionnaires, option pickers, confirmations — instead of parsing free-form text. Supersedes the legacy `question_flow`/`option_list` tools."
metadata: { "openclaw": { "emoji": "❓" } }
---

# OpenClaw Interactions (`<ask>` protocol)

OpenClaw provides a **first-class interaction protocol** for cases where the
assistant needs a *structured* reply from the user — selecting from a list,
answering a multi-step form, confirming a destructive action.

Interactions are **not tools**. The assistant emits an `<ask>` tag directly in
its generated text; the runner records an `interaction_request`, suspends,
and the next turn only resumes once the user (UI click, channel callback,
or inbound message) posts back a response through
`chat.interactionRespond`.

Use this skill **instead of**:

- Inventing ad-hoc multiple-choice prompts in free text (fragile, no
  structured answer).
- Calling a tool whose sole purpose is to ask a question (that was the old
  `question_flow` / `option_list` design — removed).

## When to use an interaction

| Case                                               | Use interaction? |
| -------------------------------------------------- | ---------------- |
| Need one choice out of a fixed list                | yes — `option_list` |
| Multi-step preference intake / onboarding form     | yes — `question_flow` |
| Confirming a destructive or expensive action       | yes — `option_list` with `{yes,no}` |
| Asking for free-form text (a description, a name)  | **no** — just ask in prose |
| Reporting / displaying data (no input required)    | **no** — use a Tool UI tool (`stats_display`, `chart`, …) |

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

Response payload (delivered back as an `interaction_response` message):

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

Response payload:

```json
{ "selected": ["xhs"] }
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
- ❌ Treating the response like tool output. The response arrives as an
  `interaction_response` message role — not as a `toolResult`. Downstream
  prompts and custom tool handlers should not expect a toolCallId.
- ❌ Asking for free-form text. Use prose; `<ask>` is for *structured*
  inputs (enums, multi-select, confirmations).

## Cancelling / timing out

- If `cancellable="true"`, the UI shows a dismiss affordance. A cancel
  posts `{status: "cancelled"}` to `chat.interactionRespond`.
- If `timeoutMs="..."` is set, the runtime auto-cancels after that many
  milliseconds with `status: "timed_out"`.
- In both cases the assistant's next turn receives an
  `interaction_response` row with `status` != `"submitted"`. Handle the
  cancellation in your reasoning (e.g. fall back to defaults, or ask a
  simpler prose question).

## References

- Shared schemas / registry: `packages/interactions/src/`
- Streaming parser: `src/agents/interactions/ask-tag-parser.ts`
- Runner suspend table: `src/agents/interactions/runner-suspend.ts`
- Gateway RPC: `src/gateway/server-methods/interactions.ts`
- UI dispatcher: `ui-react/src/components/chat/InteractiveParts.tsx`
- Channel downgrade core: `src/channels/interaction-downgrade.ts`
