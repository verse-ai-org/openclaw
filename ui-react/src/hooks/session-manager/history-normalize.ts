import {
  type ChatMessage,
  type InteractionState,
  type MessageAttachment,
} from "@/store/chat.store";
import {
  consolidateToolMessages,
  extractContentBlocks,
  extractToolCallParts,
  mergeToolResults,
  normalizeContent,
  normalizeHistoryAttachmentHints,
  normalizeRole,
  stripAttachmentContent,
  type RawMessage,
} from "@/hooks/chat-event-bridge";

type HistoryNormalizeHooks = {
  onRawMessages?: (messages: RawMessage[]) => void;
  onNormalizedMessages?: (messages: ChatMessage[]) => void;
  onConsolidatedMessages?: (messages: ChatMessage[]) => void;
};

/**
 * Rows in the session transcript produced by the interaction protocol. The
 * gateway emits these alongside user/assistant messages in `chat.history`.
 * They must not render as chat bubbles — they exist to reconstruct the
 * `interactions` slice after a page reload.
 */
const INTERACTION_REQUEST_ROLE = "interaction_request";
const INTERACTION_RESPONSE_ROLE = "interaction_response";

export type InteractionHistoryProjection = {
  interactions: Record<string, InteractionState>;
};

function extractInteractionStateFromRows(
  rows: RawMessage[],
): InteractionHistoryProjection {
  const out: Record<string, InteractionState> = {};
  for (const m of rows) {
    const role = typeof m.role === "string" ? m.role : "";
    if (role !== INTERACTION_REQUEST_ROLE && role !== INTERACTION_RESPONSE_ROLE) {
      continue;
    }
    const interactionId =
      typeof (m as { interactionId?: unknown }).interactionId === "string"
        ? ((m as { interactionId: string }).interactionId)
        : undefined;
    if (!interactionId) continue;
    const ts = m.ts ?? m.timestamp ?? Date.now();
    const existing = out[interactionId];

    if (role === INTERACTION_REQUEST_ROLE) {
      const component =
        typeof (m as { component?: unknown }).component === "string"
          ? ((m as { component: string }).component)
          : existing?.component ?? "unknown";
      const payload = (m as { payload?: unknown }).payload;
      const schemaVersion =
        typeof (m as { schemaVersion?: unknown }).schemaVersion === "number"
          ? ((m as { schemaVersion: number }).schemaVersion)
          : existing?.schemaVersion ?? 1;
      const cancellable =
        typeof (m as { cancellable?: unknown }).cancellable === "boolean"
          ? ((m as { cancellable: boolean }).cancellable)
          : existing?.cancellable;
      out[interactionId] = {
        interactionId,
        component,
        payload,
        schemaVersion,
        cancellable,
        status: existing?.status ?? "pending",
        response: existing?.response,
        responseBy: existing?.responseBy,
        createdAt: existing?.createdAt ?? ts,
        updatedAt: ts,
      };
    } else {
      // interaction_response
      const statusRaw = (m as { status?: unknown }).status;
      const status = (
        statusRaw === "submitted" ||
        statusRaw === "cancelled" ||
        statusRaw === "expired" ||
        statusRaw === "failed"
          ? statusRaw
          : "submitted"
      ) as InteractionState["status"];
      const data = (m as { data?: unknown }).data;
      const responseBy =
        typeof (m as { responseBy?: unknown }).responseBy === "object" &&
        (m as { responseBy?: unknown }).responseBy !== null
          ? ((m as { responseBy: { userId?: string; channel?: string } })
              .responseBy)
          : existing?.responseBy;
      if (!existing) {
        // Lone response row (the request was compacted away). Still useful to
        // keep for the QA summary, but we don't know the component so skip.
        continue;
      }
      out[interactionId] = {
        ...existing,
        status,
        response: data ?? existing.response,
        responseBy,
        updatedAt: ts,
      };
    }
  }
  return { interactions: out };
}

export function normalizeHistoryMessages(
  messages: RawMessage[],
  sessionKey: string | undefined,
  hooks?: HistoryNormalizeHooks,
): ChatMessage[] {
  hooks?.onRawMessages?.(messages);

  // Strip interaction protocol rows before running the user/assistant
  // normalizer so they don't render as phantom assistant bubbles.
  const chatRows = messages.filter((m) => {
    const role = typeof m.role === "string" ? m.role : "";
    return role !== INTERACTION_REQUEST_ROLE && role !== INTERACTION_RESPONSE_ROLE;
  });

  const merged = mergeToolResults(chatRows) as RawMessage[];
  const normalized: ChatMessage[] = merged.map((m) => {
    const role = normalizeRole(m.role);
    const rawContent = normalizeContent(m.content ?? m.text ?? "");

    let content = rawContent;
    let attachments: MessageAttachment[] | undefined;
    if (role === "user") {
      const fromGateway = normalizeHistoryAttachmentHints(m.attachments);
      const stripped = stripAttachmentContent(rawContent);
      content = stripped.prompt;
      attachments =
        fromGateway ??
        (stripped.attachments.length > 0 ? stripped.attachments : undefined);
    }

    return {
      id: m.id ?? crypto.randomUUID(),
      role,
      content,
      ts: m.ts ?? m.timestamp ?? Date.now(),
      runId: m.runId,
      sessionKey,
      attachments,
      toolCalls: extractToolCallParts(m.content),
      contentBlocks: extractContentBlocks(m.content),
    };
  });
  hooks?.onNormalizedMessages?.(normalized);

  const consolidated = consolidateToolMessages(normalized);
  hooks?.onConsolidatedMessages?.(consolidated);
  return consolidated;
}

/**
 * Reconstruct the `interactions` slice from raw history rows. Call this at
 * the same time as `normalizeHistoryMessages` so that InteractiveParts can
 * render the widget for any `{type:"interaction"}` content block surfaced by
 * ask-tag hoisting.
 */
export function projectInteractionsFromHistory(
  messages: RawMessage[],
): InteractionHistoryProjection {
  return extractInteractionStateFromRows(messages);
}
