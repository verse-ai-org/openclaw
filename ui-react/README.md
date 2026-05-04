# OpenClaw Control UI (`ui-react`)

React + assistant-ui shell for the gateway-backed chat experience.

## Run projection

The gateway still emits **two** WebSocket channels (`chat` text deltas/finals and `agent` tool/lifecycle frames). The Control UI does **not** merge those on the server; instead, `ui-react/src/run-projection/` maintains a single client-side projection:

- **Assistant plain text (live):** only from `chat` `state=delta` cumulative `message.text` (same as the event bridge).
- **Tools / interactive / summaries:** from `agent` tool + lifecycle events, dispatched into the same projection reducer.
- **Runtime thread:** `selectThreadMessages` builds the assistant-ui message list (including synthetic `__stream__`) from `useChatStore` history + `useRunProjectionStore` live state.

See `ui-react/src/run-projection/index.ts` for the public entry points.
