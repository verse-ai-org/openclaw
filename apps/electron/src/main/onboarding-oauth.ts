/**
 * onboarding-oauth.ts
 *
 * OAuth flow support for the onboarding wizard.
 *
 * MiniMax (Global + CN): Full Device Code Flow with PKCE.
 *   Implemented via the generic startDeviceCodeFlow / pollDeviceCodeFlow runner
 *   in oauth-device-flow.ts. MiniMax-specific logic lives in MINIMAX_GLOBAL_FLOW
 *   and MINIMAX_CN_FLOW config objects.
 *
 * Other providers: Simple URL-open flow.
 *   1. oauthStart → shell.openExternal(url?redirect_uri=openclaw://oauth/callback)
 *   2. Provider redirects to openclaw://oauth/callback?code=xxx
 *   3. handleOAuthProtocolCallback (called by index.ts open-url/second-instance)
 *      stores the result in completedCallbacks
 *   4. oauthPoll → checks completedCallbacks, returns token when available
 */

import { generatePkce } from "./oauth-utils.js";
import { shell } from "electron";
import {
  startDeviceCodeFlow,
  pollDeviceCodeFlow,
  MINIMAX_GLOBAL_FLOW,
  MINIMAX_CN_FLOW,
  type DeviceCodeSession,
} from "./oauth-device-flow.js";

// ─── Session state ────────────────────────────────────────────────────────────

type SimpleSession = {
  kind: "simple";
  provider: string;
  /** CSRF protection: must match state param in Protocol callback */
  state: string;
  startedAt: number;
};

type OAuthSession = DeviceCodeSession | SimpleSession;

const activeSessions = new Map<string, OAuthSession>();

// ─── Protocol callback state ──────────────────────────────────────────────────
//
// When index.ts receives openclaw://oauth/callback, it calls
// handleOAuthProtocolCallback which stores the result here.
// oauthPoll reads and clears the result on the next poll.

type OAuthCallbackResult = {
  ok: boolean;
  token?: string;
  error?: string;
};

const completedCallbacks = new Map<string, OAuthCallbackResult>();

// ─── Simple URL-open flow (non-Device-Code) ───────────────────────────────────

const SIMPLE_OAUTH_URLS: Record<string, string> = {
  "openai-codex":      "https://platform.openai.com",
  "google-gemini-cli": "https://aistudio.google.com",
  "qwen-portal":       "https://dashscope.aliyuncs.com",
  "github-copilot":    "https://github.com/login/device",
  chutes:              "https://chutes.ai",
};

const SIMPLE_AUTH_METHOD_TO_PROVIDER: Record<string, string> = {
  "openai-codex":      "openai",
  "google-gemini-cli": "google",
  "qwen-portal":       "qwen",
  "github-copilot":    "copilot",
  chutes:              "chutes",
};

// ─── Protocol callback handler ────────────────────────────────────────────────

/**
 * Called by index.ts when Electron receives an openclaw:// URL.
 * URL format: openclaw://oauth/callback?auth_method=xxx&code=yyy&state=zzz
 *             openclaw://oauth/callback?auth_method=xxx&error=access_denied
 *
 * Stores the result in completedCallbacks; oauthPoll reads it on next call.
 */
