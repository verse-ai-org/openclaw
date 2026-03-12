import { useCallback, useEffect, useRef } from "react";
import { useGatewayStore } from "@/store/gateway.store";
import { useSettingsStore } from "@/store/settings.store";
import type { GatewayEventFrame, GatewayHelloOk, GatewayErrorInfo } from "@/types/gateway";

// ---------------------------------------------------------------------------
// Inline minimal GatewayBrowserClient
// This is a self-contained implementation that mirrors the behaviour of
// ui/src/ui/gateway.ts but has zero Lit/signal dependencies, making it
// safe to use in the React tree.
// ---------------------------------------------------------------------------

const CONNECT_FAILED_CLOSE_CODE = 4008;

function generateId(): string {
  return crypto.randomUUID();
}

type Pending = {
  resolve: (value: unknown) => void;
  reject: (err: unknown) => void;
};

type GatewayClientOptions = {
  url: string;
  token?: string;
  password?: string;
  onHello: (hello: GatewayHelloOk) => void;
  onEvent: (evt: GatewayEventFrame) => void;
  onClose: (info: { code: number; reason: string; error?: GatewayErrorInfo }) => void;
};

let _clientSerial = 0;

class GatewayClient {
  private ws: WebSocket | null = null;
  private pending = new Map<string, Pending>();
  private closed = false;
  private backoffMs = 800;
  private connectTimer: ReturnType<typeof setTimeout> | null = null;
  private connectSent = false;
  private connectNonce: string | null = null;
  private pendingConnectError: GatewayErrorInfo | undefined;
  readonly serial = ++_clientSerial;

  constructor(private opts: GatewayClientOptions) {
    console.log(`[gateway:${this.serial}] GatewayClient created, url=${opts.url}`);
  }

  start() {
    console.log(`[gateway:${this.serial}] start()`);
    this.closed = false;
    this.connect();
  }

  stop() {
    console.log(`[gateway:${this.serial}] stop() — ws.readyState=${this.ws?.readyState ?? "null"}`);
    this.closed = true;
    this.ws?.close();
    this.ws = null;
    this.flushPending(new Error("gateway client stopped"));
  }

