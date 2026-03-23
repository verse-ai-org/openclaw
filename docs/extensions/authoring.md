---
title: "Writing an Extension"
summary: "Step-by-step guide to building a new OpenClaw extension from scratch, with worked examples"
read_when:
  - You are building a new extension
  - You want a complete worked example
  - You are unsure which api.registerXxx() call to use
---

# Writing an extension

This guide walks you through creating a new OpenClaw extension from scratch. By the end you will have a working extension installed into the gateway.

Before reading this, skim the [Extensions overview](./index.md) to understand manifests, origins, and the registration model.

## Prerequisites

- Node 22+, pnpm
- The `openclaw` repo checked out (or an npm install of `openclaw`)
- TypeScript familiarity

## 1. Pick a location

Extensions are discovered from four locations (highest priority first):

| Origin | Location |
|---|---|
| `config` | Paths listed in `plugins.load.paths` in your config |
| `workspace` | `<workspaceDir>/.openclaw/extensions/<your-ext>/` |
| `bundled` | Built-in extensions shipped with the core package |
| `global` | `~/.openclaw/extensions/<your-ext>/` |

For a personal extension that only you use, `~/.openclaw/extensions/my-ext/` is the easiest
startup. For a shared extension checked into the repo, use `plugins.load.paths`.

## 2. Create the directory structure

```
my-ext/
├── index.ts               ← entry point
├── package.json
└── openclaw.plugin.json
```

## 3. Write `package.json`

```json
{
  "name": "my-ext",
  "version": "2026.1.1",
  "type": "module",
  "openclaw": {
    "extensions": ["./index.ts"]
  }
}
```

Key points:

- The `openclaw.extensions` array lists entry points. You can have more than one if a single
  package ships multiple independent extensions.
- If `openclaw.extensions` is absent, the loader falls back to `index.ts / index.js /
  index.mjs / index.cjs`.
- The `name` and `version` fields are informational only at load time.

## 4. Write `openclaw.plugin.json`

The runtime manifest is validated before the module is imported. A missing or malformed manifest
blocks the extension from loading entirely.

**Minimal (no config):**

```json
{
  "id": "my-ext",
  "configSchema": {
    "type": "object",
    "additionalProperties": false,
    "properties": {}
  }
}
```

**With config schema and UI hints:**

```json
{
  "id": "my-ext",
  "name": "My Extension",
  "description": "Does something useful.",
  "configSchema": {
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "webhookUrl": {
        "type": "string"
      },
      "retries": {
        "type": "integer",
        "minimum": 0,
        "maximum": 10
      }
    }
  },
  "uiHints": {
    "webhookUrl": {
      "label": "Webhook URL",
      "help": "URL that receives event payloads"
    },
    "retries": {
      "label": "Retry count",
      "help": "How many times to retry a failed delivery (default: 3)"
    }
  }
}
```

Config values are read from `plugins.entries.my-ext.config` in the gateway config file. The
schema is validated at load time; a validation failure marks the extension `error` and skips
`register()`.

## 5. Write `index.ts`

The entry file exports a **plugin definition object** (or a bare register function) as its
default export. Three export shapes are supported:

```ts
// Shape A — recommended: named object with register()
export default {
  id: "my-ext",
  register(api) { ... },
};

// Shape B — bare function (id comes from openclaw.plugin.json)
export default function(api) { ... };

// Shape C — legacy alias (activate instead of register)
export default {
  activate(api) { ... },
};
```

The `id` field in the export object is informational; the authoritative id comes from
`openclaw.plugin.json`.

**Critical:** `register()` is called **synchronously**. If it returns a Promise, the Promise is
discarded with a warning and any `api.registerXxx()` calls inside the async body are silently
lost. See [Known limitations](./limitations.md) for details.

## 6. Import types from the plugin SDK

The loader maps `openclaw/plugin-sdk/<name>` to the correct file on disk at runtime (no npm
install needed for bundled extensions). Import only the types you need:

```ts
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/my-ext";
```

Each sub-path exports only the types and helpers relevant to that extension. Use the root import
`openclaw/plugin-sdk` only when a dedicated sub-path does not yet exist.

## Worked examples

### Example A: lifecycle hook extension

An extension that overrides the model for a specific channel.

```ts
// my-ext/index.ts
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/my-ext";

export default {
  id: "my-ext",
  register(api: OpenClawPluginApi) {
    api.on("before_model_resolve", (_event, ctx) => {
      if (ctx.channelId === "telegram") {
        return { modelOverride: "claude-haiku-3-5" };
      }
    });
  },
};
```

```json
// openclaw.plugin.json
{
  "id": "my-ext",
  "configSchema": { "type": "object", "additionalProperties": false, "properties": {} }
}
```

### Example B: background service

An extension that polls an external API every 30 seconds.

