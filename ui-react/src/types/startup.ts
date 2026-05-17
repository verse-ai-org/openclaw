/** Startup splash phases — keep in sync with apps/electron/src/main/startup-types.ts */
export type StartupPhase =
  | "starting"
  | "gateway"
  | "workspace"
  | "ready"
  | "failed";

export type StartupPhasePayload = {
  phase: StartupPhase;
  message?: string;
  elapsedMs?: number;
  error?: string;
};
