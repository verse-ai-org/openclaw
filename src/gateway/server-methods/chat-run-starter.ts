import { dispatchInboundMessage } from "../../auto-reply/dispatch.js";
import type { ReplyDispatcher } from "../../auto-reply/reply/reply-dispatcher.js";
import type { MsgContext } from "../../auto-reply/templating.js";
import type { OpenClawConfig } from "../../config/config.js";
import { resolveChatRunExpiresAtMs } from "../chat-abort.js";
import type { GatewayRequestContext } from "./types.js";

export interface StartChatRunPipelineParams {
  context: GatewayRequestContext;
  cfg: OpenClawConfig;
  runId: string;
  rawSessionKey: string;
  sessionId: string;
  timeoutMs: number;
  source: "chat.send" | "interaction_continue";
  msgContext: MsgContext;
  dispatcher: ReplyDispatcher;
  replyOptions?: Parameters<typeof dispatchInboundMessage>[0]["replyOptions"];
  onAgentRunStart?: (runId: string) => void;
  onSuccess?: (info: { agentRunStarted: boolean }) => void;
  onError?: (err: unknown) => void;
  onFinally?: () => void;
}

/**
 * Shared entry-point for chat-like runs triggered by gateway methods.
 *
 * Registers abort bookkeeping, dispatches the inbound context through the
 * normal reply pipeline, and guarantees cleanup of run state.
 */
export function startChatRunPipeline(params: StartChatRunPipelineParams): void {
  const {
    context,
    cfg,
    runId,
    rawSessionKey,
    sessionId,
    timeoutMs,
    source,
    msgContext,
    dispatcher,
    replyOptions,
    onAgentRunStart,
    onSuccess,
    onError,
    onFinally,
  } = params;
  const now = Date.now();
  context.logGateway.info(
    `[chat-run] start source=${source} runId=${runId} sessionKey=${rawSessionKey} sessionId=${sessionId}`,
  );
  context.addChatRun(sessionId, {
    sessionKey: rawSessionKey,
    clientRunId: runId,
  });
  const abortController = new AbortController();
  context.chatAbortControllers.set(runId, {
    controller: abortController,
    sessionId,
    sessionKey: rawSessionKey,
    startedAtMs: now,
    expiresAtMs: resolveChatRunExpiresAtMs({ now, timeoutMs }),
  });

  let agentRunStarted = false;
  void dispatchInboundMessage({
    ctx: msgContext,
    cfg,
    dispatcher,
    replyOptions: {
      ...replyOptions,
      runId,
      abortSignal: abortController.signal,
      onAgentRunStart: (agentRunId) => {
        agentRunStarted = true;
        onAgentRunStart?.(agentRunId);
      },
    },
  })
    .then(() => {
      context.logGateway.info(
        `[chat-run] success source=${source} runId=${runId} sessionKey=${rawSessionKey} agentRunStarted=${agentRunStarted}`,
      );
      onSuccess?.({ agentRunStarted });
    })
    .catch((err) => {
      context.logGateway.warn(
        `[chat-run] error source=${source} runId=${runId} sessionKey=${rawSessionKey}: ${String(err)}`,
      );
      onError?.(err);
    })
    .finally(() => {
      context.chatAbortControllers.delete(runId);
      context.removeChatRun(sessionId, runId, rawSessionKey);
      context.logGateway.debug(
        `[chat-run] cleanup source=${source} runId=${runId} sessionKey=${rawSessionKey}`,
      );
      onFinally?.();
    });
}
