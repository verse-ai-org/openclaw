export type RunEventKind = "start" | "progress" | "terminal";

export function normalizeSessionKey(raw: unknown): string {
  return typeof raw === "string" && raw.trim() ? raw.trim() : "";
}

export function normalizeRunId(raw: unknown): string | undefined {
  return typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
}

export function shouldAcceptRunEvent(params: {
  activeRunBySession: Map<string, string>;
  sessionKey: string;
  runId?: string;
  eventKind: RunEventKind;
}): boolean {
  const { activeRunBySession, sessionKey, runId, eventKind } = params;
  if (!sessionKey) {
    return true;
  }
  const activeRunId = activeRunBySession.get(sessionKey);
  if (!runId) {
    return true;
  }
  if (!activeRunId) {
    if (eventKind !== "terminal") {
      activeRunBySession.set(sessionKey, runId);
    }
    return true;
  }
  if (activeRunId === runId) {
    if (eventKind === "terminal") {
      activeRunBySession.delete(sessionKey);
    }
    return true;
  }
  if (eventKind === "start") {
    activeRunBySession.set(sessionKey, runId);
    return true;
  }
  return false;
}
