---
title: "Extensions Overview"
summary: "Overview of the OpenClaw extension system: what extensions are, how they are discovered, loaded, and registered"
read_when:
  - You want to understand how the extension/plugin system works
  - You are building a new extension
  - You are debugging extension load failures
---

# Extensions overview

OpenClaw uses an **extension system** (also called the plugin system) to add channels, AI providers, agent tools, CLI commands, background services, and lifecycle hooks without modifying the core gateway.

All built-in channels (Telegram, Discord, WhatsApp, …) and authentication providers (MiniMax, Qwen, Gemini, …) are themselves extensions. Third-party extensions follow the exact same contract.

## Quick links

- [Extension catalog](./catalog.md) — all 42 built-in extensions listed by category
- [Loading pipeline](./loading.md) — discovery → manifest → jiti → register
- [Plugin SDK API](./sdk-api.md) — every `api.registerXxx()` method
- [Lifecycle hooks](./hooks.md) — all 26 hook events
- [Writing an extension](./authoring.md) — step-by-step guide with examples
- [Known limitations](./limitations.md) — jiti-based loading caveats

## Core concepts

### Two manifest files

Every extension directory contains two files:

| File | Purpose |
|---|---|
| `package.json` | npm package descriptor; `openclaw.extensions` field lists entry points |
| `openclaw.plugin.json` | runtime manifest; declares `id`, `configSchema`, optional `kind`, `channels`, `providers` |

Both files are required. A missing or invalid `openclaw.plugin.json` blocks the extension from loading.

### Plugin origins (precedence order)

Extensions are discovered from four locations. When the same `id` appears in more than one location, the highest-priority source wins and the rest are marked `overridden`.

| Origin | Location | Priority |
|---|---|---|
| `config` | Paths listed in `plugins.load.paths` | Highest |
| `workspace` | `<workspaceDir>/.openclaw/extensions/` | ↓ |
| `bundled` | Built-in extensions shipped with the core package | ↓ |
| `global` | `~/.openclaw/extensions/` | Lowest |

### Plugin kinds

Most extensions have no `kind` and can coexist freely. Two kinds are **exclusive slots** — only one active instance is allowed at a time:

| Kind | Slot config key | Default |
|---|---|---|
| `memory` | `plugins.slots.memory` | `memory-core` |
| `context-engine` | `plugins.slots.contextEngine` | built-in `legacy` |

### Registration model

Extensions are **synchronous** at load time. Each extension receives an `OpenClawPluginApi` instance and calls `api.registerXxx()` methods to register capabilities into a central `PluginRegistry`. The gateway then consumes that registry to wire channels, tools, routes, and hooks.

```
extension file
  └─ export default { register(api) { ... } }
                              │
              ┌───────────────┼───────────────────┐
              ▼               ▼                   ▼
        api.registerChannel  api.registerTool  api.registerProvider
              │               │                   │
              └───────────────┴───────────────────┘
                              │
                       PluginRegistry
                    (consumed by gateway)
```

## Extension anatomy

Minimal extension layout:

```
extensions/my-extension/
├── index.ts               ← entry point (declared in package.json)
├── package.json           ← npm descriptor with openclaw.extensions field
└── openclaw.plugin.json   ← runtime manifest
```

`package.json` minimum:

```json
{
  "name": "@openclaw/my-extension",
  "version": "2026.1.1",
  "type": "module",
  "openclaw": {
    "extensions": ["./index.ts"]
  }
}
```

`openclaw.plugin.json` minimum:

```json
{
  "id": "my-extension",
  "configSchema": {
    "type": "object",
    "additionalProperties": false,
    "properties": {}
  }
}
```

`index.ts` minimum:

```ts
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/my-extension";

export default {
  id: "my-extension",
  register(api: OpenClawPluginApi) {
    // register capabilities here
  },
};
```

See [Writing an extension](./authoring.md) for complete examples.
