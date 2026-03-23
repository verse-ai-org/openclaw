---
title: "Plugin SDK API Reference"
summary: "All api.registerXxx() methods available to extensions via OpenClawPluginApi"
read_when:
  - You are writing an extension and need to know which registration methods are available
  - You want to understand what an existing extension registers
---

# Plugin SDK API reference

Each extension receives an `OpenClawPluginApi` instance as the argument to its `register()` function. The API is scoped to the extension — all registrations are tagged with the extension's id for diagnostics and ownership tracking.

## Import pattern

Each extension imports from its own SDK sub-path to keep dependencies narrow:

```ts
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/<extension-id>";
```

Sub-paths export only the types and helpers that the specific extension needs. The monolithic `openclaw/plugin-sdk` root import is still supported for legacy compatibility.

## api.registerTool()

Registers an agent tool (JSON Schema function) that the LLM can call during agent runs.

```ts
api.registerTool(
  tool,      // AnyAgentTool | OpenClawPluginToolFactory
  opts?,     // { name?, names?, optional? }
);
```

- Pass a **factory function** `(ctx: OpenClawPluginToolContext) => AnyAgentTool | AnyAgentTool[] | null` to receive per-session context (config, agentId, sessionKey, etc.).
- Pass a **static tool object** for tools that don't need session context.
- `optional: true` marks the tool as opt-in — it is never auto-enabled and must be added to an agent allowlist.

See [Plugin agent tools](/plugins/agent-tools) for full examples.

## api.registerChannel()

Registers a messaging channel (Telegram, Discord, WhatsApp, etc.).

```ts
api.registerChannel(
  registration,  // ChannelPlugin | { plugin: ChannelPlugin, dock?: ChannelDock }
);
```

The `plugin.id` field becomes the channel identifier used in config (`channels.<id>.enabled`).

## api.registerProvider()

Registers an AI provider with one or more authentication methods.

```ts
api.registerProvider({
  id: "my-provider",
  label: "My Provider",
  docsPath: "/providers/my-provider",
  aliases: ["my-provider-alias"],
  auth: [
    {
      id: "oauth",
      label: "OAuth (Global)",
      kind: "device_code",  // "oauth" | "api_key" | "token" | "device_code" | "custom"
      run: async (ctx) => { ... }, // returns ProviderAuthResult
    },
  ],
});
```

The `run()` handler receives a `ProviderAuthContext` with `prompter`, `openUrl`, `config`, and OAuth helpers. It returns a `ProviderAuthResult` containing credentials and an optional config patch.

## api.registerService()

Registers a background service with `start` / `stop` lifecycle tied to the gateway.

```ts
api.registerService({
  id: "my-service",
  start: async (ctx) => {
    // ctx.stateDir, ctx.config, ctx.workspaceDir, ctx.logger
    // start timers, open connections, etc.
  },
  stop: async (ctx) => {
    // clean up
  },
});
```

Useful for background polling, expiry timers, or persistent connections that should run alongside the gateway.

## api.registerCommand()

Registers a slash command (e.g. `/phone arm`) that is processed **before** the LLM agent and does not consume AI tokens.

```ts
api.registerCommand({
  name: "phone",      // command name without leading slash
  description: "...",
  acceptsArgs: true,
  requireAuth: true,  // default true; set false to allow unauthenticated senders
  handler: async (ctx) => {
    // ctx.args, ctx.channel, ctx.config, ctx.senderId, ctx.isAuthorizedSender ...
    return { text: "response text" };
  },
});
```

Commands are matched against inbound messages before routing to the agent. If a handler returns a result the message does not reach the LLM.

## api.registerHook() / api.on()

Two ways to register lifecycle hooks:

```ts
// Preferred — typed, with compile-time safety
api.on("before_model_resolve", (event, ctx) => {
  return { modelOverride: "claude-opus-4-5" };
});

// Legacy — untyped string events
api.registerHook("before_model_resolve", handler, { name: "my-hook" });
```

See [Lifecycle hooks](./hooks.md) for all 26 hook names and their event/result types.

## api.registerHttpRoute()

Registers an HTTP route served by the gateway's built-in HTTP server.

```ts
api.registerHttpRoute({
  path: "/webhook",
  auth: "plugin",     // "gateway" (requires gateway auth) or "plugin" (own auth logic)
  match: "prefix",   // "exact" (default) or "prefix"
  handler: async (req, res) => {
    res.writeHead(200);
    res.end("ok");
  },
});
```

- Routes with different `auth` values that overlap in path space are rejected.
- Same-auth overlapping routes (e.g. a `prefix` route and an `exact` sub-path) are allowed.
- Use `replaceExisting: true` to update a route you previously registered in the same extension.

## api.registerGatewayMethod()

Registers a custom JSON-RPC method on the gateway.

```ts
api.registerGatewayMethod("my-ext.ping", ({ respond }) => {
  respond(true, { ok: true });
});
```

Method names must not collide with core gateway methods.

## api.registerCli()

Injects subcommands into the OpenClaw CLI.

```ts
api.registerCli(
  ({ program, config, logger }) => {
    program
      .command("my-cmd")
      .description("Do something")
      .action(async () => { ... });
  },
  { commands: ["my-cmd"] },
);
```

## api.registerContextEngine()

Registers a context engine implementation. Only one context engine is active at a time (exclusive slot).

```ts
api.registerContextEngine("my-engine", (config) => {
  return {
    query: async (input) => [{ text: "relevant context", score: 0.9 }],
  };
});
```

## api.resolvePath()

Resolves a user-supplied path string (supports `~` expansion and relative paths).

```ts
const absPath = api.resolvePath("~/my-data");
```

## Metadata fields

The API object also exposes read-only metadata about the extension:

| Field | Type | Description |
|---|---|---|
| `api.id` | `string` | Extension id |
| `api.name` | `string` | Display name |
| `api.version` | `string \| undefined` | Version from manifest |
| `api.description` | `string \| undefined` | Description from manifest |
| `api.source` | `string` | Absolute path to the entry file |
| `api.config` | `OpenClawConfig` | Full gateway config |
| `api.pluginConfig` | `Record<string, unknown> \| undefined` | Extension-specific config (`plugins.entries.<id>.config`) |
| `api.runtime` | `PluginRuntime` | Runtime services (tools, channels, state, config IO) |
| `api.logger` | `PluginLogger` | Scoped logger (`info`, `warn`, `error`, `debug`) |
