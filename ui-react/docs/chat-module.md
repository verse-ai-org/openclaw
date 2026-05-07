# Chat module (ui-react)

This document describes how the web Control UI chat works end-to-end: **Gateway WebSocket events → chat-event bridge → client-only run projection → assistant-ui `ExternalStoreRuntime` → thread components**. It complements [tool-ui.md](./tool-ui.md), which focuses on rich tool surfaces and HITL flows.

## Architecture

```
ChatPage
├── useGatewayEventBridge()           ← creates BridgeRuntimeContext, registers WS dispatch
├── <BridgeChatContext.Provider>      ← passes ctx down the React tree
└── GatewayChatRuntimeProvider        ← Zustand ↔ ExternalStoreRuntime (assistant-ui)
    ├── ChatSidebar                   ← Agents + sessions
    └── ThreadView
        ├── ThreadPrimitive           ← Message list + viewport
        │   ├── UserMessage
        │   └── AssistantMessage
        │       ├── MessagePrimitive.Parts
        │       │   ├── MarkdownText (text parts)
        │       │   ├── ToolCallGroup (consecutive tool-call parts)
        │       │   └── ToolFallback (per-tool card; see tool-ui.md)
        │       └── InteractiveCardArea (HITL: question_flow / option_list)
        └── Composer                  ← Input + attachments
```

**Dependency direction**: `gateway.store` registers a single chat dispatch function from `useGatewayEventBridge`; `chat.store` holds committed history + session metadata; `run-projection` holds live in-turn buffers. `BridgeChatContext` (React Context) replaces the old module singleton to carry the bridge's mutable runtime state down the tree.

## State ownership (one turn)

| Field | Role |
|--------|------|
| `chat.store: messages` | Committed `ChatMessage[]` (user + assistant rows). |
| `chat.store: sending` | Composer / runtime "running" (enables cancel UX). |
| `chat.store: runId` | Current run id provided by the gateway (metadata for the live row). |
| `chat.store: pendingGenerationBySession` | Cross-tab/session: maps session key → `{ runId }` for runs still active when the UI navigates away. |
| `run-projection: liveCumulativeText` | Live assistant plain-text buffer (cumulative from `chat` `delta` events). |
| `run-projection: committedBlocks` | Text segments **frozen** before tool/interactive cards (committed on tool `start`). |
| `run-projection: toolStreamById` / `toolStreamOrder` | In-flight tool entries keyed by id, ordered for display. |
| `run-projection: interactiveStreamById` / `interactiveStreamOrder` | Live HITL cards (question_flow / option_list / approval_card). |

Assistant messages use **`contentBlocks`** (ordered `text` + `tool-call`) when present; otherwise fall back to flat `content`.

## Sending a message

1. `GatewayChatRuntimeProvider.sendMessage` (from Composer `onNew` or `ChatSendContext` for HITL):
   - `setLastError(null)`, **reset run-projection**, clear stale `BridgeRuntimeContext.activeRunBySession` entry for this session.
   - Optimistic **`user` `ChatMessage`** appended to `messages`.
   - `setSending(true)`, **`markSessionGenerating(sessionKey)`**.
   - **`client.request("chat.send", { message, sessionKey, idempotencyKey, attachments? })`**.

