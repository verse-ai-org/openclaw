/**
 * onboarding-oauth.ts
 *
 * OAuth flow support for the onboarding wizard.
 *
 * MiniMax (Global + CN): Full Device Code Flow with PKCE.
 *   1. oauthStart → calls /oauth/code, gets user_code + verification_uri, opens browser
 *   2. oauthPoll  → calls /oauth/token to poll for completion
 *
 * Other providers: Simple URL-open flow.
 *   1. oauthStart → shell.openExternal(url)
 *   2. oauthPoll  → reads auth-profiles.json for written token
 */

import { randomBytes, createHash } from "node:crypto";
import fsp from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { shell } from "electron";

// ─── MiniMax OAuth config ─────────────────────────────────────────────────────

const MINIMAX_OAUTH_CONFIG = {
  global: {
    baseUrl: "https://api.minimax.io",
    clientId: "78257093-7e40-4613-99e0-527b14b39113",
  },
  cn: {
    baseUrl: "https://api.minimaxi.com",
    clientId: "78257093-7e40-4613-99e0-527b14b39113",
  },
} as const;

const MINIMAX_OAUTH_SCOPE = "group_id profile model.completion";
const MINIMAX_OAUTH_GRANT_TYPE = "urn:ietf:params:oauth:grant-type:user_code";

// ─── PKCE helpers ─────────────────────────────────────────────────────────────

function generatePkce(): { verifier: string; challenge: string; state: string } {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const state = randomBytes(16).toString("base64url");
  return { verifier, challenge, state };
}

function toFormUrlEncoded(params: Record<string, string>): string {
  return Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
}

// ─── MiniMax Device Code session state ───────────────────────────────────────

type MinimaxSession = {
  kind: "minimax";
  region: "global" | "cn";
  userCode: string;
  verificationUri: string;
  verifier: string;
  expiredIn: number;       // unix timestamp ms
  pollIntervalMs: number;
  startedAt: number;
};

type SimpleSession = {
  kind: "simple";
  provider: string;
  startedAt: number;
};

type OAuthSession = MinimaxSession | SimpleSession;

const activeSessions = new Map<string, OAuthSession>();

// ─── Simple URL-open flow (non-MiniMax) ──────────────────────────────────────

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

function resolveAuthProfilesPath(): string {
  const override =
    process.env.OPENCLAW_AGENT_DIR?.trim() ??
    process.env.PI_CODING_AGENT_DIR?.trim();
  const agentDir =
    override ?? path.join(os.homedir(), ".openclaw", "agents", "main", "agent");
  return path.join(agentDir, "auth-profiles.json");
}

// ─── MiniMax Device Code Flow ─────────────────────────────────────────────────

