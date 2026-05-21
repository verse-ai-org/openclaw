import { PROTOCOL_VERSION } from "../src/gateway/protocol/version.js";

const LOCAL_PAIRING_CLIENT_ID = "gateway-client";
const LOCAL_PAIRING_CLIENT_MODE = "backend";
const LOCAL_PAIRING_OPERATOR_SCOPES = ["operator.admin", "operator.pairing"];

type GatewayFrame = {
  type?: string;
  event?: string;
  id?: string;
  ok?: boolean;
  result?: unknown;
  payload?: unknown;
  error?: { message?: string } | string;
};

type RpcRequest = (method: string, params?: unknown) => Promise<unknown>;

function isAlreadyResolvedPairingError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return msg.includes("unknown requestid");
}

async function withGatewayOperatorRpc<T>(
  port: number,
  token: string,
  run: (request: RpcRequest) => Promise<T>,
): Promise<T> {
  const url = `ws://127.0.0.1:${port}/`;
  const ws = new WebSocket(url);
  let requestIdCounter = 0;
  const pendingRequests = new Map<
    string,
    { resolve: (value: unknown) => void; reject: (err: Error) => void }
  >();
  let handshakeDone = false;
  const pendingAfterHandshake: Array<() => void> = [];
  let handshakeError: Error | null = null;

  const send = (obj: unknown) => {
    ws.send(JSON.stringify(obj));
  };

  const rejectAll = (err: Error) => {
    for (const [, pending] of pendingRequests) {
      pending.reject(err);
    }
    pendingRequests.clear();
  };

  const request: RpcRequest = (method, params) =>
    new Promise((resolve, reject) => {
      const doSend = () => {
        if (ws.readyState !== WebSocket.OPEN) {
          reject(new Error("Gateway WebSocket not connected"));
          return;
        }
        const id = String(++requestIdCounter);
        pendingRequests.set(id, { resolve, reject });
        ws.send(JSON.stringify({ type: "req", id, method, params }));
        setTimeout(() => {
          if (pendingRequests.has(id)) {
            pendingRequests.delete(id);
            reject(new Error(`Gateway RPC timeout: ${method}`));
          }
        }, 15_000);
      };

      if (handshakeDone) {
        doSend();
        return;
      }
      const timer = setTimeout(() => {
        const idx = pendingAfterHandshake.indexOf(sendAfterHandshake);
        if (idx !== -1) {
          pendingAfterHandshake.splice(idx, 1);
        }
        reject(new Error("Gateway handshake timeout"));
      }, 10_000);
      const sendAfterHandshake = () => {
        clearTimeout(timer);
        doSend();
      };
      pendingAfterHandshake.push(sendAfterHandshake);
    });

  const handshakePromise = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("Gateway operator handshake timeout"));
    }, 12_000);

    ws.addEventListener("message", (ev) => {
      try {
        const frame = JSON.parse(String(ev.data ?? "")) as GatewayFrame;

        if (frame.type === "event" && frame.event === "connect.challenge") {
          const connectId = String(++requestIdCounter);
          send({
            type: "req",
            id: connectId,
            method: "connect",
            params: {
              minProtocol: PROTOCOL_VERSION,
              maxProtocol: PROTOCOL_VERSION,
              client: {
                id: LOCAL_PAIRING_CLIENT_ID,
                version: "vite-dev",
                platform: process.platform,
                mode: LOCAL_PAIRING_CLIENT_MODE,
              },
              role: "operator",
              scopes: LOCAL_PAIRING_OPERATOR_SCOPES,
              auth: { token },
            },
          });
          pendingRequests.set(connectId, {
            resolve: () => {
              handshakeDone = true;
              clearTimeout(timer);
              resolve();
              for (const fn of pendingAfterHandshake) {
                fn();
              }
              pendingAfterHandshake.length = 0;
            },
            reject: (err) => {
              handshakeError = err;
              clearTimeout(timer);
              reject(err);
            },
          });
          return;
        }

        if (frame.type === "res" && frame.id) {
          const pending = pendingRequests.get(frame.id);
          if (!pending) {
            return;
          }
          pendingRequests.delete(frame.id);
          if (frame.ok === false || frame.error) {
            const errMsg =
              typeof frame.error === "string"
                ? frame.error
                : ((frame.error as { message?: string } | undefined)?.message ??
                  "Gateway RPC error");
            pending.reject(new Error(errMsg));
          } else {
            pending.resolve(frame.payload ?? frame.result ?? frame);
          }
        }
      } catch {
        // ignore malformed frames
      }
    });

    ws.addEventListener("error", () => {
      clearTimeout(timer);
      reject(new Error("Gateway WebSocket error"));
    });

    ws.addEventListener("close", () => {
      if (!handshakeDone) {
        clearTimeout(timer);
        reject(handshakeError ?? new Error("Gateway connection closed before handshake"));
      }
      rejectAll(new Error("Gateway connection closed"));
    });
  });

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("Gateway WebSocket connect timeout"));
    }, 10_000);
    ws.addEventListener("open", () => {
      clearTimeout(timer);
      resolve();
    });
    ws.addEventListener("error", () => {
      clearTimeout(timer);
      reject(new Error("Gateway WebSocket connect failed"));
    });
  });

  try {
    await handshakePromise;
    return await run(request);
  } finally {
    ws.close();
  }
}

/** Approve a Control UI pairing request without spawning the CLI (avoids CLI device pairing). */
export async function approveDevicePairingRequest(params: {
  port: number;
  token: string;
  requestId: string;
}): Promise<{ ok: boolean; error?: string }> {
  const requestId = params.requestId.trim();
  if (!requestId) {
    return { ok: false, error: "requestId required" };
  }
  try {
    await withGatewayOperatorRpc(params.port, params.token, async (request) => {
      await request("device.pair.approve", { requestId });
    });
    return { ok: true };
  } catch (err) {
    if (isAlreadyResolvedPairingError(err)) {
      return { ok: true };
    }
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