```ts
// my-ext/index.ts
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/my-ext";

export default {
  id: "my-ext",
  register(api: OpenClawPluginApi) {
    api.registerService({
      id: "my-ext-poller",
      start: async (ctx) => {
        const interval = setInterval(async () => {
          try {
            const resp = await fetch("https://api.example.com/events");
            if (!resp.ok) return;
            const data = await resp.json();
            api.logger.info(`my-ext: polled ${JSON.stringify(data)}`);
          } catch (err) {
            api.logger.warn(`my-ext: poll failed: ${String(err)}`);
          }
        }, 30_000);
        interval.unref?.();
        // store handle so stop() can clear it
        (ctx as Record<string, unknown>).__interval = interval;
      },
      stop: async (ctx) => {
        const interval = (ctx as Record<string, unknown>).__interval as ReturnType<typeof setInterval> | undefined;
        if (interval) clearInterval(interval);
      },
    });
  },
};
```

### Example C: slash command

An extension that adds a `/ping` command that responds without consuming AI tokens.

```ts
// my-ext/index.ts
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/my-ext";

export default {
  id: "my-ext",
  register(api: OpenClawPluginApi) {
    api.registerCommand({
      name: "ping",
      description: "Check gateway liveness.",
      acceptsArgs: false,
      handler: async (_ctx) => {
        return { text: "pong" };
      },
    });
  },
};
```

### Example D: extension with typed config

An extension that reads its own config from `plugins.entries.my-ext.config`.

```ts
// my-ext/index.ts
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/my-ext";

type MyExtConfig = {
  webhookUrl?: string;
  retries?: number;
};

export default {
  id: "my-ext",
  register(api: OpenClawPluginApi) {
    const cfg = (api.pluginConfig ?? {}) as MyExtConfig;
    const webhookUrl = cfg.webhookUrl ?? process.env.MY_EXT_WEBHOOK_URL ?? "";
    const retries = cfg.retries ?? 3;

    if (!webhookUrl) {
      api.logger.warn("my-ext: webhookUrl not configured, service disabled");
      return;
    }

    api.registerService({
      id: "my-ext-webhook",
      start: async (_ctx) => {
        api.logger.info(`my-ext: webhook configured at ${webhookUrl} (retries=${retries})`);
      },
      stop: async (_ctx) => {},
    });
  },
};
```

Gateway config:

```json5
{
  plugins: {
    entries: {
      "my-ext": {
        enabled: true,
        config: {
          webhookUrl: "https://hooks.example.com/my-ext",
          retries: 5,
        },
      },
    },
  },
}
```

### Example E: HTTP route

An extension that exposes a webhook receiver at `/webhook/my-ext`.

```ts
// my-ext/index.ts
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/my-ext";

export default {
  id: "my-ext",
  register(api: OpenClawPluginApi) {
    api.registerHttpRoute({
      path: "/webhook/my-ext",
      auth: "plugin",   // extension handles its own auth
      match: "exact",
      handler: async (req, res) => {
        if (req.method !== "POST") {
          res.writeHead(405);
          res.end();
          return;
        }
        let body = "";
        for await (const chunk of req) {
          body += chunk;
        }
        api.logger.info(`my-ext: received ${body.length} bytes`);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      },
    });
  },
};
```

## 7. Enable the extension in config

If the extension is discovered from `global` or `workspace`, it is enabled by default (subject
to the allow/deny lists). To be explicit:

```json5
{
  plugins: {
    entries: {
      "my-ext": {
        enabled: true,
      },
    },
  },
}
```

For `config`-origin extensions, add the directory to `plugins.load.paths`:

```json5
{
  plugins: {
    load: {
      paths: ["/absolute/path/to/my-ext"],
    },
  },
}
```

## 8. Verify the extension loaded

```bash
openclaw plugins status
```

Look for your extension id with status `loaded`. If the status is `error` or `disabled`, the
`error` field contains the reason:

```bash
openclaw plugins status --deep   # includes warn-level diagnostics
openclaw plugins status --json   # machine-readable
```

## Publishing as a third-party npm package

Third-party extensions can be distributed on npm. Users install them globally and add the path
to `plugins.load.paths`:

```bash
npm install -g my-openclaw-ext
```

```json5
{
  plugins: {
    load: {
      paths: ["/usr/local/lib/node_modules/my-openclaw-ext"],
    },
  },
}
```

**npm package checklist:**

- `openclaw` must be in `devDependencies` or `peerDependencies`, not `dependencies`. The
  runtime resolves `openclaw/plugin-sdk` via the jiti alias at load time — shipping `openclaw`
  as a production dependency adds unnecessary bloat and can cause version mismatches.
- Runtime dependencies must be in `dependencies` (not `devDependencies`) because the install
  runs `npm install --omit=dev`.
- Do not use `workspace:*` in `dependencies`; it breaks standalone npm installs.

## Next steps

- [Plugin SDK API](./sdk-api.md) — complete reference for all `api.registerXxx()` methods
- [Lifecycle hooks](./hooks.md) — all 26 hook events and their result types
- [Known limitations](./limitations.md) — jiti caveats, async registration, security checks
- [Loading pipeline](./loading.md) — full nine-stage load sequence
