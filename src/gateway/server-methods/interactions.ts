import path from "node:path";
import { createReplyDispatcher } from "../../auto-reply/reply/reply-dispatcher.js";
import type { MsgContext } from "../../auto-reply/templating.js";
import { createReplyPrefixOptions } from "../../channels/reply-prefix.js";
import { SessionManager } from "@mariozechner/pi-coding-agent";
import { resolveSessionAgentId } from "../../agents/agent-scope.js";
import { resolveAgentTimeoutMs } from "../../agents/timeout.js";
import { type InteractionResponseMessage } from "../../agents/interactions/messages.js";
import {
  getPendingInteraction,
  resolvePendingInteraction,
} from "../../agents/interactions/runner-suspend.js";
import { lookupInteractionFromTranscript } from "../../agents/interactions/transcript-lookup.js";
import { resolveSessionFilePath } from "../../config/sessions.js";
import { emitAgentEvent } from "../../infra/agent-events.js";
import { INTERNAL_MESSAGE_CHANNEL } from "../../utils/message-channel.js";
import {
  ErrorCodes,
  errorShape,
  formatValidationErrors,
  validateChatInteractionRespondParams,
} from "../protocol/index.js";
import { loadSessionEntry } from "../session-utils.js";
import { startChatRunPipeline } from "./chat-run-starter.js";
import type { GatewayRequestHandlers } from "./types.js";

/**
 * `chat.interactionRespond` — a client (UI, channel downgrade, etc.) reports
 * that a pending interaction has been answered or cancelled.
 *
 * Behaviour:
 * 1. Validate params.
 * 2. Look up the pending entry:
 *    a. First from the in-memory `pendingByInteractionId` map (live run).
 *    b. Fallback: scan the session transcript for an un-answered
 *       `interaction_request` row (handles gateway restart / page reload).
 * 3. Resolve the in-memory state entry when it exists.
 * 4. Emit a `stream: "interaction"` agent event so other clients observe the
 *    resolution.
 * 5. On first resolution (!alreadyResolved):
 *    a. Persist an `interaction_response` row to the session transcript so
 *       history replay and session-transcript-repair pairing stay consistent.
 *    b. Call `requestHeartbeatNow` to wake the agent and start the next turn.
 *       The LLM will see the response via the `projectInteractionMessages`
 *       projection in `sanitizeSessionHistory` — no system-event bridge needed.
 */
