/**
 * Bridge between the runtime's interaction event stream and messaging
 * channels (Telegram, Discord, Slack, Signal, iMessage, WhatsApp, extensions).
 *
 * Every channel exposes a different widget surface (inline keyboard, block
 * actions, plain numbered text) and a different callback shape. Instead of
 * duplicating "subscribe to interaction event + post-to-channel +
 * parse-callback + post-back" in every provider, each channel registers a
 * small adapter here and this module wires the common protocol plumbing.
 *
 * This file is intentionally transport-agnostic — no direct imports of any
 * provider client. Actual providers live under `src/telegram`, `src/discord`,
 * `src/slack`, `src/signal`, `src/imessage`, `src/web`, and `extensions/*`.
 */

import path from "node:path";
import { SessionManager } from "@mariozechner/pi-coding-agent";
import { resolveSessionAgentId } from "../agents/agent-scope.js";
import { type InteractionResponseMessage } from "../agents/interactions/messages.js";
import { resolvePendingInteraction } from "../agents/interactions/runner-suspend.js";
import { lookupInteractionFromTranscript } from "../agents/interactions/transcript-lookup.js";
import { resolveSessionFilePath } from "../config/sessions.js";
import { loadSessionEntry } from "../gateway/session-utils.js";
import { emitAgentEvent } from "../infra/agent-events.js";
import { requestHeartbeatNow } from "../infra/heartbeat-wake.js";
import {
  decodeInteractionCallbackValue,
  encodeInteractionCallbackValue,
  renderInteractionForChannel,
  type InteractionChannelCapabilities,
  type InteractionChannelRender,
  type InteractionResponseDraft,
} from "./interaction-downgrade.js";

export interface ChannelInteractionAdapter {
  /** Provider id (e.g. `telegram`, `discord`, `slack`). */
  channel: string;
  /** Resolve channel capabilities for a given session/account. */
  resolveCapabilities(context: {
    sessionKey: string;
    accountId?: string;
  }): InteractionChannelCapabilities;
  /**
   * Post the rendered interaction to the channel. Implementation should use
   * `encodeInteractionCallbackValue` for callback payloads so inbound parsing
   * is symmetric.
   */
  postInteraction(context: { sessionKey: string; render: InteractionChannelRender }): Promise<void>;
  /**
   * Optional hook: tear down a pending widget (remove inline keyboard, edit
   * message) once the interaction is resolved. Providers that don't need
   * this can omit the implementation.
   */
  teardownInteraction?(context: {
    sessionKey: string;
    interactionId: string;
    status: "submitted" | "cancelled" | "timed_out";
  }): Promise<void>;
}

const adapters = new Map<string, ChannelInteractionAdapter>();

export function registerChannelInteractionAdapter(adapter: ChannelInteractionAdapter): void {
  adapters.set(adapter.channel, adapter);
}

export function getChannelInteractionAdapter(
  channel: string,
): ChannelInteractionAdapter | undefined {
  return adapters.get(channel);
}

export function listChannelInteractionAdapters(): ChannelInteractionAdapter[] {
  return Array.from(adapters.values());
}

/**
 * Dispatch an `interaction_request` event to the adapter that owns the given
 * session/channel. Call this from each channel's agent-event subscriber (or
 * from a centralized dispatcher) when `stream === "interaction"` and
 * `data.phase === "request"` arrives.
 */
export async function dispatchInteractionRequestToChannel(params: {
  channel: string;
  sessionKey: string;
  accountId?: string;
  interactionId: string;
  component: string;
  payload: unknown;
}): Promise<{ ok: boolean; reason?: string }> {
  const adapter = adapters.get(params.channel);
  if (!adapter) {
    return { ok: false, reason: `no adapter registered for ${params.channel}` };
  }
  const capabilities = adapter.resolveCapabilities({
    sessionKey: params.sessionKey,
    accountId: params.accountId,
  });
  const render = renderInteractionForChannel({
    interactionId: params.interactionId,
    component: params.component,
    payload: params.payload,
    capabilities,
  });
  if (!render) {
    return { ok: false, reason: `render failed for component ${params.component}` };
  }
  await adapter.postInteraction({ sessionKey: params.sessionKey, render });
  return { ok: true };
}

