import { Type } from "@sinclair/typebox";
import { INPUT_PROVENANCE_KIND_VALUES } from "../../../sessions/input-provenance.js";
import { ChatSendSessionKeyString, NonEmptyString } from "./primitives.js";

export const LogsTailParamsSchema = Type.Object(
  {
    cursor: Type.Optional(Type.Integer({ minimum: 0 })),
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 5000 })),
    maxBytes: Type.Optional(Type.Integer({ minimum: 1, maximum: 1_000_000 })),
  },
  { additionalProperties: false },
);

export const LogsTailResultSchema = Type.Object(
  {
    file: NonEmptyString,
    cursor: Type.Integer({ minimum: 0 }),
    size: Type.Integer({ minimum: 0 }),
    lines: Type.Array(Type.String()),
    truncated: Type.Optional(Type.Boolean()),
    reset: Type.Optional(Type.Boolean()),
  },
  { additionalProperties: false },
);

// WebChat/WebSocket-native chat methods
export const ChatHistoryParamsSchema = Type.Object(
  {
    sessionKey: NonEmptyString,
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 1000 })),
  },
  { additionalProperties: false },
);

export const ChatSendParamsSchema = Type.Object(
  {
    sessionKey: ChatSendSessionKeyString,
    message: Type.String(),
    thinking: Type.Optional(Type.String()),
    deliver: Type.Optional(Type.Boolean()),
    attachments: Type.Optional(Type.Array(Type.Unknown())),
    timeoutMs: Type.Optional(Type.Integer({ minimum: 0 })),
    systemInputProvenance: Type.Optional(
      Type.Object(
        {
          kind: Type.String({ enum: [...INPUT_PROVENANCE_KIND_VALUES] }),
          originSessionId: Type.Optional(Type.String()),
          sourceSessionKey: Type.Optional(Type.String()),
          sourceChannel: Type.Optional(Type.String()),
          sourceTool: Type.Optional(Type.String()),
        },
        { additionalProperties: false },
      ),
    ),
    systemProvenanceReceipt: Type.Optional(Type.String()),
    idempotencyKey: NonEmptyString,
  },
  { additionalProperties: false },
);

export const ChatAbortParamsSchema = Type.Object(
  {
    sessionKey: NonEmptyString,
    runId: Type.Optional(NonEmptyString),
  },
  { additionalProperties: false },
);

export const ChatInjectParamsSchema = Type.Object(
  {
    sessionKey: NonEmptyString,
    message: NonEmptyString,
    label: Type.Optional(Type.String({ maxLength: 100 })),
  },
  { additionalProperties: false },
);

export const ChatInteractionRequestParamsSchema = Type.Object(
  {
    sessionKey: NonEmptyString,
    interactionId: Type.Optional(NonEmptyString),
    runId: Type.Optional(Type.String()),
    kind: NonEmptyString,
    definition: Type.Unknown(),
    expiresAtMs: Type.Optional(Type.Integer({ minimum: 0 })),
  },
  { additionalProperties: false },
);

export const ChatInteractionSummaryEntrySchema = Type.Object(
  {
    question: NonEmptyString,
    answer: Type.String(),
  },
  { additionalProperties: false },
);

