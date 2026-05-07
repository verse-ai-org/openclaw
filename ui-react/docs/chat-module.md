# Chat module (ui-react)

This document describes how the web Control UI chat works end-to-end: **Gateway WebSocket events → `gateway-run-adapter` (wire → `RunEvent`) → `run-dispatch` + `run-stream` reducer → assistant-ui `ExternalStoreRuntime` → thread components**. It complements [tool-ui.md](./tool-ui.md), which focuses on rich tool surfaces and HITL flows.

## Architecture

```
ChatPage
├── useGatewayEventBridge()           ← register WS dispatch → gatewayToRunEvents + dispatchRunEvents
└── GatewayChatRuntimeProvider       ← Zustand ↔ ExternalStoreRuntime (assistant-ui)
    ├── ChatSidebar
    └── ThreadView
        ├── ThreadPrimitive
        │   ├── UserMessage
        │   └── AssistantMessage
        │       ├── MarkdownText / tool-call parts
        │       ├── AssistantToolGroup (ToolFallback …)
        │       └── InteractiveParts (question_flow / option_list / approval_card)
        └── Composer
```

**Dependency direction**: `gateway.store` holds a single `registerChatDispatch` callback installed by `useGatewayEventBridge`. `chat.store` holds committed history, session metadata, and **one active `RunState`** (`activeRunState`) while a turn is in flight. Gateway wire shapes never leak past `gateway-run-adapter.ts`.

## Layered pipeline

| Layer | Role |
|-------|------|
| **`gateway-ws-check.ts`** | Narrow unknown WS payloads to typed gateway structs. |
| **`gateway-run-adapter.ts`** | Map `chat` / `agent` payloads → protocol-agnostic **`RunEvent[]`**. Only this file knows Gateway field names (`state`, `stream`, `phase`, …). |
| **`run-stream/run-dispatch.ts`** | Session/run routing, feeds events into reducer, clears `activeRunState` on terminal events, appends **`toFinalMessage`**. |
| **`run-stream/run-state.ts`** | Pure `applyRunEvent` reducer: text, tools, interactive cards, terminal status. |
| **`run-stream/run-message.ts`** | `toLiveMessage` / `toFinalMessage` → `ChatMessage` with ordered `contentBlocks`. |
| **`use-gateway-thread-runtime.ts`** | `mergeAssistantRunSegments(messages)` + optional synthetic row **`__stream__`** = `toLiveMessage(activeRunState)`. |

## State ownership (one turn)

| Field | Role |
|--------|------|
| `chat.store.messages` | Committed `ChatMessage[]` (user rows + finalized assistant rows). |
| `chat.store.sending` | Optimistic “user just hit send”; cleared when events advance the run / on terminal. |
| `chat.store.runId` | Current gateway `runId` (used by cancel, metadata on live/final assistant row). |
| `chat.store.activeRunState` | **Single `RunState`** while generating: live cumulative text, committed text segments, interactive + tool streams, pending out-of-order tool results. |
| `chat.store.pendingGenerationBySession` | Cross-tab/session: `{ runId? }` for runs still active when navigating away. |
| `chat.store.interactiveSummaryById` | Ephemeral Q/A summaries after the user submits an interactive card (`setInteractiveSummary`). |

`RunState` fields (conceptual):

- `liveText` — full cumulative assistant plain text from `chat` deltas (gateway sends snapshots, not per-token diffs).
- `committedBlocks` — `{ type: "text" }[]` frozen **before** each non-interactive tool start or **`interactive.start`** (auto-commit).
- `interactiveById` / `interactiveOrder` — parsed **`InteractiveContentBlock`** from interactive tool **`start.args`** (`question_flow`, `option_list`, `approval_card`).
- `toolById` / `toolOrder` — in-flight non-interactive tools.
- `pendingResults` — buffer `tool.result` / `tool.error` if they arrive before `tool.start`.

Assistant messages use **`contentBlocks`** when present; otherwise flat `content`.

## Sending a message

1. `GatewayChatRuntimeProvider.sendMessage` (Composer `onNew` or `ChatSendContext` for HITL):
   - `setLastError(null)`, `setRunId(null)`.
   - Optimistic **user** `ChatMessage` appended.
   - **`startOptimisticRun(activeSession)`** — creates `activeRunState` if missing so `isRunning` is true before the first WS frame.
   - `setSending(true)`, `markSessionGenerating(sessionKey)`.
   - `client.request("chat.send", { … })`; on response, `setRunId` / `markSessionGenerating(…, runId)` and patch `activeRunState.runId` if known.

Ending `sending` and clearing **`activeRunState`** happen when a **terminal `RunEvent`** is applied (`run.finished` / `run.error` / `run.aborted`) in `dispatchRunEvents` → `_handleTerminal`.

## `RunEvent` types (normalized)

Declared in **`run-stream/run-event.ts`** (summarized):

| Event | Typical source |
|--------|----------------|
| `run.started` | `agent` lifecycle `phase=start` |
| `text.delta` | `chat` `state=delta` (full cumulative text) |
| `tool.start` / `tool.update` / `tool.result` / `tool.error` | `agent` `stream=tool` (**non-interactive** tools) |
| `interactive.start` | `agent` tool `phase=start`, `name` ∈ interactive tools → `createInteractiveBlock({ …, payload: args })` |
| `run.finished` | `chat` `state=final` only (lifecycle `end` is ignored — gateway sends it before `chat` final) |
| `run.error` / `run.aborted` | `chat` / lifecycle |