export function handleOAuthProtocolCallback(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    console.warn(`[onboarding-oauth] handleOAuthProtocolCallback: invalid URL "${url}"`);
    return;
  }

  // Only handle openclaw://oauth/callback
  if (parsed.hostname !== "oauth" || parsed.pathname !== "/callback") {
    console.warn(`[onboarding-oauth] handleOAuthProtocolCallback: unexpected path in "${url}"`);
    return;
  }

  const authMethod = parsed.searchParams.get("auth_method") ?? "";
  const code = parsed.searchParams.get("code");
  const error = parsed.searchParams.get("error");
  const stateParam = parsed.searchParams.get("state");

  if (!authMethod) {
    console.warn(`[onboarding-oauth] handleOAuthProtocolCallback: missing auth_method in "${url}"`);
    return;
  }

  const session = activeSessions.get(authMethod);
  if (!session || session.kind !== "simple") {
    console.warn(`[onboarding-oauth] handleOAuthProtocolCallback: no active simple session for "${authMethod}"`);
    return;
  }

  // CSRF check
  if (session.state && stateParam !== session.state) {
    console.error(`[onboarding-oauth] handleOAuthProtocolCallback: state mismatch for "${authMethod}" — possible CSRF`);
    completedCallbacks.set(authMethod, { ok: false, error: "OAuth state mismatch — possible CSRF" });
    activeSessions.delete(authMethod);
    return;
  }

  if (error) {
    console.warn(`[onboarding-oauth] handleOAuthProtocolCallback: error for "${authMethod}": ${error}`);
    completedCallbacks.set(authMethod, { ok: false, error: `OAuth error: ${error}` });
  } else if (code) {
    console.log(`[onboarding-oauth] handleOAuthProtocolCallback: got code for "${authMethod}"`);
    // For most Simple flows, the code IS the access token.
    // Providers that require a token exchange step should be promoted to Device Code Flow.
    completedCallbacks.set(authMethod, { ok: true, token: code });
  } else {
    completedCallbacks.set(authMethod, { ok: false, error: "OAuth callback missing code" });
  }

  activeSessions.delete(authMethod);
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function oauthStart(
  authMethod: string,
): Promise<{ ok: boolean; userCode?: string; verificationUri?: string; error?: string }> {
  // ── Device Code flows (via generic runner) ───────────────────────────────
  if (authMethod === "minimax-portal") {
    const result = await startDeviceCodeFlow(MINIMAX_GLOBAL_FLOW);
    if (result.ok && result.session) activeSessions.set(authMethod, result.session);
    return { ok: result.ok, userCode: result.userCode, verificationUri: result.verificationUri, error: result.error };
  }
  if (authMethod === "minimax-portal-cn") {
    const result = await startDeviceCodeFlow(MINIMAX_CN_FLOW);
    if (result.ok && result.session) activeSessions.set(authMethod, result.session);
    return { ok: result.ok, userCode: result.userCode, verificationUri: result.verificationUri, error: result.error };
  }

  // ── Simple URL-open flow ─────────────────────────────────────────────────
  const baseUrl = SIMPLE_OAUTH_URLS[authMethod];
  if (!baseUrl) {
    return { ok: false, error: `No OAuth URL configured for method "${authMethod}".` };
  }

  const provider = SIMPLE_AUTH_METHOD_TO_PROVIDER[authMethod] ?? authMethod;

  // Generate CSRF state token
  const { state } = generatePkce();

  // Build redirect_uri pointing back to this app via URL Scheme
  const callbackUrl = `openclaw://oauth/callback?auth_method=${encodeURIComponent(authMethod)}`;
  const separator = baseUrl.includes("?") ? "&" : "?";
  const fullUrl = `${baseUrl}${separator}redirect_uri=${encodeURIComponent(callbackUrl)}&state=${state}`;

  activeSessions.set(authMethod, { kind: "simple", provider, state, startedAt: Date.now() });

  try {
    await shell.openExternal(fullUrl);
    console.log(`[onboarding-oauth] Simple OAuth: opened "${fullUrl}" for ${authMethod}`);
    return { ok: true };
  } catch (err) {
    activeSessions.delete(authMethod);
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Failed to open browser: ${msg}` };
  }
}

export async function oauthPoll(
  authMethod: string,
): Promise<{ ok: boolean; token?: string; refresh?: string; expires?: number; error?: string }> {
  const session = activeSessions.get(authMethod);

  // ── Device Code flow (MiniMax and future providers) ──────────────────────
  if (session?.kind === "device-code") {
    const result = await pollDeviceCodeFlow(session);
    if (result.ok || (result.error !== "pending" && result.error !== undefined)) {
      // Terminal result (success or non-recoverable error): clear session
      activeSessions.delete(authMethod);
    }
    return result;
  }

  // ── Simple URL-open flow: check Protocol callback result ─────────────────
  if (session?.kind === "simple") {
    const elapsed = Date.now() - session.startedAt;
    if (elapsed > 5 * 60 * 1000) {
      activeSessions.delete(authMethod);
      completedCallbacks.delete(authMethod);
      return { ok: false, error: "timeout" };
    }

    const completed = completedCallbacks.get(authMethod);
    if (completed) {
      completedCallbacks.delete(authMethod);
      return completed;
    }

    return { ok: false, error: "pending" };
  }

  // ── No active session ────────────────────────────────────────────────────
  // Check if a Protocol callback arrived after the session was already cleared
  // (race condition: callback arrives just as session times out)
  const lateCallback = completedCallbacks.get(authMethod);
  if (lateCallback) {
    completedCallbacks.delete(authMethod);
    return lateCallback;
  }

  return { ok: false, error: "No active OAuth session for this method." };
}

export function clearOAuthSession(authMethod: string): void {
  activeSessions.delete(authMethod);
  completedCallbacks.delete(authMethod);
}