async function startMinimaxOAuth(
  authMethod: string,
  region: "global" | "cn",
): Promise<{ ok: boolean; userCode?: string; verificationUri?: string; error?: string }> {
  const config = MINIMAX_OAUTH_CONFIG[region];
  const { verifier, challenge, state } = generatePkce();

  console.log(`[onboarding-oauth] MiniMax ${region}: requesting device code from ${config.baseUrl}/oauth/code`);

  let codeResp: Response;
  try {
    codeResp = await fetch(`${config.baseUrl}/oauth/code`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
        "x-request-id": randomBytes(16).toString("hex"),
      },
      body: toFormUrlEncoded({
        response_type: "code",
        client_id: config.clientId,
        scope: MINIMAX_OAUTH_SCOPE,
        code_challenge: challenge,
        code_challenge_method: "S256",
        state,
      }),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[onboarding-oauth] MiniMax ${region}: /oauth/code network error: ${msg}`);
    return { ok: false, error: `Network error: ${msg}` };
  }

  if (!codeResp.ok) {
    const text = await codeResp.text();
    console.error(`[onboarding-oauth] MiniMax ${region}: /oauth/code HTTP ${codeResp.status}: ${text}`);
    return { ok: false, error: `OAuth code request failed (HTTP ${codeResp.status}): ${text}` };
  }

  type CodePayload = {
    user_code?: string;
    verification_uri?: string;
    expired_in?: number;
    interval?: number;
    state?: string;
    error?: string;
  };
  const payload = await codeResp.json() as CodePayload;
  console.log(`[onboarding-oauth] MiniMax ${region}: /oauth/code response: ${JSON.stringify({ ...payload, state: "[redacted]" })}`);

  if (!payload.user_code || !payload.verification_uri) {
    return { ok: false, error: payload.error ?? "OAuth code response missing user_code or verification_uri" };
  }
  if (payload.state !== state) {
    return { ok: false, error: "OAuth state mismatch — possible CSRF" };
  }

  const session: MinimaxSession = {
    kind: "minimax",
    region,
    userCode: payload.user_code,
    verificationUri: payload.verification_uri,
    verifier,
    expiredIn: payload.expired_in ?? Date.now() + 5 * 60 * 1000,
    pollIntervalMs: (payload.interval ?? 2) * 1000,
    startedAt: Date.now(),
  };
  activeSessions.set(authMethod, session);

  console.log(`[onboarding-oauth] MiniMax ${region}: opening browser → ${payload.verification_uri}`);
  try {
    await shell.openExternal(payload.verification_uri);
  } catch (err) {
    console.warn(`[onboarding-oauth] MiniMax ${region}: shell.openExternal failed: ${String(err)}`);
  }

  return {
    ok: true,
    userCode: payload.user_code,
    verificationUri: payload.verification_uri,
  };
}

async function pollMinimaxOAuth(
  authMethod: string,
  session: MinimaxSession,
): Promise<{ ok: boolean; token?: string; error?: string }> {
  if (Date.now() > session.expiredIn) {
    activeSessions.delete(authMethod);
    return { ok: false, error: "timeout" };
  }

  const config = MINIMAX_OAUTH_CONFIG[session.region];

  let tokenResp: Response;
  try {
    tokenResp = await fetch(`${config.baseUrl}/oauth/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: toFormUrlEncoded({
        grant_type: MINIMAX_OAUTH_GRANT_TYPE,
        client_id: config.clientId,
        user_code: session.userCode,
        code_verifier: session.verifier,
      }),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[onboarding-oauth] MiniMax ${session.region}: /oauth/token network error: ${msg}`);
    return { ok: false, error: "pending" };
  }

  const text = await tokenResp.text();
  type TokenPayload = {
    status?: string;
    access_token?: string;
    refresh_token?: string;
    expired_in?: number;
    resource_url?: string;
    base_resp?: { status_code?: number; status_msg?: string };
  };
  let payload: TokenPayload | undefined;
  try { payload = JSON.parse(text) as TokenPayload; } catch { payload = undefined; }

  console.log(`[onboarding-oauth] MiniMax ${session.region}: /oauth/token status=${tokenResp.status} payload_status=${payload?.status ?? "unknown"}`);

  if (!tokenResp.ok) {
    const msg = payload?.base_resp?.status_msg ?? text ?? `HTTP ${tokenResp.status}`;
    return { ok: false, error: `OAuth token error: ${msg}` };
  }

  if (!payload) {
    return { ok: false, error: "pending" };
  }

  if (payload.status === "error") {
    return { ok: false, error: payload.base_resp?.status_msg ?? "MiniMax OAuth error" };
  }

  if (payload.status !== "success") {
    // still pending
    return { ok: false, error: "pending" };
  }

  if (!payload.access_token) {
    return { ok: false, error: "OAuth succeeded but no access_token in response" };
  }

  activeSessions.delete(authMethod);
  console.log(`[onboarding-oauth] MiniMax ${session.region}: OAuth complete, got access_token`);
  return { ok: true, token: payload.access_token, refresh: payload.refresh_token ?? undefined, expires: payload.expired_in ?? undefined };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function oauthStart(
  authMethod: string,
): Promise<{ ok: boolean; userCode?: string; verificationUri?: string; error?: string }> {
  // MiniMax Device Code flows
  if (authMethod === "minimax-portal") {
    return startMinimaxOAuth(authMethod, "global");
  }
  if (authMethod === "minimax-portal-cn") {
    return startMinimaxOAuth(authMethod, "cn");
  }

  // Simple URL-open flow
  const url = SIMPLE_OAUTH_URLS[authMethod];
  if (!url) {
    return { ok: false, error: `No OAuth URL configured for method "${authMethod}".` };
  }

  const provider = SIMPLE_AUTH_METHOD_TO_PROVIDER[authMethod] ?? authMethod;
  activeSessions.set(authMethod, { kind: "simple", provider, startedAt: Date.now() });

  try {
    await shell.openExternal(url);
    console.log(`[onboarding-oauth] Opened OAuth URL for ${authMethod}: ${url}`);
    return { ok: true };
  } catch (err) {
    activeSessions.delete(authMethod);
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Failed to open browser: ${msg}` };
  }
}

export async function oauthPoll(
  authMethod: string,
): Promise<{ ok: boolean; token?: string; error?: string }> {
  const session = activeSessions.get(authMethod);
  if (!session) {
    return { ok: false, error: "No active OAuth session for this method." };
  }

  // MiniMax: poll /oauth/token directly
  if (session.kind === "minimax") {
    return pollMinimaxOAuth(authMethod, session);
  }

  // Simple: check auth-profiles.json
  const elapsed = Date.now() - session.startedAt;
  if (elapsed > 5 * 60 * 1000) {
    activeSessions.delete(authMethod);
    return { ok: false, error: "timeout" };
  }

  const profileId = `${session.provider}:default`;
  const authPath = resolveAuthProfilesPath();

  try {
    const raw = await fsp.readFile(authPath, "utf8");
    const store = JSON.parse(raw) as {
      profiles?: Record<string, { type?: string; key?: string; token?: string }>;
    };
    const profile = store.profiles?.[profileId];
    if (profile) {
      const token = profile.key ?? profile.token ?? "";
      if (token.trim()) {
        activeSessions.delete(authMethod);
        console.log(`[onboarding-oauth] Token found for ${profileId}`);
        return { ok: true, token: token.trim() };
      }
    }
    return { ok: false, error: "pending" };
  } catch {
    return { ok: false, error: "pending" };
  }
}

export function clearOAuthSession(authMethod: string): void {
  activeSessions.delete(authMethod);
}
