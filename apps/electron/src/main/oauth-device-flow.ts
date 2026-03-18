/**
 * oauth-device-flow.ts
 *
 * Generic Device Code Flow (RFC 8628) runner.
 * Vendor-specific logic lives entirely in DeviceCodeFlowConfig objects —
 * this module contains no provider-specific strings or conditions.
 *
 * Usage:
 *   import { startDeviceCodeFlow, pollDeviceCodeFlow, MINIMAX_GLOBAL_FLOW } from "./oauth-device-flow.js";
 *   const { ok, session, userCode, verificationUri } = await startDeviceCodeFlow(MINIMAX_GLOBAL_FLOW);
 *   const result = await pollDeviceCodeFlow(session!);
 */

import { generatePkce, toFormUrlEncoded } from "./oauth-utils.js";
import { randomBytes } from "node:crypto";
import { shell } from "electron";

// ─── Public interface ─────────────────────────────────────────────────────────

export interface DeviceCodeFlowConfig {
  /** Human-readable name for logging */
  name: string;
  /** POST endpoint that returns user_code + verification_uri */
  codeEndpoint: string;
  /** POST endpoint to poll for access token */
  tokenEndpoint: string;
  clientId: string;
  scope: string;
  /** grant_type sent to tokenEndpoint */
  grantType: string;
  /** Whether to generate a PKCE verifier/challenge for the code request */
  usePKCE: boolean;
  /**
   * Parse the raw JSON response from codeEndpoint.
   * Throw with a descriptive message on unexpected shape.
   * expiredIn must be an absolute unix timestamp in ms (Date.now() + ttl).
   */
  parseCodeResponse(raw: unknown): {
    userCode: string;
    verificationUri: string;
    expiredIn: number;
    intervalMs: number;
    state?: string;
  };
  /**
   * Parse the raw JSON response from tokenEndpoint.
   * Return status="pending" while authorization is still in progress.
   */
  parseTokenResponse(raw: unknown): {
    status: "pending" | "success" | "error";
    accessToken?: string;
    refreshToken?: string;
    expiresIn?: number;
    errorMessage?: string;
  };
  /** Optional extra headers for the code request (e.g. x-request-id) */
  extraCodeHeaders?: () => Record<string, string>;
}

/** Session state produced by startDeviceCodeFlow and consumed by pollDeviceCodeFlow */
export type DeviceCodeSession = {
  kind: "device-code";
  config: DeviceCodeFlowConfig;
  userCode: string;
  verificationUri: string;
  /** PKCE verifier; empty string when usePKCE=false */
  verifier: string;
  /** CSRF state sent in code request; used to validate server echo */
  sentState: string;
  expiredIn: number;
  pollIntervalMs: number;
  startedAt: number;
};

export type StartDeviceCodeResult = {
  ok: boolean;
  session?: DeviceCodeSession;
  userCode?: string;
  verificationUri?: string;
  error?: string;
};

export type PollDeviceCodeResult = {
  ok: boolean;
  token?: string;
  refresh?: string;
  expires?: number;
  /** "pending" = still waiting; "timeout" = expired; other = terminal error */
  error?: string;
};

// ─── Generic runner ───────────────────────────────────────────────────────────

/**
 * Start a Device Code Flow.
 * Calls codeEndpoint, parses the response, opens the browser, and returns
 * the session state needed for subsequent pollDeviceCodeFlow calls.
 */
export async function startDeviceCodeFlow(
  config: DeviceCodeFlowConfig,
): Promise<StartDeviceCodeResult> {
  const { verifier, challenge, state } = config.usePKCE
    ? generatePkce()
    : { verifier: "", challenge: "", state: "" };

  const codeBody: Record<string, string> = {
    response_type: "code",
    client_id: config.clientId,
    scope: config.scope,
  };
  if (config.usePKCE) {
    codeBody["code_challenge"] = challenge;
    codeBody["code_challenge_method"] = "S256";
    // state is required by many providers for CSRF protection
    codeBody["state"] = state;
  }

  const extraHeaders = config.extraCodeHeaders?.() ?? {};

  console.log(`[oauth-device-flow] ${config.name}: requesting device code from ${config.codeEndpoint}`);

  let codeResp: Response;
  try {
    codeResp = await fetch(config.codeEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
        ...extraHeaders,
      },
      body: toFormUrlEncoded(codeBody),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[oauth-device-flow] ${config.name}: /code network error: ${msg}`);
    return { ok: false, error: `Network error: ${msg}` };
  }

  if (!codeResp.ok) {
    const text = await codeResp.text();
    console.error(`[oauth-device-flow] ${config.name}: /code HTTP ${codeResp.status}: ${text}`);
    return { ok: false, error: `Device code request failed (HTTP ${codeResp.status}): ${text}` };
  }

  let parsed: ReturnType<DeviceCodeFlowConfig["parseCodeResponse"]>;
  try {
    const raw = await codeResp.json() as unknown;
    parsed = config.parseCodeResponse(raw);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[oauth-device-flow] ${config.name}: /code parse error: ${msg}`);
    return { ok: false, error: msg };
  }

  // Validate state echo if provider sends it back
  if (config.usePKCE && state && parsed.state && parsed.state !== state) {
    console.error(`[oauth-device-flow] ${config.name}: state mismatch in /code response`);
    return { ok: false, error: "OAuth state mismatch in device code response" };
  }

  console.log(`[oauth-device-flow] ${config.name}: got user_code=${parsed.userCode}, opening browser → ${parsed.verificationUri}`);
  try {
    await shell.openExternal(parsed.verificationUri);
  } catch (err) {
    console.warn(`[oauth-device-flow] ${config.name}: shell.openExternal failed: ${String(err)}`);
    // Non-fatal: user can copy the URL manually
  }

  const session: DeviceCodeSession = {
    kind: "device-code",
    config,
    userCode: parsed.userCode,
    verificationUri: parsed.verificationUri,
    verifier,
    sentState: state,
    expiredIn: parsed.expiredIn,
    pollIntervalMs: parsed.intervalMs,
    startedAt: Date.now(),
  };

  return { ok: true, session, userCode: parsed.userCode, verificationUri: parsed.verificationUri };
}

