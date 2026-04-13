# Chat module (ui-react)

This document describes how the web Control UI chat works end-to-end: **Gateway WebSocket events → Zustand (`chat.store`) → assistant-ui `ExternalStoreRuntime` → thread components**. It complements [tool-ui.md](./tool-ui.md), which focuses on rich tool surfaces and HITL flows.

## Architecture

```
ChatPage
├── useChatEventBridge()          ← Gateway WS dispatch → Zustand mutations
└── GatewayChatRuntimeProvider      ← Zustand ↔ ExternalStoreRuntime (assistant-ui)
    ├── ChatSidebar                 ← Agents + sessions
    └── ThreadView
        ├── ThreadPrimitive         ← Message list + viewport
        │   ├── UserMessage
        │   └── AssistantMessage
        │       ├── MessagePrimitive.Parts
        │       │   ├── MarkdownText (text parts)
        │       │   ├── ToolCallGroup (consecutive tool-call parts)
        │       │   └── ToolFallback (per-tool card; see tool-ui.md)
        │       └── InteractiveCardArea (HITL: question_flow / option_list)
        └── Composer                ← Input + attachments
```

**Dependency direction**: `gateway.store` registers a single chat dispatch function from `useChatEventBridge`; stores do not import each other in a cycle.

## `chat.store` fields that matter for one turn

| Field | Role |
|--------|------|
| `messages` | Committed `ChatMessage[]` (user + assistant rows). |
| `stream` | Live assistant text buffer for the current generation. |
| `committedBlocks` | Text segments **frozen** before each tool call (`commitCurrentText`). |
| `toolStreamById` / `toolStreamOrder` | In-flight tool entries keyed by id, ordered for display. |
| `sending` | Composer / runtime “running” (enables cancel UX). |
| `runId` | Current run id when provided by gateway (`chat.stream.start`). |
| `pendingGenerationBySession` | Cross-tab/session: generation still running when UI is not on that session. |

Assistant messages use **`contentBlocks`** (ordered `text` + `tool-call`) when present; otherwise a flat `content` + `toolCalls` fallback.

## Sending a message

1. `GatewayChatRuntimeProvider` **`sendMessage`** (from Composer `onNew` or `ChatSendContext` for HITL):
   - `setLastError(null)`, **`resetStream()`** (clears last turn buffers).
   - Optimistic **`user` `ChatMessage`** appended to `messages`.
   - `setSending(true)`, **`markSessionGenerating(sessionKey)`**.
   - **`client.request("chat.send", { message, sessionKey, idempotencyKey, attachments? })`**.

Ending `sending` is **not** done in `sendMessage`; it happens when the gateway signals completion (see below).

## Two streaming conventions (both are handled)

The gateway may emit **either or both** styles. The client must understand both.

### A) `chat` events (`state`: `delta` | `final` | `error` | `aborted`)

