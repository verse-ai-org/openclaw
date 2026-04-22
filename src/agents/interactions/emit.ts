import type { SessionManager } from "@mariozechner/pi-coding-agent";
import { getInteractionManifest } from "@openclaw/interactions";
import { emitAgentEvent } from "../../infra/agent-events.js";
import { createAskTagStreamParser } from "./ask-tag-parser.js";
import type { InteractionRequestMessage } from "./messages.js";
import { registerPendingInteraction } from "./runner-suspend.js";

export interface EmitAskTagsFromAssistantOptions {
  assistantText: string;
  sessionManager: SessionManager;
  sessionKey: string;
  runId: string;
  /** Logger for warnings; defaults to no-op. */
  warn?: (msg: string) => void;
}

export interface EmitAskTagsResult {
  /** Number of valid `<ask>` tags parsed + emitted as interaction_request rows. */
  emittedRequestCount: number;
  /** Interaction ids registered as pending (awaiting user response). */
  pendingInteractionIds: string[];
}

/**
 * Scan the final assistant text for `<ask>` tags and, for each valid one:
 * - append an `interaction_request` row to the session transcript
 * - emit a `stream: "interaction"` agent event so UIs see it in real-time
 * - register a pending interaction promise (so future suspend/resume code
 *   or channel-downgrade handlers can await the response).
 *
 * Invalid tags are logged via `warn` and silently skipped — the caller has
 * already emitted the surrounding assistant text, so the user still sees the
 * model's message. This is the pragmatic integration point for Phase B: the
 * LLM uses `<ask>` in lieu of a tool call, which naturally ends its turn,
 * and the conversation resumes when the UI/channel posts
 * `chat.interactionRespond`.
 */
export function emitAskTagsFromAssistant(
  opts: EmitAskTagsFromAssistantOptions,
): EmitAskTagsResult {
  const { assistantText, sessionManager, sessionKey, runId } = opts;
  if (!assistantText || !assistantText.includes("<ask")) {
    return { emittedRequestCount: 0, pendingInteractionIds: [] };
  }

  const pendingInteractionIds: string[] = [];
  let emittedRequestCount = 0;

  const parser = createAskTagStreamParser({
    onText: () => {
      // The surrounding text is already streamed/persisted by the normal
      // assistant path; we ignore text slices here.
    },
    onInvalid: (info) => {
      opts.warn?.(
        `<ask component="${info.component}" id="${info.id}"> skipped: ${info.reason}`,
      );
    },
    onComplete: (tag) => {
      const manifest = getInteractionManifest(tag.component);
      if (!manifest) return;
      const msg: InteractionRequestMessage = {
        role: "interaction_request",
        interactionId: tag.interactionId,
        component: tag.component,
        payload: tag.payload,
        schemaVersion: manifest.schemaVersion,
        runId,
        cancellable: tag.cancellable,
        timestamp: new Date().toISOString(),
      };
      sessionManager.appendMessage(msg as never);
      emitAgentEvent({
        runId,
        sessionKey,
        stream: "interaction",
        data: {
          phase: "request",
          interactionId: tag.interactionId,
          component: tag.component,
          payload: tag.payload,
          schemaVersion: manifest.schemaVersion,
          cancellable: tag.cancellable,
          timeoutMs: tag.timeoutMs,
        },
      });
      registerPendingInteraction({
        sessionKey,
        runId,
        interactionId: tag.interactionId,
        component: tag.component,
      });
      emittedRequestCount += 1;
      pendingInteractionIds.push(tag.interactionId);
    },
  });
  parser.push(assistantText);
  parser.end();

  return { emittedRequestCount, pendingInteractionIds };
}