/**
 * Poll the tokenEndpoint to check if the user has completed authorization.
 * Returns { ok: false, error: "pending" } while still waiting.
 * Returns { ok: false, error: "timeout" } when the device code has expired.
 * Returns { ok: true, token } on success.
 */
export async function pollDeviceCodeFlow(
  session: DeviceCodeSession,
): Promise<PollDeviceCodeResult> {
  const { config } = session;

  if (Date.now() > session.expiredIn) {
    return { ok: false, error: "timeout" };
  }

  const tokenBody: Record<string, string> = {
    grant_type: config.grantType,
    client_id: config.clientId,
    user_code: session.userCode,
  };
  if (config.usePKCE && session.verifier) {
    tokenBody["code_verifier"] = session.verifier;
  }

  let tokenResp: Response;
  try {
    tokenResp = await fetch(config.tokenEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: toFormUrlEncoded(tokenBody),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[oauth-device-flow] ${config.name}: /token network error: ${msg}`);
    return { ok: false, error: "pending" };
  }

  let raw: unknown;
  try {
    raw = await tokenResp.json();
  } catch {
    raw = {};
  }

  let result: ReturnType<DeviceCodeFlowConfig["parseTokenResponse"]>;
  try {
    result = config.parseTokenResponse(raw);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[oauth-device-flow] ${config.name}: /token parse error: ${msg}`);
    return { ok: false, error: "pending" };
  }

  console.log(`[oauth-device-flow] ${config.name}: /token status=${result.status}`);

  if (result.status === "success" && result.accessToken) {
    return {
      ok: true,
      token: result.accessToken,
      refresh: result.refreshToken,
      expires: result.expiresIn !== undefined
        ? Date.now() + result.expiresIn * 1000
        : undefined,
    };
  }

  if (result.status === "error") {
    return { ok: false, error: result.errorMessage ?? "Device Code Flow error" };
  }

  return { ok: false, error: "pending" };
}

// ─── Provider configurations ──────────────────────────────────────────────────

/**
 * MiniMax Global (api.minimax.io) — Device Code Flow with PKCE.
 * Migrated from startMinimaxOAuth/pollMinimaxOAuth in onboarding-oauth.ts.
 */
export const MINIMAX_GLOBAL_FLOW: DeviceCodeFlowConfig = {
  name: "MiniMax Global",
  codeEndpoint: "https://api.minimax.io/oauth/code",
  tokenEndpoint: "https://api.minimax.io/oauth/token",
  clientId: "78257093-7e40-4613-99e0-527b14b39113",
  scope: "group_id profile model.completion",
  grantType: "urn:ietf:params:oauth:grant-type:user_code",
  usePKCE: true,
  extraCodeHeaders: () => ({ "x-request-id": randomBytes(16).toString("hex") }),
  parseCodeResponse(raw) {
    const p = raw as {
      user_code?: string;
      verification_uri?: string;
      expired_in?: number;
      interval?: number;
      state?: string;
      error?: string;
    };
    if (!p.user_code || !p.verification_uri) {
      throw new Error(p.error ?? "MiniMax /code: missing user_code or verification_uri");
    }
    return {
      userCode: p.user_code,
      verificationUri: p.verification_uri,
      // MiniMax expired_in is seconds-from-now (not unix timestamp)
      expiredIn: Date.now() + (p.expired_in ?? 300) * 1000,
      intervalMs: (p.interval ?? 2) * 1000,
      // Return state so runner can validate echo
      state: p.state,
    };
  },
  parseTokenResponse(raw) {
    const p = raw as {
      status?: string;
      access_token?: string;
      refresh_token?: string;
      expired_in?: number;
      base_resp?: { status_code?: number; status_msg?: string };
    };
    if (p.status === "success" && p.access_token) {
      return {
        status: "success",
        accessToken: p.access_token,
        refreshToken: p.refresh_token,
        expiresIn: p.expired_in,
      };
    }
    if (p.status === "error") {
      return { status: "error", errorMessage: p.base_resp?.status_msg ?? "MiniMax OAuth error" };
    }
    return { status: "pending" };
  },
};

/**
 * MiniMax CN (api.minimaxi.com) — same flow, different endpoints.
 */
export const MINIMAX_CN_FLOW: DeviceCodeFlowConfig = {
  ...MINIMAX_GLOBAL_FLOW,
  name: "MiniMax CN",
  codeEndpoint: "https://api.minimaxi.com/oauth/code",
  tokenEndpoint: "https://api.minimaxi.com/oauth/token",
};
