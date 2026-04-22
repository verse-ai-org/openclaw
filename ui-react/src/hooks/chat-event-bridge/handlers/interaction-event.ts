import { useChatStore, type InteractiveSummaryPair } from "@/store/chat.store";
import { createInteractiveBlock, isInteractiveToolName } from "../interactive-blocks";
import { isChatEventForActiveSession } from "../session-scope";
import { logBridgeEvent } from "./bridge-debug";

export type InteractionEventPayload = {
  version?: number;
  phase?: string;
  sessionKey?: string;
  interactionId?: string;
  kind?: string;
  status?: string;
  definition?: unknown;
  payload?: unknown;
};

function parseSummaryPairs(payload: unknown): InteractiveSummaryPair[] | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const summary = (payload as { summary?: unknown }).summary;
  if (!Array.isArray(summary)) {
    return null;
  }
  const pairs = summary
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }
      const question = (entry as { question?: unknown }).question;
      const answer = (entry as { answer?: unknown }).answer;
      if (typeof question !== "string" || typeof answer !== "string") {
        return null;
      }
      return { question, answer };
    })
    .filter((entry): entry is InteractiveSummaryPair => entry != null);
  return pairs.length > 0 ? pairs : null;
}

export function handleInteractionEvent(payload: InteractionEventPayload | undefined) {
  if (!payload) {
    return;
  }
  if (!isChatEventForActiveSession(payload.sessionKey)) {
    logBridgeEvent(
      "debug",
      "skip interaction event for inactive session",
      {
        phase: payload.phase,
        sessionKey: payload.sessionKey,
        interactionId: payload.interactionId,
      },
      {
        channel: "interaction",
      },
    );
    return;
  }
  const interactionId =
    typeof payload.interactionId === "string" ? payload.interactionId.trim() : "";
  const kind = typeof payload.kind === "string" ? payload.kind : undefined;
  if (!interactionId || !isInteractiveToolName(kind)) {
    logBridgeEvent(
      "warn",
      "drop interaction event with invalid id or kind",
      {
        phase: payload.phase,
        interactionId: payload.interactionId,
        kind: payload.kind,
      },
      {
        channel: "interaction",
        sessionKey: payload.sessionKey,
      },
    );
    return;
  }

  const st = useChatStore.getState();
  const phase = payload.phase;
  logBridgeEvent(
    "debug",
    "handle interaction event",
    {
      phase,
      interactionId,
      kind,
      status: payload.status,
    },
    {
      channel: "interaction",
      sessionKey: payload.sessionKey,
    },
  );

  if (phase === "requested") {
    const block = createInteractiveBlock({
      interactiveId: interactionId,
      kind,
      payload: payload.definition,
    });
    if (block) {
      st.upsertInteractiveStream(block);
      logBridgeEvent(
        "debug",
        "interaction requested upserted stream block",
        {
          interactionId,
          kind,
        },
        { channel: "interaction", sessionKey: payload.sessionKey },
      );
    } else {
      logBridgeEvent(
        "warn",
        "interaction requested payload parse failed",
        {
          interactionId,
          kind,
        },
        { channel: "interaction", sessionKey: payload.sessionKey },
      );
    }
    st.markInteractiveRequestedAck(interactionId);
    return;
  }

  if (phase === "submitted" || phase === "recovered" || phase === "recover_stale") {
    const pairs = parseSummaryPairs(payload.payload);
    if (pairs) {
      st.setInteractiveSummary(interactionId, pairs);
      logBridgeEvent(
        "debug",
        "interaction summary updated from submit-like phase",
        {
          interactionId,
          phase,
          pairCount: pairs.length,
        },
        { channel: "interaction", sessionKey: payload.sessionKey },
      );
    } else {
      logBridgeEvent(
        "debug",
        "interaction submit-like phase without summary",
        {
          interactionId,
          phase,
        },
        { channel: "interaction", sessionKey: payload.sessionKey },
      );
    }
    st.markInteractiveSubmittedAck(interactionId);
    st.clearInteractiveConsumedAck(interactionId);
    return;
  }

  if (phase === "consumed") {
    const pairs = parseSummaryPairs(payload.payload);
    if (pairs) {
      st.setInteractiveSummary(interactionId, pairs);
      logBridgeEvent(
        "debug",
        "interaction summary updated on consumed",
        {
          interactionId,
          pairCount: pairs.length,
        },
        { channel: "interaction", sessionKey: payload.sessionKey },
      );
    } else {
      logBridgeEvent(
        "debug",
        "interaction consumed without summary",
        {
          interactionId,
        },
        { channel: "interaction", sessionKey: payload.sessionKey },
      );
    }
    st.markInteractiveSubmittedAck(interactionId);
    st.markInteractiveConsumedAck(interactionId);
    return;
  }

  logBridgeEvent(
    "debug",
    "ignore unsupported interaction phase",
    {
      phase,
      interactionId,
      kind,
    },
    { channel: "interaction", sessionKey: payload.sessionKey },
  );
}