/**
 * Submit a channel-side response back to the runtime. This mirrors what the
 * gateway's `chat.interactionRespond` handler does for providers that run
 * in-process and don't need to round-trip through RPC.
 *
 * On first resolution (!alreadyResolved) it:
 *   1. Persists an `interaction_response` row to the session transcript.
 *   2. Wakes the heartbeat runner to start the next agent turn immediately.
 *      The LLM sees the response via `projectInteractionMessages` in
 *      `sanitizeSessionHistory` — no system-event bridge needed.
 *
 * When no in-memory pending entry is found, the function falls back to reading
 * the session transcript (handles gateway restart / process reload).
 */
export function submitInteractionResponseFromChannel(
  draft: InteractionResponseDraft & { sessionKey: string; runId?: string },
): { ok: boolean; alreadyResolved?: boolean; error?: string } {
  // ── Primary path: live in-memory entry ──────────────────────────────────
  const outcome = resolvePendingInteraction({
    interactionId: draft.interactionId,
    sessionKey: draft.sessionKey,
    status: draft.status,
    data: draft.data,
    responseBy: draft.responseBy,
  });

  if (outcome.ok) {
    emitAgentEvent({
      runId: draft.runId,
      sessionKey: draft.sessionKey,
      stream: "interaction",
      data: {
        phase: "response",
        interactionId: draft.interactionId,
        status: outcome.status,
        responseBy: draft.responseBy,
        data: outcome.data,
      },
    });

    if (!outcome.alreadyResolved) {
      const component = outcome.entry?.component ?? draft.interactionId;
      writeResponseAndWake({
        interactionId: draft.interactionId,
        component,
        runId: draft.runId ?? outcome.entry?.runId,
        sessionKey: draft.sessionKey,
        status: outcome.status,
        data: outcome.data,
        responseBy: draft.responseBy,
      });
    }
    return { ok: true, alreadyResolved: outcome.alreadyResolved };
  }

  // ── Fallback path: no in-memory entry (gateway restart / channel reload) ─
  const transcriptResult = lookupInteractionFromTranscript(draft.interactionId, draft.sessionKey);

  if (!transcriptResult.found) {
    return { ok: false, error: outcome.error };
  }

  if (transcriptResult.alreadyResolved) {
    return { ok: true, alreadyResolved: true };
  }

  emitAgentEvent({
    runId: transcriptResult.runId ?? draft.runId,
    sessionKey: draft.sessionKey,
    stream: "interaction",
    data: {
      phase: "response",
      interactionId: draft.interactionId,
      status: draft.status,
      responseBy: draft.responseBy,
      data: draft.data,
    },
  });

  writeResponseAndWake({
    interactionId: draft.interactionId,
    component: transcriptResult.component,
    runId: transcriptResult.runId ?? draft.runId,
    sessionKey: draft.sessionKey,
    status: draft.status,
    data: draft.data,
    responseBy: draft.responseBy,
  });

  return { ok: true, alreadyResolved: false };
}

// ── Shared helper ────────────────────────────────────────────────────────────

function writeResponseAndWake(params: {
  interactionId: string;
  component: string;
  runId?: string;
  sessionKey: string;
  status: "submitted" | "cancelled";
  data: unknown;
  responseBy?: { userId?: string; channel?: string };
}) {
  const { interactionId, component, runId, sessionKey, status, data, responseBy } = params;

  const responseMsg: InteractionResponseMessage = {
    role: "interaction_response",
    interactionId,
    component,
    status,
    data,
    responseBy,
    runId,
    timestamp: new Date().toISOString(),
  };

  // ① Persist to transcript.
  try {
    const { cfg, storePath, entry } = loadSessionEntry(sessionKey);
    const sessionId = entry?.sessionId;
    if (sessionId && storePath) {
      const agentId = resolveSessionAgentId({ sessionKey, config: cfg });
      const sessionsDir = path.dirname(storePath);
      const transcriptPath = resolveSessionFilePath(
        sessionId,
        entry.sessionFile ? { sessionFile: entry.sessionFile } : undefined,
        { sessionsDir, agentId },
      );
      SessionManager.open(transcriptPath).appendMessage(responseMsg as never);
    }
  } catch {
    // Non-fatal — heartbeat will still fire and the transcript projection
    // ensures the LLM sees the response on the next turn.
  }

  // ② Wake the agent for the next turn. The LLM will see the response via
  //    `projectInteractionMessages` in `sanitizeSessionHistory`.
  requestHeartbeatNow({ reason: "interaction-response", sessionKey });
}

export { encodeInteractionCallbackValue, decodeInteractionCallbackValue };
