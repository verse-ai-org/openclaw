import type { StartupPhase } from "@/types/startup";

/** Default copy when main process does not send `message`. */
const PHASE_MESSAGES: Record<StartupPhase, string> = {
  starting: "Starting application…",
  gateway: "Starting local service…",
  workspace: "Starting workspace…",
  ready: "Starting Bossim…",
  failed: "Failed to start service",
};

export function defaultMessageForPhase(phase: StartupPhase): string {
  return PHASE_MESSAGES[phase] ?? "Starting…";
}