**Interactive tools** do **not** emit `tool.start`/`result` through the reducer: **`gateway-run-adapter`** maps **`start`** to **`interactive.start`** (parsed block). **`result`**/`update`** frames for interactive names are ignored at the adapter (result is often only an id/meta string).

## Streaming conventions

### A) `chat` events

- **`delta`**: `text.delta` → `liveText = text`. Session filter: **`isChatEventForActiveSession(payload.sessionKey)`** (must match active UI session key).
- **`final`**: `run.finished` with optional extracted message text → terminal handling: **`toFinalMessage`**, append to **`messages`**, clear **`activeRunState`**. **No mandatory history reload** on success; committed row already includes interactive/tool blocks assembled in **`RunState`**.
- **`error` / `aborted`**: terminal; clear run, optional **`lastError`**.

### B) `agent` tool events (non-interactive)

Matches previous behavior: **`tool.start`** auto-commits the live-text tail into **`committedBlocks`**, then inserts/updates **`toolById`**. Out-of-order **`result`**/`error`** can be buffered in **`pendingResults`** until **`start`** arrives.

### C) Interactive tools (`interactive.start`)

On **`phase=start`** with full **`args`** (JSON-safe payload), **`createInteractiveBlock`** runs in the adapter; on success emits **`interactive.start`** with a typed **`InteractiveContentBlock`**. Reducer auto-commits text then appends the block to **`interactiveById`** / **`interactiveOrder`**.

## Live placeholder message (`__stream__`)

While **`activeRunState !== null`**, **`useGatewayThreadRuntime`** appends a synthetic assistant message **`id: "__stream__"`** built by **`toLiveMessage(runState)`**. Its **`contentBlocks`** order:

1. **`committedBlocks`**
2. Interactive blocks in **`interactiveOrder`**
3. Tool-call blocks in **`toolOrder`**
4. Trailing live text (cumulative **`liveText`** minus the prefix already represented by committed text blocks)

**`isRunning`** for the runtime is **`sending || activeRunState !== null`** (no separate merge with `pendingGenerationBySession` in this hook; background session tracking still uses **`pendingGenerationBySession`** elsewhere).

**`convertGatewayChatMessage`** maps each committed/live **`ChatMessage`** to **`ThreadMessageLike`**; interactive blocks are not expanded into tool-call parts—they are consumed by **`InteractiveParts`** alongside assistant-ui parts.

## End of turn (terminal)

`_handleTerminal` in **`run-dispatch.ts`**:

1. Builds **`finalMsg = toFinalMessage(snapshot)`** (or null if truly empty).
2. **`messages: [...messages, finalMsg]`** when non-null.
3. **`activeRunState: null`**, **`sending: false`**, **`runId: null`**, **`lastError`** set on **`run.error`**.
4. **`clearSessionGenerating(sessionKey)`**, **`triggerSessionsReload()`** (session list / titles).
5. **Does not** set **`pendingHistoryReloadKey`** purely because a normal turn finished—history stays consistent from local assembly.

Optional silent reload still exists for other callers via **`chat.store.pendingHistoryReloadKey`** (e.g. session switch, explicit flows).

## Session key vocabulary

| Concept | Source |
|---------|--------|
| **Active session key** | `resolveActiveChatSessionKey(chat.store.sessionKey, settings.sessionKey)` → default **`"main"`**. |
| **Event session key** | Trimmed `payload.sessionKey` on each WS payload; **`dispatchRunEvents`** drops events when it does not match **`getActiveChatSessionKey()`**. |

## History loading (`chat.history`)

**mergeToolResults** → **normalizeRole** → **extractContentBlocks** → **setMessages**. Persisted transcripts should include **`type: "interactive"`** **`contentBlocks`** when the gateway supplies them; **`InteractiveParts`** only reads **`contentBlocks`** (and live **`activeRunState`**) — see **[chat-module-deep-dive.md](./chat-module-deep-dive.md)**.

## Cancel

Composer **`chat.abort`** with **`sessionKey`** + optional **`runId`** → local **`activeRunState: null`**, **`setSending(false)`**, **`clearSessionGenerating`**.

## Related files

| Area | Path |
|------|------|
| Page entry | `src/pages/ChatPage.tsx` |
| WS bridge hook | `src/components/chat/gateway/hooks/use-gateway-event-bridge.ts` |
| Wire checks | `src/components/chat/gateway/gateway-ws-check.ts` |
| Gateway → `RunEvent` | `src/components/chat/gateway/gateway-run-adapter.ts` |
| Dispatch + terminal | `src/run-stream/run-dispatch.ts` |
| Events / reducer / views | `src/run-stream/run-event.ts`, `run-state.ts`, `run-message.ts`, `index.ts` |
| Session scoping | `src/components/chat/session/session-scope.ts`, `active-session.ts` |
| Stores | `src/store/chat.store.ts` |
| Runtime provider | `src/components/chat/gateway/providers/GatewayChatRuntimeProvider.tsx` |
| Thread assembly | `src/components/chat/gateway/providers/use-gateway-thread-runtime.ts` |
| History normalization | `src/components/chat/gateway/gateway-history-normalize.ts`, `gateway-content-blocks.ts` |
| Thread UI | `src/components/chat/ThreadView.tsx`, `AssistantMessage.tsx` |
| HITL | `src/components/chat/interactive/` — see **[interaction-tool-architecture.md](./interaction-tool-architecture.md)** |
| Tool UI | **[tool-ui.md](./tool-ui.md)** |
| Message convert | `src/components/chat/utils/assistant-ui/convert-gateway-chat-message.ts` |
