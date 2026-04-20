import type { GatewayEventFrame, GatewayHelloOk, GatewayErrorInfo } from "@/types/gateway";
import {
  buildDevicePayload,
  loadOrCreateDeviceIdentity,
  signDevicePayload,
} from "./device-identity";

const CONNECT_FAILED_CLOSE_CODE = 4008;
const NON_RECOVERABLE_GATEWAY_ERROR_CODES = new Set([
  "AUTH_TOKEN_MISSING",
  "AUTH_PASSWORD_MISSING",
  "AUTH_PASSWORD_MISMATCH",
  "AUTH_RATE_LIMITED",
  "PAIRING_REQUIRED",
  "CONTROL_UI_DEVICE_IDENTITY_REQUIRED",
  "DEVICE_IDENTITY_REQUIRED",
]);

function generateId(): string {
  return crypto.randomUUID();
}

type Pending = {
  resolve: (value: unknown) => void;
  reject: (err: unknown) => void;
};

export type GatewayClientOptions = {
  url: string;
  token?: string;
  password?: string;
  onHello: (hello: GatewayHelloOk) => void;
  onEvent: (evt: GatewayEventFrame) => void;
  onClose: (info: { code: number; reason: string; error?: GatewayErrorInfo }) => void;
};

let _clientSerial = 0;

export class GatewayClient {
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
    console.log(
      `[gateway:${this.serial}] stop() — ws.readyState=${this.ws?.readyState ?? "null"}`,
    );
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
    console.log(
      `[gateway:${this.serial}] connect() opening WebSocket to ${this.opts.url}`,
    );
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

    console.log(
      `[gateway:${this.serial}] sendConnect() token=${this.opts.token ? `${this.opts.token.slice(0, 8)}...` : "(none)"} nonce=${this.connectNonce ?? "(none)"}`,
    );
    const role = "operator";
    const scopes = ["operator.admin", "operator.approvals", "operator.pairing"];

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
    const authToken = this.opts.token?.trim() || undefined;

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
    return isNonRecoverableGatewayErrorCode(error.code);
  }
}

export function isNonRecoverableGatewayErrorCode(code: string | undefined): boolean {
  return !!code && NON_RECOVERABLE_GATEWAY_ERROR_CODES.has(code);
}
