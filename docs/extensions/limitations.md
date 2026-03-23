---
title: "Extension Known Limitations"
summary: "Documented caveats, gotchas, and design constraints for OpenClaw extensions"
read_when:
  - Your extension is not registering tools or commands as expected
  - You are debugging a silent registration failure
  - You want to understand the jiti loading model and its trade-offs
---

# Extension known limitations

This page documents the known caveats and design constraints of the extension system. Understanding these avoids hard-to-debug silent failures.

## Async `register()` is not supported

**The single most common source of silent failures.**

`register(api)` is called synchronously. If it returns a `Promise`, the Promise is **discarded** with a `warn`-level diagnostic and execution continues immediately. Any `api.registerXxx()` call inside the `async` body races against the gateway startup and — in practice — always loses: the registration never takes effect.

```ts
// WRONG — register returns a Promise; tool is never registered
export default {
  id: "my-ext",
  async register(api) {
    const data = await fetch("https://api.example.com/config").then((r) => r.json());
    api.registerTool(buildTool(data));  // never reached at startup
  },
};
```

```ts
// RIGHT — register is synchronous; async work moves into a service
export default {
  id: "my-ext",
  register(api) {
    // Register tools synchronously with static definitions.
    api.registerTool(myTool);

    // Defer async initialisation to a service.
    api.registerService({
      id: "my-ext-init",
      start: async (_ctx) => {
        const data = await fetch("https://api.example.com/config").then((r) => r.json());
        // Store result somewhere the tool can read it at call time.
      },
      stop: async (_ctx) => {},
    });
  },
};
```

If you see a `warn` diagnostic like `"my-ext: register() returned a Promise; async registration is not supported"` in `openclaw plugins status --deep`, this is the cause.

## Jiti executes TypeScript directly — no build step, but with trade-offs

The loader uses [jiti](https://github.com/unjs/jiti) to run `.ts` source directly without a
pre-build step. This is convenient for development but has implications:

### Dynamic import mixing

Do **not** mix `await import("x")` and `import ... from "x"` for the same module in the same
extension file. When jiti transforms the file, the two import styles can resolve to different
module instances, causing type mismatches, double-initialization, or runtime errors.

If you need lazy loading, isolate it in a dedicated `*.runtime.ts` boundary file and import
that boundary dynamically:

```ts
// my-ext/heavy.runtime.ts
export { heavyLib } from "heavy-lib";   // only static imports here

// my-ext/index.ts
export default {
  id: "my-ext",
  register(api) {
    api.registerService({
      id: "my-ext-heavy",
      start: async (_ctx) => {
        const { heavyLib } = await import("./heavy.runtime.js");
        heavyLib.init();
      },
      stop: async (_ctx) => {},
    });
  },
};
```

After any refactor that touches lazy-loading boundaries, run `pnpm build` and check for
`[INEFFECTIVE_DYNAMIC_IMPORT]` warnings.

### TypeScript features not supported by jiti

jiti uses esbuild to strip types and supports most TypeScript syntax. The following are **not**
supported or behave differently:

- `const enum` — use regular `enum` or plain object literals instead.
- Path aliases defined in `tsconfig.json` `paths` — only `openclaw/plugin-sdk/*` aliases are
  injected by the loader. Other path aliases (e.g. `@/foo`) are not resolved.
- `emitDecoratorMetadata` — not supported.
- Certain `.d.ts`-only type imports with `import type ... assert { type: "json" }` syntax.

### Source maps in stack traces

When an extension throws an error, jiti's source maps are used to point back to the original
`.ts` file. Stack traces are usually accurate, but line numbers can drift in files with complex
macros or conditional compilation.

## Security checks reject certain file layouts

The discovery stage applies security checks to every candidate. Extensions that fail are
skipped silently (a `warn` diagnostic is emitted) and never reach `register()`.

| Check | Cause | Fix |
|---|---|---|
| World-writable path | The plugin directory or source file has `o+w` permission (`mode & 0o002`) | `chmod o-w <dir>` |
| UID mismatch | The file owner UID does not match the current process UID (non-bundled only) | Ensure the file is owned by the user running the gateway |
| Hardlink rejected | Source file is a hardlink (non-bundled only) | Use a regular file or symlink instead |
| Path traversal | Source path escapes the plugin root via symlink | Resolve the symlink so it stays inside the plugin directory |
| Backup directory | Directory name matches `*.bak`, `*.backup-*`, or `*.disabled` | Rename the directory |

Run `openclaw plugins status --deep` to see which check failed.

## `openclaw.plugin.json` is required and must be valid

A missing, unparseable, or structurally invalid `openclaw.plugin.json` blocks the extension at
the manifest stage — the module file is never imported. Validators check:

- `id` field: present and non-empty string.
- `configSchema` field: present and a JSON object.

Other fields (`name`, `description`, `kind`, `uiHints`) are optional.

## Exclusive slots: memory and context-engine

Only **one** extension with `"kind": "memory"` and one with `"kind": "context-engine"` can be
active simultaneously. The active extension is chosen by:

```json5
{
  plugins: {
    slots: {
      memory: "memory-lancedb",       // default: "memory-core"
      contextEngine: "my-context-engine",
    },
  },
}
```

All other extensions with the same `kind` are disabled at stage 3 (before module load) with
status `disabled` and reason `"memory slot taken by <id>"`. This is intentional and not an
error.

## Config validation rejects at load time

If `plugins.entries.<id>.config` does not satisfy the `configSchema` declared in
`openclaw.plugin.json`, the extension is marked `error` and `register()` is not called. Check
the schema carefully — especially `additionalProperties: false`, which rejects unknown keys.

## Registry cache is keyed by config snapshot

The loaded `PluginRegistry` is cached in memory keyed by `(workspaceDir, pluginsConfig)`. If
you change the config file on disk, you must restart the gateway for the new config to take
effect. Passing `cache: false` to the internal loader API bypasses the cache (tests and
config-reload flows use this).

## `api.registerHttpHandler()` is removed

The old `api.registerHttpHandler(...)` API was removed. If an extension calls it, the loader
catches the `TypeError` and records a diagnostic:

```
deprecated api.registerHttpHandler(...) was removed; use api.registerHttpRoute(...) for
plugin-owned routes or registerPluginHttpRoute(...) for dynamic lifecycle routes
```

Replace all uses with `api.registerHttpRoute()`.

## Prototype mutation is prohibited

Per the project coding style, extensions must **not** share behaviour via prototype mutation
(`Class.prototype.method = ...`, `Object.defineProperty` on `.prototype`). Use explicit
inheritance or helper composition instead. Extensions that rely on prototype patching will fail
type-checking and code review.

## Extensions cannot use `workspace:*` in `dependencies`

When OpenClaw installs third-party plugins it runs `npm install --omit=dev` inside the plugin
directory. pnpm `workspace:*` specifiers are not understood by plain npm and cause install
failures. Put `openclaw` in `devDependencies` or `peerDependencies` only.

## `register()` throwing is non-fatal for other extensions

If `register()` throws, the extension is marked `error` and loading continues with the next
extension. A single bad extension does not prevent the rest from loading. Check
`openclaw plugins status` to confirm all expected extensions have status `loaded`.

## See also

- [Loading pipeline](./loading.md) — full nine-stage sequence with all failure points
- [Writing an extension](./authoring.md) — patterns that avoid these pitfalls
- [Plugin SDK API](./sdk-api.md) — authoritative method reference
