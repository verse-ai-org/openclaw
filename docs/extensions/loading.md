---
title: "Extension Loading Pipeline"
summary: "How OpenClaw discovers, validates, and loads extensions at gateway startup"
read_when:
  - You are debugging why an extension is not loading
  - You want to understand the full load sequence
  - You are adding a new extension to the bundled set
---

# Extension loading pipeline

Extensions are loaded synchronously at gateway startup by `loadOpenClawPlugins()` in `src/plugins/loader.ts`. The pipeline has nine stages.

## Stage overview

```
loadOpenClawPlugins()
        │
        ▼
[1] Discovery          scan 4 source locations, collect candidates[]
        │
        ▼
[2] Manifest registry  read openclaw.plugin.json for each candidate
        │
        ▼
[3] Enable/disable     apply allow/deny lists, memory slot policy
        │
        ▼
[4] Jiti init          lazily create jiti loader with SDK alias map
        │
        ▼
[5] Module load        jiti(source) — runs .ts directly, no build step
        │
        ▼
[6] Export resolution  support object, function, and activate() exports
        │
        ▼
[7] Config validation  JSON Schema validates plugins.entries[id].config
        │
        ▼
[8] API creation       createApi(record) — per-extension isolated API
        │
        ▼
[9] register(api)      extension initialises, calls api.registerXxx()
```

## Stage 1 — Discovery

`discoverOpenClawPlugins()` scans four locations in precedence order:

| Origin | Location |
|---|---|
| `config` | Each path in `plugins.load.paths` |
| `workspace` | `<workspaceDir>/.openclaw/extensions/` |
| `bundled` | Internal extensions directory (set by `OPENCLAW_BUNDLED_PLUGINS_DIR`) |
| `global` | `~/.openclaw/extensions/` |

For each directory, the scanner reads `package.json` and looks for `openclaw.extensions` to find entry files. If that field is absent, it falls back to `index.ts / index.js / index.mjs / index.cjs`.

**Security checks applied to every candidate:**

- Source file path must not escape the plugin root directory (symlink traversal check).
- Plugin root and source path must not be world-writable (`mode & 0o002`).
- File owner UID must match the current process UID or root (non-bundled plugins only).
- Hardlinks are rejected for non-bundled plugins.

Candidates that fail security checks produce `warn`-level diagnostics and are skipped — they never reach the load stage.

Directories named `*.bak`, `*.backup-*`, or `*.disabled` are silently skipped.

## Stage 2 — Manifest registry

`loadPluginManifestRegistry()` reads `openclaw.plugin.json` for each discovered candidate and validates:

- `id` field is present and non-empty.
- `configSchema` field is a JSON object.

Candidates with a missing or malformed manifest are marked `error` and excluded from further stages.

## Stage 3 — Enable/disable decisions

For each candidate with a valid manifest, `resolveEffectiveEnableState()` determines whether the extension should load:

1. **Explicit disable**: `plugins.entries.<id>.enabled = false` → disabled.
2. **Allow list**: if `plugins.allow` is non-empty and the extension id is not in it → disabled (bundled channel extensions are auto-enabled when `channels.<id>.enabled = true`).
3. **Deny list**: `plugins.deny` contains the id → disabled.
4. **Memory slot**: if `kind = "memory"` and `plugins.slots.memory` names a different extension → disabled without loading the module (fast-path, avoids importing heavy deps).

Disabled extensions appear in the registry with `status: "disabled"` and a human-readable `error` reason.

## Stage 4 — Jiti loader initialisation

The jiti loader is **lazily created** — if all extensions are disabled (common in unit tests) jiti is never initialised.

When first needed, `createJiti()` is called with:

- `interopDefault: true` — supports both `export default` and `module.exports`.
- `extensions` — all TypeScript and JavaScript variants are accepted: `.ts`, `.tsx`, `.mts`, `.cts`, `.js`, `.mjs`, `.cjs`, `.json`.
- `alias` — maps `openclaw/plugin-sdk` and each sub-path (e.g. `openclaw/plugin-sdk/memory-core`) to the actual file on disk.

**SDK alias resolution** walks up the directory tree (max 6 levels) from the loader file, looking for:

| Environment | Preferred alias target |
|---|---|
| Loader runs from `dist/` or `NODE_ENV=production` | `dist/plugin-sdk/<name>.js` |
| Loader runs from `src/` in development | `src/plugin-sdk/<name>.ts` |

If the preferred target does not exist, the other variant is used as a fallback.

## Stage 5 — Module load

```ts
mod = getJiti()(safeSource);
```

jiti executes the extension's TypeScript source directly — **no build step is needed for extensions**. If the module throws during import, the extension is marked `error` and loading continues with the next extension.

## Stage 6 — Export resolution

Three export shapes are supported:

```ts
// Shape A — standard object with register()
export default {
  id: "my-ext",
  register(api) { ... },
};

// Shape B — bare function
export default function(api) { ... };

// Shape C — legacy alias
export default {
  activate(api) { ... },
};
```

If the resolved export has no callable `register` or `activate`, the extension is marked `error`.

## Stage 7 — Config validation

The extension's `configSchema` (from `openclaw.plugin.json`) is used to validate `plugins.entries.<id>.config` from the user's config file. Validation failures mark the extension `error` and log the schema errors.

## Stage 8 — API creation

`createApi(record, { config, pluginConfig })` produces an `OpenClawPluginApi` bound to the extension's record. All `registerXxx()` calls on this API write into the shared `PluginRegistry` tagged with the extension's id, so diagnostics and ownership are always traceable.

The gateway `runtime` is injected via a `Proxy` so the runtime object is only materialised when an extension actually accesses it, keeping startup fast for simple extensions.

## Stage 9 — register(api)

`register(api)` is called synchronously. If it returns a Promise, the Promise is **ignored** with a `warn` diagnostic — async registration is not supported.

If `register` throws, the extension is marked `error`, the error is recorded, and loading continues with the next extension.

## Caching

The loaded `PluginRegistry` is cached in memory keyed by `(workspaceDir, pluginsConfig)`. Subsequent calls with the same key return the cached registry immediately and re-initialise the global hook runner. Pass `cache: false` to force a fresh load (used by tests and config-reload flows).

## Diagnosing load failures

Run `openclaw plugins status` to see all discovered extensions with their status, origin, and any error or diagnostic messages.

For detailed diagnostic output including warnings:

```bash
openclaw plugins status --deep
```

For JSON output suitable for scripting:

```bash
openclaw plugins status --json
```