export const ChatInteractionSubmittedPayloadSchema = Type.Object(
  {
    version: Type.Literal(1),
    kind: NonEmptyString,
    mode: Type.Optional(NonEmptyString),
    data: Type.Record(Type.String(), Type.Unknown()),
    summary: Type.Optional(Type.Array(ChatInteractionSummaryEntrySchema)),
    displayText: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);

export const ChatInteractionStatusSchema = Type.String({
  enum: ["awaiting_user", "submitted", "consumed", "cancelled", "expired", "failed"],
});

export const ChatInteractionRecordSchema = Type.Object(
  {
    id: NonEmptyString,
    sessionKey: NonEmptyString,
    runId: Type.Optional(Type.String()),
    kind: NonEmptyString,
    definition: Type.Unknown(),
    status: ChatInteractionStatusSchema,
    createdAt: Type.Integer({ minimum: 0 }),
    updatedAt: Type.Integer({ minimum: 0 }),
    expiresAtMs: Type.Optional(Type.Integer({ minimum: 0 })),
    submittedAt: Type.Optional(Type.Integer({ minimum: 0 })),
    submittedBy: Type.Optional(Type.String()),
    submittedPayload: Type.Optional(ChatInteractionSubmittedPayloadSchema),
    resumeRunId: Type.Optional(Type.String()),
    lastResumeAtMs: Type.Optional(Type.Integer({ minimum: 0 })),
    resumeAttempts: Type.Optional(Type.Integer({ minimum: 0 })),
  },
  { additionalProperties: false },
);

export const ChatInteractionRequestResultSchema = Type.Object(
  {
    sessionKey: NonEmptyString,
    interaction: ChatInteractionRecordSchema,
  },
  { additionalProperties: false },
);

export const ChatInteractionSubmitParamsSchema = Type.Object(
  {
    sessionKey: NonEmptyString,
    interactionId: NonEmptyString,
    payload: ChatInteractionSubmittedPayloadSchema,
    submittedBy: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);

export const ChatInteractionSubmitResultSchema = Type.Object(
  {
    sessionKey: NonEmptyString,
    interaction: ChatInteractionRecordSchema,
  },
  { additionalProperties: false },
);

export const ChatInteractionListParamsSchema = Type.Object(
  {
    sessionKey: NonEmptyString,
    statuses: Type.Optional(Type.Array(Type.String(), { minItems: 1 })),
  },
  { additionalProperties: false },
);

export const ChatInteractionListResultSchema = Type.Object(
  {
    sessionKey: NonEmptyString,
    interactions: Type.Array(ChatInteractionRecordSchema),
  },
  { additionalProperties: false },
);

export const ChatInteractionConsumeParamsSchema = Type.Object(
  {
    sessionKey: NonEmptyString,
    interactionId: NonEmptyString,
  },
  { additionalProperties: false },
);

export const ChatInteractionConsumeResultSchema = Type.Object(
  {
    sessionKey: NonEmptyString,
    interaction: ChatInteractionRecordSchema,
  },
  { additionalProperties: false },
);

export const ChatInteractionRecoverParamsSchema = Type.Object(
  {
    sessionKey: NonEmptyString,
    interactionId: Type.Optional(NonEmptyString),
  },
  { additionalProperties: false },
);

export const ChatInteractionRecoverResultSchema = Type.Object(
  {
    sessionKey: NonEmptyString,
    interaction: ChatInteractionRecordSchema,
    resumedRunId: NonEmptyString,
  },
  { additionalProperties: false },
);

export const ChatInteractionRecoverStaleParamsSchema = Type.Object(
  {
    sessionKey: NonEmptyString,
    minStaleMs: Type.Optional(Type.Integer({ minimum: 0 })),
    maxAttempts: Type.Optional(Type.Integer({ minimum: 1, maximum: 20 })),
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 50 })),
  },
  { additionalProperties: false },
);

export const ChatInteractionRecoverStaleResultSchema = Type.Object(
  {
    sessionKey: NonEmptyString,
    recovered: Type.Array(
      Type.Object(
        {
          interactionId: NonEmptyString,
          resumedRunId: NonEmptyString,
        },
        { additionalProperties: false },
      ),
    ),
    scanned: Type.Integer({ minimum: 0 }),
    skipped: Type.Object(
      {
        maxAttempts: Type.Integer({ minimum: 0 }),
        tooFresh: Type.Integer({ minimum: 0 }),
        overLimit: Type.Integer({ minimum: 0 }),
        markFailed: Type.Integer({ minimum: 0 }),
      },
      { additionalProperties: false },
    ),
  },
  { additionalProperties: false },
);

export const InteractionEventSchema = Type.Object(
  {
    version: Type.Literal(1),
    phase: Type.String({
      enum: [
        "requested",
        "submitted",
        "consumed",
        "recovered",
        "recover_stale",
        "failed",
        "expired",
      ],
    }),
    sessionKey: NonEmptyString,
    interactionId: NonEmptyString,
    kind: NonEmptyString,
    status: ChatInteractionStatusSchema,
    runId: Type.Optional(Type.String()),
    payload: Type.Optional(ChatInteractionSubmittedPayloadSchema),
    definition: Type.Optional(Type.Unknown()),
    ts: Type.Integer({ minimum: 0 }),
    source: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);

export const ChatEventSchema = Type.Object(
  {
    runId: NonEmptyString,
    sessionKey: NonEmptyString,
    seq: Type.Integer({ minimum: 0 }),
    state: Type.Union([
      Type.Literal("delta"),
      Type.Literal("final"),
      Type.Literal("aborted"),
      Type.Literal("error"),
    ]),
    message: Type.Optional(Type.Unknown()),
    errorMessage: Type.Optional(Type.String()),
    usage: Type.Optional(Type.Unknown()),
    stopReason: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);