  get connected() {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  request<T = unknown>(method: string, params?: unknown): Promise<T> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error("gateway not connected"));
    }
    const id = generateId();
    const frame = { type: "req", id, method, params };
    const p = new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: (v) => resolve(v as T), reject });
    });
    this.ws.send(JSON.stringify(frame));
    return p;
  }

  private connect() {
    if (this.closed) {
      console.log(`[gateway:${this.serial}] connect() skipped — already closed`);
      return;
    }
    console.log(`[gateway:${this.serial}] connect() opening WebSocket to ${this.opts.url}`);
    this.ws = new WebSocket(this.opts.url);
    this.ws.addEventListener("open", () => {
      console.log(`[gateway:${this.serial}] ws open`);
      this.queueConnect();
    });
    this.ws.addEventListener("message", (ev) => this.handleMessage(String(ev.data ?? "")));
    this.ws.addEventListener("close", (ev) => {
      const reason = String(ev.reason ?? "");
      console.log(
        `[gateway:${this.serial}] ws close code=${ev.code} reason=${reason || "(none)"} wasClean=${ev.wasClean}`,
      );
      const connectError = this.pendingConnectError;
      this.pendingConnectError = undefined;
      this.ws = null;
      this.flushPending(new Error(`gateway closed (${ev.code}): ${reason}`));
      this.opts.onClose({ code: ev.code, reason, error: connectError });
      if (!this.isNonRecoverable(connectError)) {
        this.scheduleReconnect();
      }
    });
    this.ws.addEventListener("error", (ev) => {
      console.log(`[gateway:${this.serial}] ws error`, ev);
    });
  }

  private queueConnect() {
    this.connectNonce = null;
    this.connectSent = false;
    if (this.connectTimer !== null) {
      clearTimeout(this.connectTimer);
    }
    this.connectTimer = setTimeout(() => void this.sendConnect(), 750);
  }

  private async sendConnect() {
    if (this.connectSent) {
      return;
    }
    this.connectSent = true;
    if (this.connectTimer !== null) {
      clearTimeout(this.connectTimer);
      this.connectTimer = null;
    }

    const role = "operator";
    const scopes = ["operator.admin", "operator.approvals", "operator.pairing"];

    // Device identity via Web Crypto (ECDSA) – same as original gateway.ts
    let device:
      | {
          id: string;
          publicKey: string;
          signature: string;
          signedAt: number;
          nonce: string;
        }
      | undefined;

    const isSecureContext = typeof crypto !== "undefined" && !!crypto.subtle;
    let authToken = this.opts.token?.trim() || undefined;

    if (isSecureContext) {
      try {
        const { deviceId, publicKey, privateKey } = await loadOrCreateDeviceIdentity();
        const signedAtMs = Date.now();
        const nonce = this.connectNonce ?? "";
        const payload = buildDevicePayload({
          deviceId,
          clientId: "openclaw-control-ui",
          clientMode: "webchat",
          signedAtMs,
          nonce,
          token: authToken ?? null,
          role,
          scopes,
        });
        const signature = await signDevicePayload(privateKey, payload);
        device = { id: deviceId, publicKey, signature, signedAt: signedAtMs, nonce };
      } catch {
        // Fallback to token-only auth
      }
    }

    const params = {
      minProtocol: 3,
      maxProtocol: 3,
      client: {
        id: "openclaw-control-ui",
        version: "control-ui-react",
        platform: navigator.platform ?? "web",
        mode: "webchat",
      },
      role,
      scopes,
      device,
      caps: ["tool-events"],
      auth:
        authToken || this.opts.password
          ? { token: authToken, password: this.opts.password }
          : undefined,
      userAgent: navigator.userAgent,
      locale: navigator.language,
    };

    void this.request<GatewayHelloOk>("connect", params)
      .then((hello) => {
        this.backoffMs = 800;
        this.opts.onHello(hello);
      })
      .catch((err: unknown) => {
        if (err instanceof Error) {
          this.pendingConnectError = {
            code: "CONNECT_FAILED",
            message: err.message,
          };
        }
        this.ws?.close(CONNECT_FAILED_CLOSE_CODE, "connect failed");
      });
  }

  private handleMessage(raw: string) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }

    const frame = parsed as { type?: unknown };

    if (frame.type === "event") {
      const evt = parsed as GatewayEventFrame;
      if (evt.event === "connect.challenge") {
        const payload = evt.payload as { nonce?: unknown } | undefined;
        const nonce = payload && typeof payload.nonce === "string" ? payload.nonce : null;
        if (nonce) {
          this.connectNonce = nonce;
          void this.sendConnect();
        }
        return;
      }
      try {
        this.opts.onEvent(evt);
      } catch (err) {
        console.error("[gateway] event handler error:", err);
      }
      return;
    }

    if (frame.type === "res") {
      const res = parsed as {
        id: string;
        ok: boolean;
        payload?: unknown;
        error?: { code: string; message: string; details?: unknown };
      };
      const p = this.pending.get(res.id);
      if (!p) {
        return;
      }
      this.pending.delete(res.id);
      if (res.ok) {
        p.resolve(res.payload);
      } else {
        const err = Object.assign(new Error(res.error?.message ?? "request failed"), {
          gatewayCode: res.error?.code ?? "UNAVAILABLE",
          details: res.error?.details,
        });
        p.reject(err);
      }
    }
  }

  private scheduleReconnect() {
    if (this.closed) {
      return;
    }
    const delay = this.backoffMs;
    this.backoffMs = Math.min(this.backoffMs * 1.7, 15_000);
    setTimeout(() => this.connect(), delay);
  }

  private flushPending(err: Error) {
    for (const [, p] of this.pending) {
      p.reject(err);
    }
    this.pending.clear();
  }

  private isNonRecoverable(error: GatewayErrorInfo | undefined): boolean {
    if (!error) {
      return false;
    }
    const nonRecoverable = new Set([
      "AUTH_TOKEN_MISSING",
      "AUTH_PASSWORD_MISSING",
      "AUTH_PASSWORD_MISMATCH",
      "AUTH_RATE_LIMITED",
      "PAIRING_REQUIRED",
      "CONTROL_UI_DEVICE_IDENTITY_REQUIRED",
      "DEVICE_IDENTITY_REQUIRED",
    ]);
    return nonRecoverable.has(error.code);
  }
}

// ---------------------------------------------------------------------------
// Device identity helpers (Ed25519, mirrors ui/src/ui/device-identity.ts)
// Uses @noble/ed25519 to stay consistent with the Lit UI and the server-side
// verifyDeviceSignature which expects raw Ed25519 public keys (32 bytes).
// deviceId = SHA-256(publicKey raw bytes).hex, same as deriveDeviceIdFromPublicKey
// on the server.
// ---------------------------------------------------------------------------
import { getPublicKeyAsync, signAsync, utils as ed25519utils } from "@noble/ed25519";

const DEVICE_STORAGE_KEY = "openclaw-device-identity-v1";

type StoredDeviceIdentity = {
  version: 1;
  deviceId: string;
  publicKey: string; // base64url raw 32-byte Ed25519 public key
  privateKey: string; // base64url raw 32-byte Ed25519 private key
  createdAtMs: number;
};

