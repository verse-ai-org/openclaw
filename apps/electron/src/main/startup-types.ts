/** Startup splash phases — keep in sync with ui-react/src/types/startup.ts */
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

export type StartupPipelineResult = {
  gatewayStarted: boolean;
  port: number;
  token: string;
  firstLaunch: boolean;
};
