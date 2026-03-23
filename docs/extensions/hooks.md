---
title: "Extension Lifecycle Hooks"
summary: "All 26 lifecycle hook events available to extensions via api.on()"
read_when:
  - You want to intercept or observe gateway/agent events from an extension
  - You need to modify model selection, prompts, or tool parameters at runtime
---

# Extension lifecycle hooks

Extensions register typed lifecycle hooks with `api.on(hookName, handler)`. Hooks fire at defined points in the agent, message, tool, session, subagent, and gateway lifecycles.

## Registering a hook

```ts
api.on("before_model_resolve", (event, ctx) => {
  if (ctx.channelId === "telegram") {
    return { modelOverride: "claude-haiku-3-5" };
  }
});

// Optional priority (lower number = runs first)
api.on("before_tool_call", handler, { priority: 10 });
```

Handlers may be `async`. Return `void` or the result type listed below; returning `undefined` is always valid.

## Security policy

Two hooks can inject content into the system prompt and are controlled by `plugins.entries.<id>.hooks.allowPromptInjection`:

- `before_prompt_build` — blocked entirely when `allowPromptInjection: false`.
- `before_agent_start` — prompt mutation fields (`systemPrompt`, `prependContext`, etc.) are stripped; model-override fields are preserved.

All other hooks are unaffected by this policy.

## Agent lifecycle hooks

### `before_model_resolve`

Fires before model selection. Use to override the model or provider for a specific run.

```ts
api.on("before_model_resolve",
  (event: { prompt: string }, ctx: PluginHookAgentContext) => {
    return {
      modelOverride?: string,    // e.g. "claude-opus-4-5"
      providerOverride?: string, // e.g. "anthropic"
    };
  }
);
```

### `before_prompt_build`

Fires after model selection, before the system prompt is assembled. Use to inject static or dynamic context.

```ts
api.on("before_prompt_build",
  (event: { prompt: string, messages: unknown[] }, ctx) => {
    return {
      systemPrompt?: string,          // replaces entire system prompt
      prependContext?: string,         // prepended to user-facing context
      prependSystemContext?: string,   // prepended to system prompt (cacheable)
      appendSystemContext?: string,    // appended to system prompt (cacheable)
    };
  }
);
```

### `before_agent_start`

Legacy hook combining `before_model_resolve` and `before_prompt_build`. Prefer the two separate hooks for new code.

### `llm_input`

Fires just before the LLM request is sent. Observation only — return value is ignored.

```ts
api.on("llm_input", (event: {
  runId: string, sessionId: string,
  provider: string, model: string,
  systemPrompt?: string, prompt: string,
  historyMessages: unknown[], imagesCount: number,
}, ctx) => void);
```

### `llm_output`

Fires after the LLM response is received. Observation only.

```ts
api.on("llm_output", (event: {
  runId: string, sessionId: string,
  provider: string, model: string,
  assistantTexts: string[], lastAssistant?: unknown,
  usage?: { input?, output?, cacheRead?, cacheWrite?, total? },
}, ctx) => void);
```

### `agent_end`

Fires when the agent run completes (success or failure).

```ts
api.on("agent_end", (event: {
  messages: unknown[], success: boolean,
  error?: string, durationMs?: number,
}, ctx) => void);
```

## Compaction hooks

### `before_compaction`

Fires before context compaction. The session JSONL file is already fully written at this point — extensions can read it asynchronously without blocking compaction.

```ts
api.on("before_compaction", (event: {
  messageCount: number, compactingCount?: number,
  tokenCount?: number, messages?: unknown[],
  sessionFile?: string,
}, ctx) => void);
```

### `after_compaction`

Fires after compaction completes. Pre-compaction messages are preserved on disk.

### `before_reset`

Fires when `/new` or `/reset` clears a session.

```ts
api.on("before_reset", (event: {
  sessionFile?: string, messages?: unknown[], reason?: string,
}, ctx) => void);
```

## Message lifecycle hooks

### `message_received`

Fires when an inbound message arrives from any channel.

```ts
api.on("message_received",
  (event: { from: string, content: string, timestamp?: number, metadata?: Record<string,unknown> },
   ctx: { channelId: string, accountId?: string, conversationId?: string }) => void
);
```

### `message_sending`

Fires before an outbound message is sent. Return `{ cancel: true }` to suppress delivery, or `{ content: "..." }` to replace the message body.

