/**
 * Invite code API client utilities (browser / renderer environment).
 * Uses Web Crypto API for HMAC-SHA256 signing — no Node.js dependencies.
 *
 * API spec: docs/features/invite-code-api-design.md
 */

// ─── Config ───────────────────────────────────────────────────────────────────

export interface InviteCodeClientConfig {
  baseUrl: string;
  appId: string;
  appSecret: string;
  appVersion?: string;
}

// Dev uses localhost:8080; prod uses Railway deployment.
// The Vite build injects VITE_INVITE_CODE_API_BASE_URL at compile time.
const PROD_BASE_URL =
  "https://verse-ai-service-production-22b8.up.railway.app/api/v1";

export function getInviteCodeConfig(): InviteCodeClientConfig {
  // Vite exposes import.meta.env at compile time; access via string index to satisfy TS.
  const metaEnv =
    (import.meta as unknown as { env?: Record<string, string> }).env ?? {};
  const envBase = metaEnv.VITE_INVITE_CODE_API_BASE_URL ?? "";
  const isDev = metaEnv.DEV === "true";

  return {
    baseUrl: envBase || (isDev ? "http://localhost:8080" : PROD_BASE_URL),
    appId: "boss-simulator",
    appSecret: "boss-simulator-dev-secret-change-in-prod",
    appVersion: "1.0.0",
  };
}

// ─── Invite code format ───────────────────────────────────────────────────────

/** Strict format check: BOSS-XXXX-XXXX (4 alphanumeric chars per segment). */
export function isValidInviteCodeFormat(code: string): boolean {
  return /^BOSS-[A-Z0-9]{4}-[A-Z0-9]{4}$/i.test(code.trim());
}

// ─── HMAC-SHA256 signing (Web Crypto API) ─────────────────────────────────────

/**
 * Generate HMAC-SHA256 signature using the browser's Web Crypto API.
 * Sign payload: app_id={appId}&timestamp={timestamp}&nonce={nonce}&code={code}
 */
export async function generateInviteSignature(
  appSecret: string,
  appId: string,
  timestamp: string,
  nonce: string,
  code: string,
): Promise<string> {
  const signPayload = `app_id=${appId}&timestamp=${timestamp}&nonce=${nonce}&code=${code}`;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(signPayload),
  );
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Generate a random 12-char hex nonce. */
export function generateInviteNonce(length = 12): string {
  const arr = new Uint8Array(length);
  crypto.getRandomValues(arr);
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, length);
}

// ─── API call ─────────────────────────────────────────────────────────────────

export interface InviteCodeResult {
  ok: boolean;
  apiKey?: string;
  model?: string;
  error?: string;
}

/**
 * Validate an invite code against the backend.
 * Adds HMAC-SHA256 signed headers per the API spec.
 * Response shape: { code: number, message: string, data?: { llm_api_key, llm_base_url, ... } }
 */
export async function redeemInviteCode(
  code: string,
  config?: InviteCodeClientConfig,
): Promise<InviteCodeResult> {
  const cfg = config ?? getInviteCodeConfig();
  const trimmed = code.trim().toUpperCase();

  if (!trimmed) {
    return { ok: false, error: "Invite code cannot be empty." };
  }
  if (!isValidInviteCodeFormat(trimmed)) {
    return {
      ok: false,
      error: "Invalid invite code format. Expected: BOSS-XXXX-XXXX",
    };
  }

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = generateInviteNonce(12);
  // IMPORTANT: The backend reads `code` from query param (request.getParameter("code")),
  // not from the JSON body. For a JSON POST, that value is always empty string.
  // Sign with empty code to match what the backend actually sees.
  const signature = await generateInviteSignature(
    cfg.appSecret,
    cfg.appId,
    timestamp,
    nonce,
    "", // empty — backend reads code from query param, not JSON body
  );

  const url = `${cfg.baseUrl.replace(/\/$/, "")}/app/member/invite-code/redeem`;
  console.log("[invite-code] redeem url=", url);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-App-Id": cfg.appId,
        "X-Timestamp": timestamp,
        "X-Nonce": nonce,
        "X-Signature": signature,
        ...(cfg.appVersion ? { "X-App-Version": cfg.appVersion } : {}),
      },
      body: JSON.stringify({ code: trimmed }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      console.warn(
        `[invite-code] HTTP ${response.status} — ${text.slice(0, 200)}`,
      );
      if (response.status === 404 || response.status === 410) {
        return { ok: false, error: "Invite code not found or already used." };
      }
      if (response.status === 429) {
        return {
          ok: false,
          error: "Too many attempts. Please try again later.",
        };
      }
      return {
        ok: false,
        error: `Validation failed (HTTP ${response.status}).`,
      };
    }

    // Response: { code: number, msg: string, data?: { llm_api_key, llm_model, ... } }
    // Note: backend uses "msg" field (not "message").
    const body = (await response.json()) as Record<string, unknown>;
    console.log("[invite-code] response=", JSON.stringify(body).slice(0, 200));

    if (typeof body.code === "number" && body.code !== 200) {
      const msg =
        typeof body.msg === "string"
          ? body.msg
          : typeof body.message === "string"
            ? body.message
            : "Validation failed.";
      return { ok: false, error: msg };
    }

    const data = (body.data ?? {}) as Record<string, unknown>;
    const apiKey =
      typeof data.llm_api_key === "string"
        ? data.llm_api_key
        : typeof data.apiKey === "string"
          ? data.apiKey
          : typeof data.api_key === "string"
            ? data.api_key
            : undefined;
    const model =
      typeof data.model === "string"
        ? data.model
        : typeof data.llm_model === "string"
          ? data.llm_model
          : undefined;

    if (!apiKey) {
      return {
        ok: false,
        error: "Invalid response from server: missing API key.",
      };
    }

    return { ok: true, apiKey, model: model ?? "anthropic/claude-opus-4-5" };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return { ok: false, error: "Connection timed out. Check your network." };
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[invite-code] network error —", msg);
    return { ok: false, error: `Network error: ${msg}` };
  }
}
