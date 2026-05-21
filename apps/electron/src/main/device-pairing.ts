import { WebSocket } from "ws";
import {
  isAlreadyResolvedPairingError,
  isRetryableGatewayPairingError,
  listHasControlUiPending,
  pickControlUiPendingRequest,
  shouldTreatClearedPendingAsApproved,
  type PendingDeviceRequest,
} from "./device-pairing.helpers.js";
import { mainLogInfo, mainLogWarn } from "./logger.js";

const GATEWAY_PROTOCOL_VERSION = 4;
/** Loopback backend client — preserves declared scopes for shared-token auth. */
const LOCAL_PAIRING_CLIENT_ID = "gateway-client";
const LOCAL_PAIRING_CLIENT_MODE = "backend";
const LOCAL_PAIRING_OPERATOR_SCOPES = ["operator.admin", "operator.pairing"];

type GatewayFrame = {
  type?: string;
  event?: string;
  payload?: unknown;
  id?: string;
  ok?: boolean;
  result?: unknown;
  error?: { message?: string } | string;
};

type DevicePairListResult = {
  pending?: PendingDeviceRequest[];
};

type RpcRequest = (method: string, params?: unknown) => Promise<unknown>;

type ApproveAttemptResult =
  | { status: "approved" }
  | { status: "already-resolved" }
  | { status: "no-pending"; sawControlUiPending: boolean };

/** Serialize pairing approval — background poll and renderer IPC share one flight. */
let pairingApprovalFlight: Promise<boolean> | null = null;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runPairingApprovalFlight(run: () => Promise<boolean>): Promise<boolean> {
  if (pairingApprovalFlight) {
    return pairingApprovalFlight;
  }
  pairingApprovalFlight = run().finally(() => {
    pairingApprovalFlight = null;
  });
  return pairingApprovalFlight;
}

/**
 * Short-lived Gateway RPC session for operator pairing actions.
 * Uses token auth without device identity (same trust model as ipc-wizard).
 */
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
        ws.send(JSON.stringify({ type: "req", id, method, params }), (err) => {
          if (err) {
            pendingRequests.delete(id);
            reject(err);
          }
        });
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

    ws.on("message", (data: Buffer) => {
      try {
        const frame = JSON.parse(data.toString()) as GatewayFrame;

        if (frame.type === "event" && frame.event === "connect.challenge") {
          const connectId = String(++requestIdCounter);
          send({
            type: "req",
            id: connectId,
            method: "connect",
            params: {
              minProtocol: GATEWAY_PROTOCOL_VERSION,
              maxProtocol: GATEWAY_PROTOCOL_VERSION,
              client: {
                id: LOCAL_PAIRING_CLIENT_ID,
                version: "electron",
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

    ws.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });

    ws.on("close", () => {
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
    ws.on("open", () => {
      clearTimeout(timer);
      resolve();
    });
    ws.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });

  try {
    await handshakePromise;
    return await run(request);
  } finally {
    ws.close();
  }
}

async function approvePendingOnce(
  port: number,
  token: string,
  requestId?: string,
): Promise<ApproveAttemptResult> {
  try {
    return await withGatewayOperatorRpc(port, token, async (request) => {
      if (requestId?.trim()) {
        await request("device.pair.approve", { requestId: requestId.trim() });
        mainLogInfo(`[device-pairing] approved requestId=${requestId.trim()}`);
        return { status: "approved" };
      }
      const list = (await request("device.pair.list", {})) as DevicePairListResult;
      const pending = Array.isArray(list.pending) ? list.pending : [];
      const sawControlUiPending = listHasControlUiPending(pending);
      const target = pickControlUiPendingRequest(pending);
      if (!target?.requestId?.trim()) {
        return { status: "no-pending", sawControlUiPending };
      }
      await request("device.pair.approve", { requestId: target.requestId.trim() });
      mainLogInfo(
        `[device-pairing] approved requestId=${target.requestId} deviceId=${target.deviceId ?? "unknown"}`,
      );
      return { status: "approved" };
    });
  } catch (err) {
    if (isAlreadyResolvedPairingError(err)) {
      mainLogInfo("[device-pairing] pairing request already resolved");
      return { status: "already-resolved" };
    }
    throw err;
  }
}

async function approveWithRetries(params: {
  port: number;
  token: string;
  requestId?: string;
  timeoutMs: number;
  pollMs: number;
}): Promise<boolean> {
  const deadline = Date.now() + params.timeoutMs;
  let lastError: string | null = null;
  let sawControlUiPending = false;

  while (Date.now() < deadline) {
    try {
      const result = await approvePendingOnce(
        params.port,
        params.token,
        params.requestId,
      );
      if (result.status === "approved" || result.status === "already-resolved") {
        return true;
      }
      if (result.sawControlUiPending) {
        sawControlUiPending = true;
      }
      if (
        result.status === "no-pending" &&
        shouldTreatClearedPendingAsApproved({
          explicitRequestId: params.requestId,
          sawControlUiPending,
          currentHasControlUiPending: result.sawControlUiPending,
        })
      ) {
        mainLogInfo("[device-pairing] Control UI pending cleared (already approved)");
        return true;
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      if (isAlreadyResolvedPairingError(err)) {
        return true;
      }
      if (!isRetryableGatewayPairingError(err)) {
        mainLogWarn(`[device-pairing] auto-approve failed: ${lastError}`);
        return false;
      }
    }
    await sleep(params.pollMs);
  }

  if (lastError) {
    mainLogWarn(`[device-pairing] auto-approve gave up: ${lastError}`);
  } else if (sawControlUiPending) {
    mainLogInfo("[device-pairing] auto-approve finished after pending cleared");
    return true;
  } else {
    mainLogWarn("[device-pairing] auto-approve gave up: no pending Control UI request");
  }
  return sawControlUiPending;
}

/** Approve a specific pending device pairing request (from renderer close reason). */
export async function approveDevicePairingByRequestId(params: {
  port: number;
  token: string;
  requestId: string;
  timeoutMs?: number;
  pollMs?: number;
}): Promise<boolean> {
  return runPairingApprovalFlight(() =>
    approveWithRetries({
      port: params.port,
      token: params.token,
      requestId: params.requestId,
      timeoutMs: params.timeoutMs ?? 20_000,
      pollMs: params.pollMs ?? 500,
    }),
  );
}

/**
 * Poll for a pending Control UI device pairing request and approve it.
 * Reconnects across transient gateway-startup windows and waits for the
 * renderer to create the pending request after the main UI loads.
 */
export async function approvePendingControlUiDevicePairing(params: {
  port: number;
  token: string;
  timeoutMs?: number;
  pollMs?: number;
}): Promise<boolean> {
  return runPairingApprovalFlight(() =>
    approveWithRetries({
      port: params.port,
      token: params.token,
      timeoutMs: params.timeoutMs ?? 30_000,
      pollMs: params.pollMs ?? 500,
    }),
  );
}
