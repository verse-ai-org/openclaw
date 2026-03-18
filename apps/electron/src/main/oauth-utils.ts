/**
 * oauth-utils.ts
 *
 * Shared utilities for OAuth flows.
 * Extracted from onboarding-oauth.ts so they can be reused by any
 * future OAuth implementation (Authorization Code, Device Code, etc.).
 */

import { randomBytes, createHash } from "node:crypto";

/**
 * Generate a PKCE (Proof Key for Code Exchange) verifier/challenge pair
 * plus a random state value for CSRF protection.
 *
 * - verifier:  high-entropy random string sent at token exchange
 * - challenge: SHA-256(verifier) base64url-encoded, sent at auth request
 * - state:     random value for CSRF protection
 */
export function generatePkce(): { verifier: string; challenge: string; state: string } {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const state = randomBytes(16).toString("base64url");
  return { verifier, challenge, state };
}

/**
 * Encode an object as application/x-www-form-urlencoded body.
 */
export function toFormUrlEncoded(params: Record<string, string>): string {
  return Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
}
