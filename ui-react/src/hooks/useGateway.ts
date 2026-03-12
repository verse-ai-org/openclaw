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

class GatewayClient {
  private ws: WebSocket | null = null;
  private pending = new Map<string, Pending>();
  private closed = false;
  private backoffMs = 800;
  private connectTimer: ReturnType<typeof setTimeout> | null = null;
  private connectSent = false;
  private connectNonce: string | null = null;
  private pendingConnectError: GatewayErrorInfo | undefined;

  constructor(private opts: GatewayClientOptions) {}

  start() {
    this.closed = false;
    this.connect();
  }

  stop() {
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
      return;
    }
    this.ws = new WebSocket(this.opts.url);
    this.ws.addEventListener("open", () => this.queueConnect());
    this.ws.addEventListener("message", (ev) => this.handleMessage(String(ev.data ?? "")));
    this.ws.addEventListener("close", (ev) => {
      const reason = String(ev.reason ?? "");
      const connectError = this.pendingConnectError;
      this.pendingConnectError = undefined;
      this.ws = null;
      this.flushPending(new Error(`gateway closed (${ev.code}): ${reason}`));
      this.opts.onClose({ code: ev.code, reason, error: connectError });
      if (!this.isNonRecoverable(connectError)) {
        this.scheduleReconnect();
      }
    });
    this.ws.addEventListener("error", () => {
      // close handler fires after error
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
          signedAtMs,
          nonce,
          token: authToken ?? null,
          role,
          scopes,
        });
        const signature = await signPayload(privateKey, payload);
        device = { id: deviceId, publicKey, signature, signedAt: signedAtMs, nonce };
      } catch {
        // Fallback to token-only auth
      }
    }

    const params = {
      minProtocol: 3,
      maxProtocol: 3,
      client: {
        id: "openclaw-control-ui-react",
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
// Device identity helpers (ECDSA P-256, mirrors device-identity.ts)
// ---------------------------------------------------------------------------
const DEVICE_ID_KEY = "openclaw.device.id.v1";
const DEVICE_KEY_KEY = "openclaw.device.key.v1";

async function loadOrCreateDeviceIdentity() {
  let deviceId = localStorage.getItem(DEVICE_ID_KEY);
  const storedKey = localStorage.getItem(DEVICE_KEY_KEY);

  if (deviceId && storedKey) {
    try {
      const keyData = JSON.parse(storedKey) as JsonWebKey;
      const privateKey = await crypto.subtle.importKey(
        "jwk",
        keyData,
        { name: "ECDSA", namedCurve: "P-256" },
        false,
        ["sign"],
      );
      // Derive public key from JWK (omit 'd' field)
      const { d: _d, ...pubJwk } = keyData;
      const publicKeyObj = await crypto.subtle.importKey(
        "jwk",
        pubJwk,
        { name: "ECDSA", namedCurve: "P-256" },
        true,
        ["verify"],
      );
      const exported = await crypto.subtle.exportKey("spki", publicKeyObj);
      const publicKey = btoa(String.fromCharCode(...new Uint8Array(exported)));
      return { deviceId, publicKey, privateKey };
    } catch {
      // Fall through to generate new key
    }
  }

  // Generate new key pair
  const keyPair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
    "sign",
    "verify",
  ]);
  deviceId = crypto.randomUUID();
  const jwk = await crypto.subtle.exportKey("jwk", keyPair.privateKey);
  localStorage.setItem(DEVICE_ID_KEY, deviceId);
  localStorage.setItem(DEVICE_KEY_KEY, JSON.stringify(jwk));

  const exported = await crypto.subtle.exportKey("spki", keyPair.publicKey);
  const publicKey = btoa(String.fromCharCode(...new Uint8Array(exported)));
  return { deviceId, publicKey, privateKey: keyPair.privateKey };
}

function buildDevicePayload(opts: {
  deviceId: string;
  signedAtMs: number;
  nonce: string;
  token: string | null;
  role: string;
  scopes: string[];
}): string {
  return JSON.stringify({
    deviceId: opts.deviceId,
    signedAtMs: opts.signedAtMs,
    nonce: opts.nonce,
    token: opts.token,
    role: opts.role,
    scopes: opts.scopes,
  });
}

async function signPayload(privateKey: CryptoKey, payload: string): Promise<string> {
  const encoded = new TextEncoder().encode(payload);
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: { name: "SHA-256" } },
    privateKey,
    encoded,
  );
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
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

  const clientRef = useRef<GatewayClient | null>(null);

  const connect = useCallback(() => {
    clientRef.current?.stop();
    setConnecting();

    const client = new GatewayClient({
      url: settings.gatewayUrl,
      token: settings.token || undefined,
      password: password || undefined,
      onHello: (hello) => storeRef.current.setConnected(hello),
      onClose: (info) => storeRef.current.setDisconnected(info),
      onEvent: (evt) => storeRef.current.handleEvent(evt),
    });

    clientRef.current = client;
    // Expose request method via store so components can call gateway methods
    setClient({
      start: () => client.start(),
      stop: () => client.stop(),
      get connected() {
        return client.connected;
      },
      request: (method, params) => client.request(method, params),
    });
    client.start();
  }, [settings.gatewayUrl, settings.token, password, setConnecting, setClient]);

  // Auto-connect on mount and when URL/token changes
  useEffect(() => {
    connect();
    return () => {
      clientRef.current?.stop();
      clientRef.current = null;
    };
  }, [connect]);

  return { connect };
}
