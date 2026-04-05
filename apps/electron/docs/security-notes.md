# Electron desktop client — security-related behavior

This note complements the repository root `SECURITY.md` and documents behaviors operators may see in logs when using the packaged desktop app.

## External links

The main window loads the control UI on loopback HTTP. Top-level navigations to non-app origins are cancelled and opened with the system default browser (`shell.openExternal`) so users are not stuck on a blank or CSP-blocked page after clicking `http(s):` links. See `apps/electron/src/main/window.ts` (`installExternalLinkNavigationHandlers`, `setWindowOpenHandler`).

## Content Security Policy (CSP)

The Electron session injects a strict CSP for the renderer. Image sources are limited to the app origin, `data:` / `blob:` / `file:`, the gateway loopback URL, and an explicit allowlist of HTTPS image hosts needed for common chat embeds (for example `https://img.alicdn.com`). Tightening or widening `img-src` should be done deliberately; prefer gateway-proxied media if you need many arbitrary hosts.

## Gateway URL fetch / SSRF protection

When the agent or tools request a URL (e.g. `web_fetch`), the gateway resolves the hostname and **blocks** targets that map to private, internal, or special-use IP ranges. Short links or DNS that resolve to loopback or RFC1918 space will log a `security: blocked URL fetch` line and fail with a message such as `Blocked: resolves to private/internal/special-use IP address`. This is intentional SSRF mitigation; see `src/infra/net/ssrf.ts` and `src/infra/net/fetch-guard.ts`.

## Control UI cold-path performance logs

For diagnosing slow first paint, the gateway may log lines prefixed with `control-ui perf:` for `config.get` and `chat.history` (timings only; no secrets). These are diagnostic and do not change behavior.