```ts
api.on("message_sending",
  (event: { to: string, content: string, metadata?: Record<string,unknown> }, ctx) => {
    return {
      content?: string,  // replacement content
      cancel?: boolean,  // true to suppress delivery
    };
  }
);
```

### `message_sent`

Fires after an outbound message is delivered (or fails). Observation only.

## Tool call hooks

### `before_tool_call`

Fires before each tool call. Return `params` to override arguments, or `block: true` to prevent the call.

```ts
api.on("before_tool_call",
  (event: { toolName: string, params: Record<string,unknown>, runId?: string, toolCallId?: string },
   ctx: { agentId?, sessionKey?, sessionId?, runId?, toolName, toolCallId? }) => {
    return {
      params?: Record<string,unknown>, // override tool arguments
      block?: boolean,                 // true to block the call
      blockReason?: string,            // shown in logs when blocked
    };
  }
);
```

### `after_tool_call`

Fires after a tool call completes. Observation only.

### `tool_result_persist`

Fires before a tool result message is written to the session JSONL transcript. Return a modified `message` to alter what is persisted, or return nothing to write the original.

```ts
api.on("tool_result_persist",
  (event: { toolName?: string, toolCallId?: string, message: AgentMessage, isSynthetic?: boolean },
   ctx) => ({
    message?: AgentMessage,
  })
);
```

### `before_message_write`

Fires before **any** message is written to the JSONL transcript. Return `{ block: true }` to prevent persistence, or `{ message }` to write a modified version.

```ts
api.on("before_message_write",
  (event: { message: AgentMessage, sessionKey?: string, agentId?: string }, ctx) => ({
    block?: boolean,
    message?: AgentMessage,
  })
);
```

## Session lifecycle hooks

### `session_start`

```ts
api.on("session_start", (event: {
  sessionId: string, sessionKey?: string, resumedFrom?: string,
}, ctx: { agentId?, sessionId, sessionKey? }) => void);
```

### `session_end`

```ts
api.on("session_end", (event: {
  sessionId: string, sessionKey?: string,
  messageCount: number, durationMs?: number,
}, ctx) => void);
```

## Subagent lifecycle hooks

### `subagent_spawning`

Fires when a subagent is about to be created. Return `{ status: "error", error: "..." }` to cancel spawning.

### `subagent_delivery_target`

Fires to allow an extension to redirect where a subagent's output is delivered.

### `subagent_spawned`

Fires after the subagent process has started. Observation only.

### `subagent_ended`

Fires when a subagent finishes, times out, or is killed.

```ts
api.on("subagent_ended", (event: {
  targetSessionKey: string, targetKind: string, reason: string,
  outcome?: "ok" | "error" | "timeout" | "killed" | "reset" | "deleted",
  error?: string, runId?: string, endedAt?: number,
}, ctx) => void);
```

## Gateway lifecycle hooks

### `gateway_start`

Fires when the gateway HTTP server is ready to accept connections.

```ts
api.on("gateway_start", (event: { port: number }, ctx: { port?: number }) => void);
```

### `gateway_stop`

Fires when the gateway is shutting down.

```ts
api.on("gateway_stop", (event: { reason?: string }, ctx) => void);
```

## All hook names (quick reference)

| Hook | Category | Can return result? |
|---|---|---|
| `before_model_resolve` | Agent | Yes — modelOverride, providerOverride |
| `before_prompt_build` | Agent | Yes — systemPrompt, prependContext, etc. |
| `before_agent_start` | Agent (legacy) | Yes — combined above |
| `llm_input` | Agent | No |
| `llm_output` | Agent | No |
| `agent_end` | Agent | No |
| `before_compaction` | Compaction | No |
| `after_compaction` | Compaction | No |
| `before_reset` | Compaction | No |
| `message_received` | Message | No |
| `message_sending` | Message | Yes — content, cancel |
| `message_sent` | Message | No |
| `before_tool_call` | Tool | Yes — params, block |
| `after_tool_call` | Tool | No |
| `tool_result_persist` | Tool | Yes — message |
| `before_message_write` | Tool | Yes — block, message |
| `session_start` | Session | No |
| `session_end` | Session | No |
| `subagent_spawning` | Subagent | Yes — status, error |
| `subagent_delivery_target` | Subagent | Yes — origin |
| `subagent_spawned` | Subagent | No |
| `subagent_ended` | Subagent | No |
| `gateway_start` | Gateway | No |
| `gateway_stop` | Gateway | No |