- **`delta`**: `extractMessageText` → **`setStream(text)`**. Comment in code: gateway sends **cumulative** assistant text per delta, not incremental chunks.
- **`final`**: See [End of turn](#end-of-turn) below.
- **`error` / `aborted`**: reset stream buffers, clear `sending`, set error banner on `error`.

Session scoping: only events whose **`sessionKey`** matches the active UI session are applied (`isChatEventForActiveSession`).

### B) `chat.stream.*` events

| Event | Effect |
|--------|--------|
| `chat.stream.start` | `resetStream()`, `setRunId`, optional deduped user row from `userMessage`, `setLastError(null)`. |
| `chat.stream.chunk` | **`appendStreamChunk(text)`** — **incremental** append to `stream`. |
| `chat.stream.end` | **`finalizeStream()`**, **`setSending(false)`**. |
| `chat.stream.abort` / `chat.stream.error` | `resetStream()`, `setSending(false)`; error sets `lastError`. |

**Important**: `chat` deltas (**`setStream`**, cumulative) and **`chat.stream.chunk`** (**`appendStreamChunk`**, incremental) update `stream` differently. Do not assume one model when debugging buffer contents.

## Tool calls: `agent` events (`stream: "tool"`)

Tool lifecycle is **not** part of the composer payload; the gateway pushes **`agent`** payloads with `stream === "tool"` and `data.phase`:

| Phase | Store updates |
|--------|----------------|
| **`start`** | **`commitCurrentText()`** — moves current `stream` text into `committedBlocks` so it stays visible above the tool card — then **`upsertToolStream`** with `phase: "start"`, `input` from args. |
| **`result`** | Merge into existing entry: success updates `output` (e.g. `meta`); `isError` maps to error-style entry. |
| **`error`** | Updates `error` on the entry. |

This yields an interleaved model: **text → tool(s) → more text**, matching how the model streams after tools.

## Live placeholder message (`__stream__`)

While **`isRunning`** is true (`sending` **or** non-null `stream` **or** pending generation for the active session, etc.), `GatewayChatRuntimeProvider` appends a synthetic assistant message id **`__stream__`** whose **`contentBlocks`** are built from:

1. `committedBlocks`
2. Tool entries from `toolStreamOrder` / `toolStreamById`
3. Current **`stream`** text (after all tools in that turn so tools are not pushed down by later text)

`convertMessage` maps each `ChatMessage` to `ThreadMessageLike` parts: text parts and **`tool-call`** parts with `toolName`, `args`, `result`, `isError`.

## Rendering

- **`AssistantMessage`** uses `MessagePrimitive.Parts` with `ToolCallGroup` and `ToolFallback` — see [tool-ui.md](./tool-ui.md) for per-tool UI and widgets (e.g. `weather_widget`).
- **`ToolCallGroup`**: wraps consecutive tool parts; **default collapsed**. On transition **running → not running**, it **auto-collapses** unless the user toggled expand/collapse once (`userToggledRef`). There is **no** “auto-expand while streaming” in this component—users expand the header manually if needed.
- **`InteractiveCardArea`**: below parts, for specific HITL tools; uses `ChatSendContext.sendMessage` to continue the thread.

## End of turn

### Path 1: `chat.stream.end`

Always **`finalizeStream()`** (builds one assistant `ChatMessage` with `contentBlocks` from committed text + tools + trailing stream), then **`setSending(false)`**.

### Path 2: `chat` with `state === "final"`

1. If there is **inline message text** from the payload:
   - If there were **tools or committed text**: merge into **`contentBlocks`**, append assistant row, **`resetStream()`**.
   - Else: append a simple assistant row, **`resetStream()`**.
2. If there is **no inline text**:
   - If `stream !== null` **or** `committedBlocks.length > 0`: **`finalizeStream()`**.
   - Else: **`resetStream()`** and **`setPendingHistoryReloadKey(sessionKey)`** so `useSessionManager` reloads history from the gateway.

Then **`setSending(false)`**, **`setRunId(null)`** (in this handler).

So “reload history” is only when **final** arrives with **no** inline text **and** nothing to finalize in local buffers.

## History (`chat.history`)

When the session list loads messages: **`mergeToolResults`**, **`normalizeRole`**, **`extractContentBlocks`**, **`consolidateToolMessages`** (merge consecutive tool-only assistant rows so `ToolCallGroup` works), then **`setMessages`**.

## Cancel

Composer cancel → **`chat.abort`** with `sessionKey` and optional `runId` → local **`resetStream()`**, **`setSending(false)`**, **`clearSessionGenerating`**.

## Related files

| Area | Path |
|------|------|
| Event bridge | `src/hooks/useChatEventBridge.ts` |
| Store | `src/store/chat.store.ts` |
| Runtime adapter | `src/components/chat/GatewayChatRuntimeProvider.tsx` |
| Thread UI | `src/components/chat/ThreadView.tsx`, `AssistantMessage.tsx`, `ToolCallGroup.tsx`, `ToolFallback.tsx` |
| Tool UI detail | [tool-ui.md](./tool-ui.md) |
