import type { InteractionStatus } from "@openclaw/interactions";

/**
 * Per-interaction state tracked in memory for idempotency and session-key
 * validation. No Promise is held here — the runner turn ends naturally after
 * emitting `<ask>` tags, and the next turn is started by `requestHeartbeatNow`
 * once the user responds via `chat.interactionRespond`. This matches the Cron
 * push model: write transcript + enqueue system event + wake heartbeat.
 */
export interface PendingInteraction {
  sessionKey: string;
  runId: string;
  interactionId: string;
  component: string;
  createdAt: number;
  status: InteractionStatus | "pending";
  lastResult?: InteractionResolveResult;
}

export interface InteractionResolveResult {
  status: InteractionStatus;
  data: unknown;
  responseBy?: { userId?: string; channel?: string };
}

export interface RegisterPendingInteractionOptions {
  sessionKey: string;
  runId: string;
  interactionId: string;
  component: string;
}

const pendingByInteractionId = new Map<string, PendingInteraction>();

export function registerPendingInteraction(
  opts: RegisterPendingInteractionOptions,
): PendingInteraction {
  const existing = pendingByInteractionId.get(opts.interactionId);
  // Reuse an entry that is still pending (avoids duplicate registrations).
  if (existing && existing.status === "pending") {
    return existing;
  }

  const entry: PendingInteraction = {
    sessionKey: opts.sessionKey,
    runId: opts.runId,
    interactionId: opts.interactionId,
    component: opts.component,
    createdAt: Date.now(),
    status: "pending",
  };
  pendingByInteractionId.set(opts.interactionId, entry);
  return entry;
}

export interface ResolveInteractionArgs {
  interactionId: string;
  sessionKey: string;
  status: InteractionStatus;
  data: unknown;
  responseBy?: { userId?: string; channel?: string };
}

export interface ResolveInteractionOutcome {
  ok: boolean;
  alreadyResolved: boolean;
  status: InteractionStatus;
  data: unknown;
  entry?: PendingInteraction;
  error?: string;
}

/**
 * Idempotently mark a pending interaction as resolved.
 *
 * - First call transitions status from "pending" → resolved and stores result.
 * - Subsequent calls with the same id return the previously-stored result
 *   (retries are safe).
 * - Session key mismatches are rejected to avoid cross-session collisions.
 *
 * Note: this function no longer resolves a Promise — the runner turn already
 * ended after emitting `<ask>`. The next agent turn is started by
 * `requestHeartbeatNow` in the gateway handler.
 */
export function resolvePendingInteraction(args: ResolveInteractionArgs): ResolveInteractionOutcome {
  const entry = pendingByInteractionId.get(args.interactionId);
  if (!entry) {
    return {
      ok: false,
      alreadyResolved: false,
      status: args.status,
      data: args.data,
      error: "interaction not found",
    };
  }
  if (entry.sessionKey !== args.sessionKey) {
    return {
      ok: false,
      alreadyResolved: false,
      status: args.status,
      data: args.data,
      entry,
      error: "sessionKey mismatch",
    };
  }
  if (entry.status !== "pending" && entry.lastResult) {
    return {
      ok: true,
      alreadyResolved: true,
      status: entry.lastResult.status,
      data: entry.lastResult.data,
      entry,
    };
  }

  const result: InteractionResolveResult = {
    status: args.status,
    data: args.data,
    responseBy: args.responseBy,
  };
  entry.status = args.status;
  entry.lastResult = result;
  return {
    ok: true,
    alreadyResolved: false,
    status: args.status,
    data: args.data,
    entry,
  };
}

/**
 * Remove the entry from the in-memory map. Safe to call even if no entry
 * exists. Called after the transcript has been updated.
 */
export function forgetPendingInteraction(interactionId: string): void {
  pendingByInteractionId.delete(interactionId);
}

/**
 * Mark every unresolved interaction for a session as cancelled/timed_out.
 * Invoked on run termination or session close so stale entries don't linger.
 */
export function cancelPendingInteractionsForSession(
  sessionKey: string,
  reason: "aborted" | "session_closed" | "timed_out" = "session_closed",
): number {
  let count = 0;
  for (const entry of pendingByInteractionId.values()) {
    if (entry.sessionKey !== sessionKey) {
      continue;
    }
    if (entry.status !== "pending") {
      continue;
    }
    const status: InteractionStatus = reason === "timed_out" ? "timed_out" : "cancelled";
    const result: InteractionResolveResult = { status, data: null };
    entry.status = status;
    entry.lastResult = result;
    count += 1;
  }
  return count;
}

export function getPendingInteraction(interactionId: string): PendingInteraction | undefined {
  return pendingByInteractionId.get(interactionId);
}

export function resetPendingInteractionsForTest() {
  pendingByInteractionId.clear();
}
