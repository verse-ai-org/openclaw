export const DEFAULT_GATEWAY_PORT = 18789;

export const GATEWAY_READY_TIMEOUT_MS = 15_000;
/** Packaged Windows cold start (35+ plugins, AV scan) often exceeds 15s. */
export const GATEWAY_READY_TIMEOUT_MS_WIN = 60_000;
export const GATEWAY_READY_POLL_MS = 200;
export const CHILD_STDERR_TAIL_LINES = 30;
/** Liveness probe — works even when bundled Control UI assets are missing (GET / returns 503). */
export const GATEWAY_PROBE_PATH = "/health";

export const PRE_FREE_SIGTERM_WAIT_MS = 600;
export const PRE_FREE_RELEASE_TIMEOUT_MS = 3_000;
export const PRE_FREE_POLL_MS = 100;