Ending `sending` is **not** done in `sendMessage`; it happens when the gateway signals completion (see [End of turn](#end-of-turn)).

## Streaming conventions

### A) `chat` events (`state`: `delta` | `final` | `error` | `aborted`)

- **`delta`**: `extractMessageText` → set `run-projection.liveCumulativeText`. Gateway sends **cumulative** assistant text per delta, not incremental chunks.
- **`final`**: See [End of turn](#end-of-turn) below.
- **`error` / `aborted`**: reset stream buffers, clear `sending`, set error banner on `error`.

Session scoping: only events whose **`sessionKey`** matches the active UI session are applied (`isChatEventForActiveSession`). See [Session key vocabulary](#session-key-vocabulary).

The v1 projection treats **`chat` `state=delta`** as the single source of assistant plain text and ignores any `agent` assistant frames to avoid double-sourcing.

### B) `agent` events (`stream: "tool"`)

Tool lifecycle is separate from chat delta; the gateway pushes **`agent`** payloads with `stream === "tool"` and `data.phase`:

| Phase | Store updates |
|--------|----------------|
| **`start`** | **Commit current text** — moves the current `liveCumulativeText` suffix into `committedBlocks` so it stays visible above the tool card — then **upsert tool stream** with `phase: "start"`. |
| **`result`** | Merge into existing entry: updates `output`; `isError` maps to error-style entry. |
| **`error`** | Updates `error` on the entry. |

This yields an interleaved model: **text → tool(s) → more text**, matching the model's streaming order.

## Live placeholder message (`__stream__`)

While **`isRunning`** is true (`sending` **or** non-null `liveCumulativeText` **or** `pendingForActiveSession != null`), `selectThreadMessages` appends a synthetic assistant message with id **`__stream__`** whose **`contentBlocks`** are built from:

1. `committedBlocks`
2. Interactive entries from `interactiveStreamOrder` / `interactiveStreamById`
3. Tool entries from `toolStreamOrder` / `toolStreamById`
4. Current **`liveCumulativeText` tail** (after all committed blocks + tool/interactive cards)

`convertGatewayChatMessage` maps each `ChatMessage` to `ThreadMessageLike` parts: text parts and **`tool-call`** parts with `toolName`, `args`, `result`, `isError`.

## Refresh / multi-tab hydration

After a page reload with an active run, `chat.history` may already contain a partial assistant message for the ongoing `runId`. `hydrateProjectionFromHistoryRun` detects this, removes the duplicate history row, and seeds the projection maps from that row's `contentBlocks`. A pre-built `runIdIndex: Map<runId, index>` (constructed in `useGatewayThreadRuntime`'s `useMemo`) makes this lookup O(1) per render.

## End of turn

### Path: `chat` with `state === "final"` (or lifecycle fallback)

`finalizeChatRun` in `handlers/shared.ts` captures a **single projection snapshot** (`useRunProjectionStore.getState()`) before any branch executes to avoid double-read races:

1. If there is **inline message text** from the payload:
   - Build final assistant message from projection snapshot + text → `commitStreamAsMessage` → reset projection.
2. If there is **no inline text** and projection has buffered output:
   - `finalizeProjectionToAssistantMessage(projection, runId)` → `commitStreamAsMessage` → reset projection.
3. If there is **no inline text and no buffered output**:
   - Reset projection + `setPendingHistoryReloadKey(sessionKey)` → `useSessionManager` reloads history from the gateway.

Then `setSending(false)`, `setRunId(null)`, `triggerSessionsReload()`.

## Session key vocabulary

Two distinct concepts — keep them separate:

| Concept | Source | Used for |
|---------|--------|----------|
| **Active session key** | `resolveActiveChatSessionKey(chat.sessionKey, settings.sessionKey)` → `"main"` fallback | Which session the UI is displaying |
| **Event session key** | `normalizeSessionKey(payload.sessionKey)` (string trim) | The session a WS event belongs to |

`isChatEventForActiveSession(eventSessionKey)` compares the two. `pendingGenerationBySession` is keyed by event session keys; in normal operation they converge to the same trimmed string.

## History loading (`chat.history`)

When the session list loads messages: **`mergeToolResults`**, **`normalizeRole`**, **`extractContentBlocks`**, then **`setMessages`**.

## Cancel

Composer cancel → **`chat.abort`** with `sessionKey` and optional `runId` → local **reset projection**, **`setSending(false)`**, **`clearSessionGenerating`**.

## Related files

| Area | Path |
|------|------|
| Page entry | `src/pages/ChatPage.tsx` |
| Event bridge | `src/components/chat/gateway/hooks/chat-event-bridge/use-gateway-event-bridge.ts` |
| Bridge context | `src/components/chat/gateway/hooks/chat-event-bridge/bridge-context-react.ts` |
| WS event dispatch | `src/components/chat/gateway/hooks/chat-event-bridge/dispatch-gateway-chat.ts` |
| Event handlers | `src/components/chat/gateway/hooks/chat-event-bridge/handlers/` |
| Run guard | `src/components/chat/gateway/run-guard.ts` |
| Session scoping | `src/components/chat/session/session-scope.ts`, `src/components/chat/session/active-session.ts` |
| Stores | `src/store/chat.store.ts`, `src/run-projection/` |
| Runtime adapter | `src/components/chat/gateway/providers/GatewayChatRuntimeProvider.tsx` |
| Thread messages | `src/components/chat/gateway/providers/use-gateway-thread-runtime.ts` |
| Projection selectors | `src/run-projection/selectors.ts` |
| Hydration | `src/components/chat/utils/hydrate-projection-from-history.ts` |
| Thread UI | `src/components/chat/ThreadView.tsx`, `AssistantMessage.tsx`, `ToolCallGroup.tsx` |
| Tool UI | `src/components/chat/tool/` — see [tool-ui.md](./tool-ui.md) |
| Message convert | `src/components/chat/utils/convert-gateway-chat-message.ts` |
| Message normalize | `src/components/chat/utils/message-normalize.ts` |
| Tool stream format | `src/components/chat/utils/tool-stream-format.ts` |
