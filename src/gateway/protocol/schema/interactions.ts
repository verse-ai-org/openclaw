import { Type } from "@sinclair/typebox";
import { NonEmptyString } from "./primitives.js";

/**
 * Payload carried inside `agent` events whose `stream === "interaction"`.
 *
 * This is the LLM → UI / channel side of the interaction protocol. The
 * shape is intentionally lax about `payload` / `data` contents — components
 * register their own Zod validators in `@openclaw/interactions`.
 */
export const InteractionRequestEventDataSchema = Type.Object(
  {
    phase: Type.Literal("request"),
    interactionId: NonEmptyString,
    component: NonEmptyString,
    payload: Type.Unknown(),
    schemaVersion: Type.Integer({ minimum: 1 }),
    cancellable: Type.Optional(Type.Boolean()),
    timeoutMs: Type.Optional(Type.Integer({ minimum: 0 })),
  },
  { additionalProperties: false },
);

export const InteractionResponseStatusSchema = Type.Union([
  Type.Literal("submitted"),
  Type.Literal("cancelled"),
  Type.Literal("timed_out"),
]);

export const InteractionResponseEventDataSchema = Type.Object(
  {
    phase: Type.Literal("response"),
    interactionId: NonEmptyString,
    status: InteractionResponseStatusSchema,
    responseBy: Type.Optional(
      Type.Object(
        {
          userId: Type.Optional(Type.String()),
          channel: Type.Optional(Type.String()),
        },
        { additionalProperties: false },
      ),
    ),
    data: Type.Unknown(),
  },
  { additionalProperties: false },
);

/**
 * Parameters for `chat.interactionRespond`. Idempotency is enforced
 * server-side via `interactionId`: once a non-pending status is recorded,
 * subsequent calls return the first-writer's result.
 */
export const ChatInteractionRespondParamsSchema = Type.Object(
  {
    sessionKey: NonEmptyString,
    interactionId: NonEmptyString,
    status: Type.Optional(
      Type.Union([Type.Literal("submitted"), Type.Literal("cancelled")]),
    ),
    data: Type.Unknown(),
    responseBy: Type.Optional(
      Type.Object(
        {
          userId: Type.Optional(Type.String()),
          channel: Type.Optional(Type.String()),
        },
        { additionalProperties: false },
      ),
    ),
  },
  { additionalProperties: false },
);

export const ChatInteractionRespondResultSchema = Type.Object(
  {
    interactionId: NonEmptyString,
    status: InteractionResponseStatusSchema,
    alreadyResolved: Type.Boolean(),
  },
  { additionalProperties: false },
);
