import type { ChildProcess } from "node:child_process";
import { DEFAULT_GATEWAY_PORT } from "./constants.js";

/** Mutable gateway session state (CJS-safe single object). */
export const gatewayRuntime = {
  intentionalStop: false,
  gatewayProcess: null as ChildProcess | null,
  gatewayToken: "",
  activePort: DEFAULT_GATEWAY_PORT,
  reusingExternalGateway: false,
};

let gatewayCrashCallback:
  | ((code: number | null, signal: NodeJS.Signals | null) => void)
  | null = null;

export function onGatewayCrash(
  cb: (code: number | null, signal: NodeJS.Signals | null) => void,
): void {
  gatewayCrashCallback = cb;
}

export function notifyGatewayCrash(
  code: number | null,
  signal: NodeJS.Signals | null,
): void {
  gatewayCrashCallback?.(code, signal);
}

export function resetGatewaySessionForStart(): void {
  gatewayRuntime.reusingExternalGateway = false;
}

export function markReusingExternalGateway(port: number): void {
  gatewayRuntime.reusingExternalGateway = true;
  gatewayRuntime.activePort = port;
}

export function clearReusingExternalGateway(): void {
  gatewayRuntime.reusingExternalGateway = false;
}

export function isReusingExternalGateway(): boolean {
  return gatewayRuntime.reusingExternalGateway;
}
