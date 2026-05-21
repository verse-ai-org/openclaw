# In-Process Gateway Evaluation

## Question

Can the openclaw gateway run inside the Electron main process (or use Electron's
embedded Node.js) to eliminate the standalone Node 24 binary (~114 MB)?

## Verdict: Feasible via Electron Upgrade to v40+

Electron 40+ embeds **Node.js 24.15.0**, which satisfies the gateway's Node
22.19+ requirement. Upgrading Electron eliminates the version gap and makes two
approaches viable:

1. **Drop the standalone Node binary entirely** — use Electron's embedded Node
   (via `utilityProcess` or `process.execPath`) to spawn the gateway child
   process. Saves ~114 MB with minimal architecture change.
2. **True in-process execution** — run the gateway inside the Electron process
   itself. Saves ~114 MB but requires addressing process isolation concerns.

## Current State

- Project upgraded to **Electron 42.2.0** (Node.js 24.15.0, Chromium 148)
- Gateway requires: **Node 22.19+**, recommended Node 24
- Status: **Implemented** (Approach A)

Source: https://releases.electronjs.org/release

## Approach A: Upgrade Electron + Use Its Node for Child Process (Recommended)

Upgrade from Electron 31 → 40+ and replace the standalone Node 24 binary with
Electron's own Node runtime for the gateway subprocess.

### How It Works

Replace `resolveBundledNode()` in `apps/electron/src/main/gateway/paths.ts`:
- Current: returns `Resources/node/node` (standalone 114 MB binary)
- New: returns `process.execPath` (the Electron binary) with `--no-sandbox` or
  use Electron's `utilityProcess.fork()` API (Electron 22+)

### Benefits
- Saves ~114 MB (eliminates standalone Node binary)
- No architecture rewrite needed — gateway still runs as a child process
- Native addons use the same Node 24 ABI (no recompilation needed)
- `--experimental-strip-types` and ESM both work in Node 24.15.0

### Risks
- Electron major version upgrade (31 → 40+) may have breaking Chromium/API changes
- `process.execPath` with `--` args might behave differently from plain `node`
- `utilityProcess` has limited stdio compared to `child_process.spawn`

### Migration Path
1. Upgrade `electron` devDependency from `31.7.7` to `^40.0.0` or `^42.0.0`
2. Run `electron-builder install-app-deps` to recompile native addons
3. Replace standalone Node download in `scripts/download-node.sh` with a no-op
4. Update `resolveBundledNode()` to use `process.execPath` (packaged) or
   Electron's `utilityProcess.fork()` for the gateway
5. Remove `extraResources` entry for `resources/node-${arch}/node` in
   `electron-builder.yml`
6. Test gateway startup, signal handling, and extension loading

## Approach B: True In-Process (Higher Risk)

Run the gateway inside the Electron main process directly (no child process).

### Remaining Blockers (even with Node 24)

#### Process Isolation Design
The gateway uses `process.exit()` for fatal error recovery and relies on
SIGTERM/SIGINT signal handling. Running in-process would crash the entire
Electron app on gateway fatal errors.

#### Extension Runtime Expectations
Extensions assume a standalone Node environment. The Electron main process has
IPC channels and Chrome DevTools protocol in its global scope, which could
interfere with networking libraries.

#### Worker Thread Compatibility
Gateway uses `worker_threads` for code-mode agents. These work in Electron's
main process but add complexity to lifecycle management.

### Verdict on Approach B
Not recommended unless the gateway is refactored to never call `process.exit()`
and all fatal error paths are converted to recoverable throws.

## Recommendation

**Approach A** (Electron upgrade + use its Node for child process) is the
clear winner:
- Same ~114 MB savings as true in-process
- Minimal code change (update `resolveBundledNode()`, remove Node download)
- Preserves process isolation (no gateway crash can kill the UI)
- Modern Chromium/security benefits from Electron 40+

Status: **Implemented**. Electron upgraded to 42.2.0. Gateway subprocess now
uses `ELECTRON_RUN_AS_NODE=1` + `process.execPath` instead of standalone Node
binary. Saves ~114 MB.
