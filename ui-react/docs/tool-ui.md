# Tool UI in the Control UI (ui-react)

This document explains how **Tool UI** works in the OpenClaw web chat: how tool calls become React components, and how to add a new tool-backed surface.

## What “Tool UI” means here

- **Backend**: The agent invokes a **named tool** (e.g. `weather_widget`, `code_block`). The tool returns **structured data** (usually JSON), often as text in the tool result.
- **Frontend**: The chat maps **`toolName` + result payload** to a **React component** under `src/components/tool-ui/`, or to a dedicated **interactive** flow (human-in-the-loop).

So “Tool UI” is not a separate package runtime—it is **convention + wiring**: Zustand holds messages with `contentBlocks`; `assistant-ui` renders each tool part; our code branches on `toolName` and validates JSON with Zod before rendering.

## End-to-end data flow

1. **Gateway** streams or loads assistant turns that include tool calls and tool results.
2. **`useChatEventBridge`** normalizes events into **`ChatMessage`** rows with **`contentBlocks`** (ordered text + `tool-call` blocks). Each tool block has `toolName`, `argsText`, `result`, `phase`.
3. **`GatewayChatRuntimeProvider`** builds **`ExternalStoreRuntime`** messages via `convertMessage()`: each `contentBlocks` entry becomes a `tool-call` part with `toolName`, `args`, `result` string.
4. **`AssistantMessage`** renders:
   - **`MessagePrimitive.Parts`** with `tools.Fallback: ToolFallback` and **`ToolCallGroup`** for grouped tool UI.
   - **`InteractiveCardArea`** *after* the parts (only for specific HITL tools—see below).

So the **single source of truth** for what appears in the thread is the **Zustand `messages` array** (plus streaming overlays inside the provider).

## Tool UI component layout (`src/components/tool-ui/`)

Each feature folder typically has:

| Piece | Role |
|--------|------|
| **`schema.ts`** | Zod **`Serializable…Schema`** (JSON-safe props). Exports **`safeParseSerializable…`** via `defineToolUiContract` in `shared/contract.ts`. |
| **Main component** (e.g. `chart.tsx`) | Renders the UI; props align with the serializable schema (+ optional client-only props like `className`). |
| **`_adapter.tsx`** | Thin re-exports of shadcn/ui primitives (keeps the main file focused). |

**Contract helper** (`shared/contract.ts`): wraps a Zod schema with `parse` / `safeParse` and a stable component name for errors.

## Two ways tools appear in the chat

### A) Inline rich cards — `ToolFallback.tsx`

**When to use**: The tool **only displays** something (weather, chart, code block, link preview, etc.). No extra chat round-trip beyond the normal tool result.

**Mechanism**:

- `assistant-ui` calls **`ToolFallback`** for each finished tool part with `toolName`, `argsText`, `result`, `status`.
- For supported names, we:
  1. Normalize the payload with **`parseToolUiPayload`** (`parse-tool-ui-payload.ts`) so both string JSON and object results work.
  2. **`safeParseSerializable…(payload)`** from the tool-ui `schema.ts`.
  3. Render the matching component inside a bordered card.

**Examples** (non-exhaustive): `weather_widget`, `code_block`, `chart`, `link_preview`, `stats_display`, `terminal_output`.

**Important**: Tools that should **not** show the default collapsible tool row should return **`null`** early in `ToolFallback` (e.g. `question_flow` / `option_list` are handled elsewhere).

### B) Interactive HITL — `InteractiveCardArea.tsx`

**When to use**: The user must **fill a form or pick options**; their answer must be sent back as a **new user message** so the agent continues.

**Split assistant rows**: Some providers emit **tool calls in one assistant message** and **follow-up prose in a second** assistant message (e.g. `<final>` text). The UI **resolves** `question_flow` / `option_list` blocks from the **first** assistant row in a contiguous assistant run, but **renders** the interactive card only on the **last** assistant row in that run so the form appears under the bottom bubble. Skills should still **discourage** split turns when possible.

**Mechanism**:

- **`ChatSendContext`** (provided by `GatewayChatRuntimeProvider`) exposes **`sendMessage(text)`**.
- **`InteractiveCardArea`** uses **`useMessage()`** to scope to the current assistant message, reads **`useChatStore().messages`**, finds **`question_flow` / `option_list`** blocks with **`phase === "result"`**, and:
  - Renders **`QuestionFlow`** / **`OptionList`** when there is no follow-up user message yet.
  - On submit, calls **`sendMessage`** with the agreed text format, and shows **`QASummary`** for immediate feedback or after history reload.

**Why not only `ToolFallback`?** Those UIs need submit handlers and thread context; mounting them only inside the generic tool part renderer is awkward. Placing them under `AssistantMessage` keeps one place for “below the message parts” interactive chrome.

## Backend: registering a tool the model can call

Tool UI is useless if the model cannot invoke the tool.

1. **Implement** a tool in `src/agents/tools/<name>-tool.ts`:
   - **Passthrough** (config echoed as JSON result): `execute: async (_id, args) => jsonResult(args)` — same pattern as `question_flow` / `option_list` / `code_block`.
   - **Real work** (e.g. `weather_widget`): `execute` fetches or computes data, then `jsonResult(payload)` matching the widget schema.
2. **Register** the tool in **`src/agents/openclaw-tools.ts`** inside `createOpenClawTools()`.
3. **Agent docs**: Update **`skills/openclaw-tool-ui/SKILL.md`** so agents know the tool name, required fields, and that Control UI renders rich cards.

Use **TypeBox** `parameters` on the server; avoid `anyOf`/`oneOf` in ways that break providers (see existing tools and comments in `browser-tool.schema.ts`).

## How to add a new Tool UI (checklist)

### 1. Frontend component + Zod schema

- Add `src/components/tool-ui/<your-feature>/schema.ts` with a **`Serializable…`** object (JSON-safe fields only).
- Export **`safeParseSerializable…`** via **`defineToolUiContract`**.
- Implement the React component; accept serializable props (+ optional `className`).

### 2. Choose integration mode

| Goal | Do this |
|------|---------|
| **Display-only** card when the tool completes | Branch in **`ToolFallback.tsx`**: `parseToolUiPayload` → `safeParseSerializable…` → render `<YourComponent />`. Optionally hide the default row if the parse always succeeds. |
| **User must reply** (form, multi-step) | Add logic to **`InteractiveCardArea.tsx`** (or a sibling scoped to `useMessage`), wire **`useChatSend`**, and **`return null`** for that `toolName` in **`ToolFallback`** so you do not duplicate UI. |

### 3. Backend tool + registration

- Add **`createYourTool()`** in `src/agents/tools/`.
- Register it in **`openclaw-tools.ts`**.
- Document in **`skills/openclaw-tool-ui/SKILL.md`**.

### 4. Manual verification

- Trigger a real tool call from the agent; confirm `contentBlocks` contain your `toolName` and `result` JSON.
- Reload history and confirm parsing still works (strings vs objects).

## Related files (quick reference)

| Area | Path |
|------|------|
| Tool part renderer | `src/components/chat/ToolFallback.tsx` |
| HITL area | `src/components/chat/InteractiveCardArea.tsx` |
| Send from nested UI | `src/components/chat/ChatSendContext.tsx` |
| Runtime bridge | `src/components/chat/GatewayChatRuntimeProvider.tsx` (`convertMessage`) |
| Payload helper | `src/components/chat/parse-tool-ui-payload.ts` |
| Message state | `src/store/chat.store.ts` (`ContentBlock`, `ChatMessage`) |
| Tool registration | `src/agents/openclaw-tools.ts` |
| Agent-facing skill | `skills/openclaw-tool-ui/SKILL.md` |

## References

- Assistant UI tools guide: [https://www.assistant-ui.com/docs/guides/tools](https://www.assistant-ui.com/docs/guides/tools)
- Tool UI (external): [https://www.tool-ui.com/docs/overview](https://www.tool-ui.com/docs/overview)