export const interactionHandlers: GatewayRequestHandlers = {
  "chat.interactionRespond": ({ params, respond, context }) => {
    if (!validateChatInteractionRespondParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid chat.interactionRespond params: ${formatValidationErrors(
            validateChatInteractionRespondParams.errors,
          )}`,
        ),
      );
      return;
    }
    const { sessionKey, interactionId, data, responseBy } = params as {
      sessionKey: string;
      interactionId: string;
      data: unknown;
      status?: "submitted" | "cancelled";
      responseBy?: { userId?: string; channel?: string };
    };
    const status = (params as { status?: "submitted" | "cancelled" }).status ?? "submitted";

    // ── Primary path: live in-memory entry ──────────────────────────────────
    const existing = getPendingInteraction(interactionId);
    if (existing) {
      if (existing.sessionKey !== sessionKey) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "sessionKey does not match interactionId"),
        );
        return;
      }

      const outcome = resolvePendingInteraction({
        interactionId,
        sessionKey,
        status,
        data,
        responseBy,
      });
      if (!outcome.ok) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, outcome.error ?? "resolve failed"),
        );
        return;
      }

      emitAgentEvent({
        runId: existing.runId,
        sessionKey,
        stream: "interaction",
        data: {
          phase: "response",
          interactionId,
          status: outcome.status,
          responseBy,
          data: outcome.data,
        },
      });

      respond(true, {
        interactionId,
        status: outcome.status,
        alreadyResolved: outcome.alreadyResolved,
      });
      context.logGateway.debug(
        `chat.interactionRespond id=${interactionId} status=${outcome.status} alreadyResolved=${outcome.alreadyResolved}`,
      );

      if (!outcome.alreadyResolved) {
        writeResponseAndWake({
          interactionId,
          component: existing.component,
          runId: existing.runId,
          sessionKey,
          status: outcome.status,
          data: outcome.data,
          responseBy,
          context,
        });
      }
      return;
    }

    // ── Fallback path: no in-memory entry (gateway restart / page reload) ───
    const transcriptResult = lookupInteractionFromTranscript(interactionId, sessionKey);

    if (!transcriptResult.found) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, `no pending interaction for id=${interactionId}`),
      );
      return;
    }

    if (transcriptResult.alreadyResolved) {
      // A response row already exists in the transcript.
      respond(true, { interactionId, status, alreadyResolved: true });
      context.logGateway.debug(
        `chat.interactionRespond id=${interactionId} transcript-fallback alreadyResolved=true`,
      );
      return;
    }

    // Un-answered request found in transcript — treat as a fresh first resolution.
    emitAgentEvent({
      runId: transcriptResult.runId,
      sessionKey,
      stream: "interaction",
      data: { phase: "response", interactionId, status, responseBy, data },
    });

    respond(true, { interactionId, status, alreadyResolved: false });
    context.logGateway.debug(
      `chat.interactionRespond id=${interactionId} transcript-fallback status=${status}`,
    );

    writeResponseAndWake({
      interactionId,
      component: transcriptResult.component,
      runId: transcriptResult.runId,
      sessionKey,
      status,
      data,
      responseBy,
      context,
    });
  },
};

// ── Shared helper ────────────────────────────────────────────────────────────

function writeResponseAndWake(params: {
  interactionId: string;
  component: string;
  runId?: string;
  sessionKey: string;
  status: "submitted" | "cancelled";
  data: unknown;
  responseBy?: { userId?: string; channel?: string };
  context: Parameters<GatewayRequestHandlers[string]>[0]["context"];
}) {
  const { interactionId, component, runId, sessionKey, status, data, responseBy, context } = params;
  let persistedSessionId: string | undefined;

  context.logGateway.info(
    `[interaction] writeResponseAndWake start id=${interactionId} component=${component} status=${status} sessionKey=${sessionKey} runId=${runId ?? "none"}`,
  );

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

  // ② Persist interaction_response to the transcript so history replay
  //    and session-transcript-repair request/response pairing are correct.
  //    The LLM sees the response via `projectInteractionMessages` in
  //    `sanitizeSessionHistory` on the next turn — no system event needed.
  try {
    const { cfg, storePath, entry } = loadSessionEntry(sessionKey);
    const sessionId = entry?.sessionId;
    persistedSessionId = sessionId;
    context.logGateway.info(
      `[interaction] loadSessionEntry sessionKey=${sessionKey} sessionId=${sessionId ?? "MISSING"} storePath=${storePath ?? "MISSING"}`,
    );
    if (sessionId && storePath) {
      const agentId = resolveSessionAgentId({ sessionKey, config: cfg });
      const sessionsDir = path.dirname(storePath);
      const transcriptPath = resolveSessionFilePath(
        sessionId,
        entry.sessionFile ? { sessionFile: entry.sessionFile } : undefined,
        { sessionsDir, agentId },
      );
      context.logGateway.info(`[interaction] writing transcript to ${transcriptPath}`);
      SessionManager.open(transcriptPath).appendMessage(responseMsg as never);
      context.logGateway.info(`[interaction] transcript write OK id=${interactionId}`);
    } else {
      context.logGateway.warn(
        `[interaction] skipping transcript write: sessionId=${sessionId ?? "MISSING"} storePath=${storePath ?? "MISSING"}`,
      );
    }
  } catch (err) {
    context.logGateway.warn(
      `[interaction] transcript write failed id=${interactionId}: ${String(err)}`,
    );
  }

  // ③ Start continuation run through the same gateway chat run pipeline.
  try {
    const { cfg } = loadSessionEntry(sessionKey);
    const continuationRunId = crypto.randomUUID();
    const agentId = resolveSessionAgentId({ sessionKey, config: cfg });
    const { onModelSelected: _onModelSelected, ...prefixOptions } = createReplyPrefixOptions({
      cfg,
      agentId,
      channel: INTERNAL_MESSAGE_CHANNEL,
    });
    const dispatcher = createReplyDispatcher({
      ...prefixOptions,
      onError: (err) =>
        context.logGateway.warn(`[interaction] continuation dispatch error id=${interactionId}: ${String(err)}`),
      deliver: async () => {},
    });
    const continuationBody = buildInteractionContinuationPrompt({
      interactionId,
      status,
      data,
    });
    context.logGateway.info(
      `[interaction] continuation inbound summary requestRunId=${runId ?? "none"} sessionKey=${sessionKey} bodyPreview=${JSON.stringify(continuationBody).slice(0, 200)}`,
    );
    const msgContext: MsgContext = {
      Body: continuationBody,
      RawBody: continuationBody,
      CommandBody: continuationBody,
      BodyForAgent: continuationBody,
      From: "interaction:user",
      To: "interaction:assistant",
      Provider: INTERNAL_MESSAGE_CHANNEL,
      Surface: INTERNAL_MESSAGE_CHANNEL,
      SessionKey: sessionKey,
      CommandAuthorized: true,
    };
    context.logGateway.info(
      `[interaction] start continuation run id=${interactionId} continuationRunId=${continuationRunId}`,
    );
    startChatRunPipeline({
      context,
      cfg,
      runId: continuationRunId,
      rawSessionKey: sessionKey,
      sessionId: persistedSessionId ?? continuationRunId,
      timeoutMs: resolveAgentTimeoutMs({ cfg }),
      source: "interaction_continue",
      msgContext,
      dispatcher,
      onSuccess: () =>
        context.logGateway.info(
          `[interaction] continuation run finished id=${interactionId} continuationRunId=${continuationRunId}`,
        ),
      onError: (err) =>
        context.logGateway.warn(
          `[interaction] continuation run failed id=${interactionId} continuationRunId=${continuationRunId}: ${String(err)}`,
        ),
    });
  } catch (err) {
    context.logGateway.warn(
      `[interaction] continuation setup failed id=${interactionId}: ${String(err)}`,
    );
  }
}

function buildInteractionContinuationPrompt(params: {
  interactionId: string;
  status: "submitted" | "cancelled";
  data: unknown;
}): string {
  const { interactionId, status, data } = params;
  if (status === "cancelled") {
    return `Interaction ${interactionId} was cancelled by the user.`;
  }
  if (!data || typeof data !== "object") {
    return `Interaction ${interactionId} was submitted by the user.`;
  }
  const answers = (data as { answers?: unknown }).answers;
  if (!answers || typeof answers !== "object") {
    return `Interaction ${interactionId} was submitted by the user.`;
  }
  const lines = Object.entries(answers as Record<string, unknown>).map(([key, value]) => {
    if (Array.isArray(value)) {
      return `${key}: ${value.map((v) => String(v)).join(", ")}`;
    }
    return `${key}: ${String(value)}`;
  });
  return [
    `Interaction ${interactionId} was submitted by the user.`,
    "Use these answers to continue the conversation:",
    ...lines,
  ].join("\n");
}
