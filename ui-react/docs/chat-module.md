# Chat module (ui-react)

This document describes how the web Control UI chat works end-to-end: **Gateway WebSocket events → chat-event bridge → client-only run projection → assistant-ui `ExternalStoreRuntime` → thread components**. It complements [tool-ui.md](./tool-ui.md), which focuses on rich tool surfaces and HITL flows.

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

**Dependency direction**: `gateway.store` registers a single chat dispatch function from `useChatEventBridge`; `chat.store` holds committed history + session metadata; `run-projection` holds live in-turn buffers.

## State ownership (one turn)

| Field | Role |
|--------|------|
| `chat.store: messages` | Committed `ChatMessage[]` (user + assistant rows). |
| `chat.store: sending` | Composer / runtime “running” (enables cancel UX). |
| `chat.store: runId` | Current run id when provided by gateway (metadata for live row). |
| `run-status: activeRunsBySession` | Cross-tab/session: sessions with an in-flight generation (for running badges, restoring status). |
| `run-projection: liveCumulativeText` | Live assistant plain text buffer (from `chat` state=`delta`, cumulative). |
| `run-projection: committedBlocks` | Text segments **frozen** before tool/interactive cards (commit current text). |
| `run-projection: toolStreamById` / `toolStreamOrder` | In-flight tool entries keyed by id, ordered for display. |
| `run-projection: interactiveStreamById` / `interactiveStreamOrder` | Live HITL cards (question_flow / option_list / approval_card). |

Assistant messages use **`contentBlocks`** (ordered `text` + `tool-call`) when present; otherwise a flat `content` + `toolCalls` fallback.

## Sending a message

1. `GatewayChatRuntimeProvider` **`sendMessage`** (from Composer `onNew` or `ChatSendContext` for HITL):
   - `setLastError(null)`, **reset run-projection** (clears last turn buffers).
   - Optimistic **`user` `ChatMessage`** appended to `messages`.
   - `setSending(true)`, and mark the session as in-flight in `run-status` (optimistic).
   - **`client.request("chat.send", { message, sessionKey, idempotencyKey, attachments? })`**.

Ending `sending` is **not** done in `sendMessage`; it happens when the gateway signals completion (see below).

## Streaming conventions

### A) `chat` events (`state`: `delta` | `final` | `error` | `aborted`)

- **`delta`**: `extractMessageText` → set `run-projection.liveCumulativeText`. Gateway sends **cumulative** assistant text per delta, not incremental chunks.
- **`final`**: See [End of turn](#end-of-turn) below.
- **`error` / `aborted`**: reset stream buffers, clear `sending`, set error banner on `error`.

Session scoping: only events whose **`sessionKey`** matches the active UI session are applied (`isChatEventForActiveSession`).

The Control UI’s v1 projection intentionally treats **`chat` `state=delta`** as the single source of assistant plain text and ignores any `agent` assistant frames to avoid double-sourcing.

## Tool calls: `agent` events (`stream: "tool"`)

Tool lifecycle is **not** part of the composer payload; the gateway pushes **`agent`** payloads with `stream === "tool"` and `data.phase`:

| Phase | Store updates |
|--------|----------------|
| **`start`** | **Commit current text** — moves current `liveCumulativeText` suffix into `committedBlocks` so it stays visible above the tool card — then **upsert tool stream** with `phase: "start"`, `input` from args. |
| **`result`** | Merge into existing entry: success updates `output` (e.g. `meta`); `isError` maps to error-style entry. |
| **`error`** | Updates `error` on the entry. |

This yields an interleaved model: **text → tool(s) → more text**, matching how the model streams after tools.

## Live placeholder message (`__stream__`)

While **`isRunning`** is true (`sending` **or** non-null `run-projection.liveCumulativeText` **or** pending generation for the active session), `GatewayChatRuntimeProvider` appends a synthetic assistant message id **`__stream__`** whose **`contentBlocks`** are built from:

1. `committedBlocks`
2. Tool entries from `toolStreamOrder` / `toolStreamById`
3. Current **`liveCumulativeText` tail** (after all tools in that turn so tools are not pushed down by later text)

`convertMessage` maps each `ChatMessage` to `ThreadMessageLike` parts: text parts and **`tool-call`** parts with `toolName`, `args`, `result`, `isError`.

## Rendering

- **`AssistantMessage`** uses `MessagePrimitive.Parts` with `ToolCallGroup` and `ToolFallback` — see [tool-ui.md](./tool-ui.md) for per-tool UI and widgets (e.g. `weather_widget`).
- **`ToolCallGroup`**: wraps consecutive tool parts; **default collapsed**. On transition **running → not running**, it **auto-collapses** unless the user toggled expand/collapse once (`userToggledRef`). There is **no** “auto-expand while streaming” in this component—users expand the header manually if needed.
- **`InteractiveCardArea`**: below parts, for specific HITL tools; uses `ChatSendContext.sendMessage` to continue the thread.

## End of turn

### Path: `chat` with `state === "final"` (or lifecycle fallback)

1. If there is **inline message text** from the payload:
   - If there were **tools/interactive/committed text** in the projection: merge into **`contentBlocks`**, append assistant row, **reset projection**.
   - Else: append a simple assistant row, **reset projection**.
2. If there is **no inline text**:
   - If projection has buffered output: finalize projection into one assistant message and append it.
   - Else: reset projection and **`setPendingHistoryReloadKey(sessionKey)`** so `useSessionManager` reloads history from the gateway.

Then **`setSending(false)`**, **`setRunId(null)`** (in this handler).

So “reload history” is only when **final** arrives with **no** inline text **and** nothing to finalize in local buffers.

## History (`chat.history`)

When the session list loads messages: **`mergeToolResults`**, **`normalizeRole`**, **`extractContentBlocks`**, **`consolidateToolMessages`** (merge consecutive tool-only assistant rows so `ToolCallGroup` works), then **`setMessages`**.

## Cancel

Composer cancel → **`chat.abort`** with `sessionKey` and optional `runId` → local **reset projection**, **`setSending(false)`**, **`clearSessionGenerating`**.

## Related files

| Area | Path |
|------|------|
| Event bridge | `src/hooks/chat-event-bridge/useChatEventBridge.ts`, `src/hooks/chat-event-bridge/dispatch-gateway-chat.ts` |
| Stores | `src/store/chat.store.ts`, `src/run-projection/store.ts` |
| Runtime adapter | `src/providers/chat/GatewayChatRuntimeProvider.tsx`, `src/providers/chat/use-gateway-thread-runtime.ts` |
| Thread UI | `src/components/chat/ThreadView.tsx`, `AssistantMessage.tsx`, `ToolCallGroup.tsx`, `ToolFallback.tsx` |
| Tool UI detail | [tool-ui.md](./tool-ui.md) |
