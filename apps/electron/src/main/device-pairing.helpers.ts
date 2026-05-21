export const CONTROL_UI_CLIENT_ID = "openclaw-control-ui";

export type PendingDeviceRequest = {
  requestId: string;
  deviceId?: string;
  clientId?: string | null;
  clientMode?: string | null;
};

export function isRetryableGatewayPairingError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    msg.includes("gateway starting") ||
    msg.includes("retry shortly") ||
    msg.includes("handshake timeout") ||
    msg.includes("websocket connect timeout") ||
    msg.includes("websocket not connected") ||
    msg.includes("connection closed") ||
    msg.includes("connect timeout")
  );
}

export function isAlreadyResolvedPairingError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return msg.includes("unknown requestid");
}

export function pickControlUiPendingRequest(
  pending: PendingDeviceRequest[],
): PendingDeviceRequest | null {
  const controlUi = pending.filter(
    (entry) => entry.clientId?.trim() === CONTROL_UI_CLIENT_ID,
  );
  if (controlUi.length > 0) {
    return controlUi[controlUi.length - 1] ?? null;
  }
  return pending.length > 0 ? (pending[pending.length - 1] ?? null) : null;
}

export function listHasControlUiPending(pending: PendingDeviceRequest[]): boolean {
  return pending.some((entry) => entry.clientId?.trim() === CONTROL_UI_CLIENT_ID);
}

export type ApprovePollProgress = {
  sawControlUiPending: boolean;
};

/** Returns true when polling mode can stop after pending was observed then cleared. */
export function shouldTreatClearedPendingAsApproved(params: {
  explicitRequestId?: string;
  sawControlUiPending: boolean;
  currentHasControlUiPending: boolean;
}): boolean {
  return (
    !params.explicitRequestId?.trim() &&
    params.sawControlUiPending &&
    !params.currentHasControlUiPending
  );
}