function b64urlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) {
    binary += String.fromCharCode(b);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function b64urlDecode(input: string): Uint8Array {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

async function fingerprintEd25519PublicKey(publicKey: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", publicKey.slice().buffer);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function loadOrCreateDeviceIdentity(): Promise<{
  deviceId: string;
  publicKey: string;
  privateKey: string;
}> {
  try {
    const raw = localStorage.getItem(DEVICE_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as StoredDeviceIdentity;
      if (
        parsed?.version === 1 &&
        typeof parsed.deviceId === "string" &&
        typeof parsed.publicKey === "string" &&
        typeof parsed.privateKey === "string"
      ) {
        // Re-derive deviceId from public key bytes to heal any stale stored value.
        const derivedId = await fingerprintEd25519PublicKey(b64urlDecode(parsed.publicKey));
        if (derivedId !== parsed.deviceId) {
          const updated: StoredDeviceIdentity = { ...parsed, deviceId: derivedId };
          localStorage.setItem(DEVICE_STORAGE_KEY, JSON.stringify(updated));
          return {
            deviceId: derivedId,
            publicKey: parsed.publicKey,
            privateKey: parsed.privateKey,
          };
        }
        return {
          deviceId: parsed.deviceId,
          publicKey: parsed.publicKey,
          privateKey: parsed.privateKey,
        };
      }
    }
  } catch {
    // fall through to regenerate
  }

  // Generate a new Ed25519 key pair.
  const privateKeyBytes = ed25519utils.randomSecretKey();
  const publicKeyBytes = await getPublicKeyAsync(privateKeyBytes);
  const deviceId = await fingerprintEd25519PublicKey(publicKeyBytes);
  const identity = {
    deviceId,
    publicKey: b64urlEncode(publicKeyBytes),
    privateKey: b64urlEncode(privateKeyBytes),
  };
  const stored: StoredDeviceIdentity = {
    version: 1,
    ...identity,
    createdAtMs: Date.now(),
  };
  localStorage.setItem(DEVICE_STORAGE_KEY, JSON.stringify(stored));
  return identity;
}

function buildDevicePayload(opts: {
  deviceId: string;
  clientId: string;
  clientMode: string;
  signedAtMs: number;
  nonce: string;
  token: string | null;
  role: string;
  scopes: string[];
}): string {
  // Must match buildDeviceAuthPayload in src/gateway/device-auth.ts (v2 pipe format).
  const scopes = opts.scopes.join(",");
  const token = opts.token ?? "";
  return [
    "v2",
    opts.deviceId,
    opts.clientId,
    opts.clientMode,
    opts.role,
    scopes,
    String(opts.signedAtMs),
    token,
    opts.nonce,
  ].join("|");
}

async function signDevicePayload(privateKeyBase64Url: string, payload: string): Promise<string> {
  const key = b64urlDecode(privateKeyBase64Url);
  const data = new TextEncoder().encode(payload);
  const sig = await signAsync(data, key);
  return b64urlEncode(sig);
}

// ---------------------------------------------------------------------------
// React Hook
// ---------------------------------------------------------------------------
export function useGateway() {
  const settings = useSettingsStore((s) => s.settings);
  const password = useSettingsStore((s) => s.password);
  const { setClient, setConnecting, setConnected, setDisconnected, handleEvent } =
    useGatewayStore();

  // Keep latest refs so callbacks don't go stale
  const storeRef = useRef({ setConnected, setDisconnected, handleEvent });
  storeRef.current = { setConnected, setDisconnected, handleEvent };

  // Keep settings in a ref so connect() can read the latest values without
  // being listed as a useCallback dependency — avoids reconnect storms when
  // Zustand action references change on every render.
  const settingsRef = useRef({ gatewayUrl: settings.gatewayUrl, token: settings.token, password });
  settingsRef.current = { gatewayUrl: settings.gatewayUrl, token: settings.token, password };

  const clientRef = useRef<GatewayClient | null>(null);

  // Stable refs for store actions so connect() doesn't need them as deps.
  const setClientRef = useRef(setClient);
  const setConnectingRef = useRef(setConnecting);
  setClientRef.current = setClient;
  setConnectingRef.current = setConnecting;

  const connect = useCallback(() => {
    console.log(
      "[gateway] connect() called | prev client serial=",
      (clientRef.current as (GatewayClient & { serial?: number }) | null)?.serial ?? "none",
    );
    setConnectingRef.current();

    const { gatewayUrl, token, password: pw } = settingsRef.current;
    const client = new GatewayClient({
      url: gatewayUrl,
      token: token || undefined,
      password: pw || undefined,
      onHello: (hello) => {
        console.log("[gateway] hello-ok", hello.server?.version);
        storeRef.current.setConnected(hello);
      },
      onClose: (info) => {
        console.log("[gateway] closed", info.code, info.reason, info.error?.code);
        storeRef.current.setDisconnected(info);
      },
      onEvent: (evt) => storeRef.current.handleEvent(evt),
    });

    clientRef.current = client;
    setClientRef.current({
      start: () => client.start(),
      stop: () => client.stop(),
      get connected() {
        return client.connected;
      },
      request: (method, params) => client.request(method, params),
    });
    client.start();
  }, []); // stable — all live values are read via refs

  // Reconnect when the gateway URL or token actually changes.
  const gatewayUrl = settings.gatewayUrl;
  const token = settings.token;
  useEffect(() => {
    connect();
    return () => {
      clientRef.current?.stop();
      clientRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gatewayUrl, token]);

  return { connect };
}
