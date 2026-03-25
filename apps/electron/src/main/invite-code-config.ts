/**
 * invite-code-config.ts
 *
 * Centralised configuration for the invite-code validation feature.
 *
 * Priority for every value: environment variable > packaged/URL-derived default.
 *
 * Environment variables (all optional — sensible defaults are built-in):
 *   INVITE_CODE_APP_ID          Override the app ID sent in X-App-Id header.
 *   INVITE_CODE_APP_SECRET      Override the HMAC-SHA256 signing secret.
 *   INVITE_CODE_API_BASE_URL    Override the backend base URL (e.g. for staging).
 *
 * Dev vs prod secret selection (when INVITE_CODE_APP_SECRET is not set):
 *   - If the resolved base URL points at the production Railway endpoint → prod secret.
 *   - If app.isPackaged is true (real .app bundle) → prod secret.
 *   - Otherwise (localhost dev server) → dev secret.
 *
 * This lets developers test against the production backend from `pnpm dev` simply
 * by leaving the base URL as the production URL — the prod secret is selected
 * automatically without any env-var changes.
 */

// ─── App ID ──────────────────────────────────────────────────────────────────

export const INVITE_CODE_APP_ID =
  process.env.INVITE_CODE_APP_ID ?? "boss-simulator";

// ─── Backend base URL ────────────────────────────────────────────────────────

/** Production backend base URL (Railway). */
const PROD_BASE_URL = "https://verse-ai-service-production-22b8.up.railway.app/api/v1";

/** Local dev backend base URL. */
const DEV_BASE_URL = "http://localhost:8080/api/v1";
// const DEV_BASE_URL = "https://verse-ai-service-production-22b8.up.railway.app/api/v1";

/**
 * Resolve the invite-code backend base URL.
 *
 * Priority: env var > app.isPackaged > localhost fallback.
 * Do NOT use NODE_ENV — tsdown sets it to "production" even in `pnpm dev`.
 */
export function resolveInviteCodeBaseUrl(): string {
  if (process.env.INVITE_CODE_API_BASE_URL) {
    return process.env.INVITE_CODE_API_BASE_URL;
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { app } = require("electron") as typeof import("electron");
  if (app.isPackaged) {
    return PROD_BASE_URL;
  }
  // Dev mode: currently pointing at production for local testing.
  // Switch to DEV_BASE_URL when a local backend is running.
  return PROD_BASE_URL;
  // return DEV_BASE_URL;
}

// ─── App Secret ──────────────────────────────────────────────────────────────

/** HMAC-SHA256 signing secret for the production backend. */
const PROD_APP_SECRET = "sk_e4b27d261b3d02a9a7f80badc0f9f09d%";

/** HMAC-SHA256 signing secret for the local dev backend. */
const DEV_APP_SECRET = "boss-simulator-dev-secret-change-in-prod";
// const DEV_APP_SECRET = "sk_e4b27d261b3d02a9a7f80badc0f9f09d%";

/**
 * Resolve the HMAC signing secret.
 *
 * Priority: env var > URL-derived > isPackaged > dev fallback.
 * Secret follows the base URL: prod URL → prod secret, localhost → dev secret.
 */
export function resolveInviteCodeAppSecret(): string {
  if (process.env.INVITE_CODE_APP_SECRET) {
    return process.env.INVITE_CODE_APP_SECRET;
  }
  // Derive from the resolved base URL so that pointing at prod (even in dev
  // mode) automatically uses the correct prod secret.
  const baseUrl = resolveInviteCodeBaseUrl();
  if (
    baseUrl.includes("railway.app") ||
    baseUrl.includes("verse-ai-service-production")
  ) {
    return PROD_APP_SECRET;
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { app } = require("electron") as typeof import("electron");
  if (app.isPackaged) {
    return PROD_APP_SECRET;
  }
  return DEV_APP_SECRET;
}
